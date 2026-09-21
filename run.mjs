#!/usr/bin/env node
// Kill It First runner.
// Spawns the four blind reviewers as four SEPARATE headless Claude processes, each with:
//   - no tools (cannot read files, browse, or run anything)
//   - no project/user settings, no CLAUDE.md, no MCP servers, no hooks (settings off), no session memory
//   - only its own prompt file + the frozen case text in its context
// Then runs the synthesiser on the four reports. Blindness is enforced by the process
// boundary, not by a sentence in the prompt.
//
// Usage:  node run.mjs cases/backtest/CASE-BT-A.yaml [--model sonnet] [--keep]
// Output: runs/<case_id>-<version>-<timestamp>/{outcome,lifecycle,authority,evidence,synthesis}.md
// Requires: Claude Code CLI on PATH (`claude --version`), Node 18+. No npm dependencies.

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const caseFile = args.find((a) => !a.startsWith('--'));
const model = args.includes('--model') ? args[args.indexOf('--model') + 1] : 'opus';
if (!caseFile) {
  console.error('usage: node run.mjs <case.yaml> [--model opus|sonnet]');
  process.exit(1);
}

const REVIEWERS = [
  { key: 'outcome',   emoji: '🎯', name: 'Outcome & Premise',     prompt: 'outcome-premise.md',     slot: 'REPORT_OUTCOME' },
  { key: 'lifecycle', emoji: '🔁', name: 'Lifecycle & Mechanism', prompt: 'lifecycle-mechanism.md', slot: 'REPORT_LIFECYCLE' },
  { key: 'authority', emoji: '🛡️', name: 'Authority & Boundary',  prompt: 'authority-boundary.md',  slot: 'REPORT_AUTHORITY' },
  { key: 'evidence',  emoji: '🔬', name: 'Evidence Validity',     prompt: 'evidence-validity.md',   slot: 'REPORT_EVIDENCE' },
];
const COLORS = ['\x1b[36m', '\x1b[35m', '\x1b[33m', '\x1b[32m']; // cyan magenta yellow green
const RESET = '\x1b[0m', DIM = '\x1b[2m', BOLD = '\x1b[1m';
const SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

// ---- load + freeze check -------------------------------------------------------------
const caseText = readFileSync(caseFile, 'utf8');
const caseId = (caseText.match(/^case_id:\s*(\S+)/m) || [])[1] || 'CASE';
const version = (caseText.match(/^version:\s*(\S+)/m) || [])[1] || 'v0';
// Freeze check. With git: the case must be committed and unchanged. Without git (ZIP download):
// the run records a SHA-256 fingerprint of the case file instead, so any later edit is visible.
let commit = 'uncommitted', inGit = false;
try {
  execSync('git rev-parse --is-inside-work-tree', { cwd: ROOT, stdio: 'pipe' });
  inGit = true;
  commit = execSync(`git log -1 --format=%h -- "${caseFile}"`, { cwd: ROOT }).toString().trim() || 'uncommitted';
  const dirty = execSync(`git status --porcelain -- "${caseFile}"`, { cwd: ROOT }).toString().trim();
  if (dirty) commit = 'uncommitted';
} catch {}
const fingerprint = createHash('sha256').update(caseText).digest('hex').slice(0, 12);
if (!inGit) {
  commit = `sha256:${fingerprint}`;
  console.log(`${DIM}no git here: freezing by fingerprint ${commit} (keep the file unchanged; any edit = new version)${RESET}`);
} else if (commit === 'uncommitted') {
  console.log(`${BOLD}⚠  case is not frozen${RESET} (not committed, or edited since). Commit it first so the run references a hash.`);
  if (!args.includes('--allow-unfrozen')) process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = join(ROOT, 'runs', `${caseId}-${version}-${stamp}`);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'case.frozen.yaml'), `# frozen ${commit} fingerprint sha256:${fingerprint}
` + caseText);

// Each process gets an EMPTY working directory so no CLAUDE.md, .claude/ or repo file is in reach.
const sandbox = mkdtempSync(join(tmpdir(), 'pdde-'));
let sysCount = 0;
// --setting-sources '' alone still lets user hooks, plugins and the global CLAUDE.md in
// (verified by test/blindness.mjs). This override switches them off without --bare, which
// requires an API key instead of a normal login.
writeFileSync(join(sandbox, 'isolation.json'), JSON.stringify({ hooks: {}, enabledPlugins: {}, disableAllHooks: true }));


// ---- one isolated reviewer process ---------------------------------------------------
function runIsolated(systemPrompt, userPrompt, onChunk) {
  return new Promise((resolve, reject) => {
    const cli = process.platform === 'win32' ? 'claude.cmd' : 'claude';
    // Passed as a file: multi-line text as a command-line argument gets mangled on Windows.
    const sysFile = join(sandbox, `sys-${++sysCount}.md`);
    writeFileSync(sysFile, systemPrompt);
    const child = spawn(
      cli,
      [
        '-p',
        '--tools', '',
        '--setting-sources', '', '--settings', join(sandbox, 'isolation.json'),
        '--strict-mcp-config',
        '--no-session-persistence',
        '--disable-slash-commands',
        '--model', model,
        '--output-format', 'stream-json', '--verbose',
        '--system-prompt-file', sysFile,
      ],
      { cwd: sandbox, shell: process.platform === 'win32', env: { ...process.env, CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1', CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1' } },
    );
    let out = '', err = '';
    child.stdout.on('data', (d) => {
      for (const line of d.toString().split('\n')) {
        if (!line.trim()) continue;
        try {
          const ev = JSON.parse(line);
          if (ev.type === 'assistant') {
            const text = (ev.message?.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
            if (text) { out = text; onChunk(text.length); }
          }
          if (ev.type === 'result' && ev.result) out = ev.result;
        } catch {}
      }
    });
    child.stderr.on('data', (d) => (err += d));
    child.on('close', (code) => (code === 0 || out ? resolve(out) : reject(new Error(err || `exit ${code}`))));
    child.stdin.end(userPrompt);
  });
}

// ---- progress display ----------------------------------------------------------------
const state = REVIEWERS.map(() => ({ chars: 0, done: false, verdict: '', start: Date.now(), fail: false }));
let frame = 0;
function render(final = false) {
  const lines = REVIEWERS.map((r, i) => {
    const s = state[i];
    const c = COLORS[i];
    const secs = ((Date.now() - s.start) / 1000).toFixed(0).padStart(3);
    const bar = '█'.repeat(Math.min(20, Math.floor(s.chars / 250))).padEnd(20, '░');
    const status = s.fail ? '❌ failed' : s.done ? (s.verdict === 'BLOCKING' ? '🟥 BLOCKING' : '🟩 PASS') : `${SPIN[frame % SPIN.length]} thinking`;
    return `${c}${r.emoji} ${r.name.padEnd(22)}${RESET} ${bar} ${DIM}${secs}s${RESET}  ${status}`;
  });
  process.stdout.write(`\x1b[${REVIEWERS.length}A\x1b[0J` + lines.join('\n') + '\n');
  if (!final) frame++;
}

// ---- run ------------------------------------------------------------------------------
console.log(`${BOLD}Kill It First run${RESET}  case ${caseId} ${version}  frozen@${commit}  model ${model}`);
console.log(`${DIM}4 blind reviewers, 4 separate processes, empty sandbox ${sandbox}${RESET}\n`);
console.log('\n'.repeat(REVIEWERS.length - 1));
const ticker = setInterval(render, 90);

const reports = await Promise.all(
  REVIEWERS.map(async (r, i) => {
    const promptFile = readFileSync(join(ROOT, 'prompts', r.prompt), 'utf8');
    const [system, tail] = promptFile.split(/^## Frozen Problem Case.*$/m);
    const user = (tail || '{{CASE}}').replace('{{CASE}}', caseText).trim() || caseText;
    try {
      const text = await runIsolated(system.trim(), user, (n) => (state[i].chars = n));
      const m = text.match(/VERDICT:\s*(PASS|BLOCKING)/);
      state[i].verdict = m ? m[1] : 'UNKNOWN';
      state[i].done = true;
      writeFileSync(join(outDir, `${r.key}.md`), text);
      return text;
    } catch (e) {
      state[i].fail = true;
      writeFileSync(join(outDir, `${r.key}.ERROR.txt`), String(e));
      return `(reviewer failed: ${e.message})`;
    }
  }),
);
clearInterval(ticker);
render(true);

// ---- synthesiser (sees case + 4 reports, nothing else) --------------------------------
process.stdout.write(`\n🧩 ${BOLD}Synthesiser${RESET} ${DIM}merging four reports…${RESET}`);
const synthFile = readFileSync(join(ROOT, 'prompts', 'synthesiser.md'), 'utf8');
const [synthSystem, synthTail] = synthFile.split(/^## Inputs.*$/m);
let synthUser = synthTail.replace('{{CASE}}', caseText);
REVIEWERS.forEach((r, i) => (synthUser = synthUser.replace(`{{${r.slot}}}`, reports[i])));
const synthesis = await runIsolated(synthSystem.trim(), synthUser.trim(), () => process.stdout.write('.'));
writeFileSync(join(outDir, 'synthesis.md'), synthesis);
const verdict = (synthesis.match(/VERDICT:\s*(KILL|HOLD|VALIDATE|ADVANCE)/) || [])[1] || 'UNKNOWN';
const face = { KILL: '💀', HOLD: '⏸️', VALIDATE: '🧪', ADVANCE: '🚀' }[verdict] || '❓';
console.log(`\n\n${face} ${BOLD}VERDICT: ${verdict}${RESET}   (${state.filter((s) => s.verdict === 'BLOCKING').length}/4 reviewers BLOCKING)`);
console.log(`${DIM}reports: ${outDir}${RESET}`);
console.log(`${DIM}ledger line for RUNS.md:${RESET}\n| ${stamp.slice(0, 10)} | ${caseId} | ${version} | ${commit} | ${verdict} (${state.filter((s) => s.verdict === 'BLOCKING').length}/4 BLOCKING) | open |`);

if (!args.includes('--keep')) rmSync(sandbox, { recursive: true, force: true });
