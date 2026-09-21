// One isolated headless Claude call: no tools, no settings, no CLAUDE.md, no session memory,
// empty working directory. Same isolation run.mjs enforces for the four reviewers, extracted
// so the intake step cannot quietly run with more context than a reviewer gets.
// test/blindness.mjs is the proof that these flags are the ones that matter.

import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export function runIsolated(systemPrompt, userPrompt, { model = 'sonnet' } = {}) {
  const sandbox = mkdtempSync(join(tmpdir(), 'pdde-web-'));
  writeFileSync(join(sandbox, 'isolation.json'), JSON.stringify({ hooks: {}, enabledPlugins: {}, disableAllHooks: true }));
  const sysFile = join(sandbox, 'sys.md');
  writeFileSync(sysFile, systemPrompt);
  return new Promise((resolve, reject) => {
    const cli = process.platform === 'win32' ? 'claude.cmd' : 'claude';
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
      {
        cwd: sandbox,
        shell: process.platform === 'win32',
        env: { ...process.env, CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1', CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1' },
      },
    );
    let out = '', err = '';
    child.stdout.on('data', (d) => {
      for (const line of d.toString().split('\n')) {
        if (!line.trim()) continue;
        try {
          const ev = JSON.parse(line);
          if (ev.type === 'assistant') {
            const text = (ev.message?.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
            if (text) out = text;
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
