// Local web front door for the engine. No dependencies, no database, no account.
//
// One text box in, one run out. The server owns three things the command line does not give
// you: the intake translation, the Jev gate that decides whether a run is even warranted, and
// a live view of the four reviewers while they work.
//
// It binds to 127.0.0.1 on purpose. Taking other people's plans over the internet needs a consent
// notice, a pseudonymisation rule and a takedown path, none of which exist here.
//
// Usage: node web/server.mjs [--port 5317] [--model sonnet]

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { screen } from './screen.mjs';
import { intake } from './intake.mjs';
import { jevConfigured } from '../models/jev.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const PORT = Number(args.includes('--port') ? args[args.indexOf('--port') + 1] : 5317);
const MODEL = args.includes('--model') ? args[args.indexOf('--model') + 1] : 'sonnet';
const LENSES = ['outcome', 'lifecycle', 'authority', 'evidence'];
const MAX_CHARS = 60000;

const jobs = new Map();

// ---- ledger --------------------------------------------------------------------------
// RUNS.md is the only record that counts: a verdict written down before reality answered.
function ledger() {
  const rows = readFileSync(join(ROOT, 'RUNS.md'), 'utf8')
    .split('\n')
    .filter((l) => /^\|\s*20\d\d-/.test(l))
    .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()))
    .map(([date, caseName, version, commit, verdict, note]) => ({
      date, case: caseName, version, commit, verdict, note,
      word: (verdict.match(/KILL|HOLD|VALIDATE|ADVANCE/) || ['-'])[0],
    }));
  const counts = {};
  for (const r of rows) counts[r.word] = (counts[r.word] || 0) + 1;
  return { rows, counts, total: rows.length };
}

// ---- run -----------------------------------------------------------------------------
function startRun(job) {
  const before = new Set(existsSync(join(ROOT, 'runs')) ? readdirSync(join(ROOT, 'runs')) : []);
  const child = spawn(process.execPath, ['run.mjs', job.caseFile, '--model', MODEL, '--allow-unfrozen'], {
    cwd: ROOT,
    env: { ...process.env, FORCE_COLOR: '0' },
  });
  job.stage = 'reviewing';
  let tail = '';
  child.stdout.on('data', (d) => {
    // The runner paints its progress with ANSI escapes, so the path it prints at the end
    // carries a colour reset. Strip that before treating it as a filename.
    tail = (tail + d.toString().replace(/\[[0-9;]*[A-Za-z]/g, '')).slice(-4000);
    const dir = (tail.match(/reports:\s*(.+)/) || [])[1];
    if (dir && existsSync(dir.trim())) job.dir = dir.trim();
  });
  child.stderr.on('data', (d) => (job.stderr = ((job.stderr || '') + d).slice(-2000)));

  // The runner writes each reviewer's file the moment that reviewer finishes, so the run
  // directory itself is the progress bar. No extra protocol needed.
  const watch = setInterval(() => {
    if (!job.dir) {
      const now = readdirSync(join(ROOT, 'runs')).filter((d) => !before.has(d) && d.startsWith(job.caseId));
      if (now.length) job.dir = join(ROOT, 'runs', now.sort().at(-1));
    }
    if (!job.dir || !existsSync(job.dir)) return;
    const files = readdirSync(job.dir);
    job.lenses = Object.fromEntries(LENSES.map((k) => [
      k,
      files.includes(`${k}.md`) ? 'done' : files.includes(`${k}.ERROR.txt`) ? 'failed' : 'thinking',
    ]));
    if (files.includes('synthesis.md')) job.stage = 'synthesising';
  }, 700);

  child.on('close', (code) => {
    clearInterval(watch);
    const synthFile = job.dir && join(job.dir, 'synthesis.md');
    const synthesis = synthFile && existsSync(synthFile) ? readFileSync(synthFile, 'utf8') : '';
    // A reviewer whose process dies still writes a file. A report with no VERDICT line is a
    // failure wearing a success's clothes, so it is counted as one.
    const usable = synthesis.length > 400 && /VERDICT:/.test(synthesis);
    if (usable) {
      job.stage = 'done';
      job.synthesis = synthesis;
      job.verdict = (synthesis.match(/VERDICT:\s*(KILL|HOLD|VALIDATE|ADVANCE)/) || [])[1] || 'UNKNOWN';
      job.reports = Object.fromEntries(
        LENSES.filter((k) => existsSync(join(job.dir, `${k}.md`))).map((k) => [k, readFileSync(join(job.dir, `${k}.md`), 'utf8')]),
      );
    } else {
      job.stage = 'failed';
      job.error = /authenticate|OAuth/i.test(synthesis + (job.stderr || ''))
        ? 'The Claude CLI is not logged in on this machine. Run `claude login` in a terminal, then try again.'
        : (job.stderr || synthesis.slice(0, 300) || `runner exited ${code}`);
    }
  });
}

// ---- http ----------------------------------------------------------------------------
const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};
const readBody = (req) =>
  new Promise((resolve, reject) => {
    let b = '';
    req.on('data', (d) => {
      b += d;
      if (b.length > MAX_CHARS * 2) { reject(new Error('too large')); req.destroy(); }
    });
    req.on('end', () => resolve(b));
    req.on('error', reject);
  });

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const html = readFileSync(join(ROOT, 'web', 'app.html'));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(html);
    }

    if (req.method === 'GET' && url.pathname === '/api/state') {
      return json(res, 200, { jev: jevConfigured() ? 'live' : 'mock', model: MODEL, ledger: ledger() });
    }

    if (req.method === 'POST' && url.pathname === '/api/screen') {
      const { text } = JSON.parse(await readBody(req));
      if (!text || text.trim().length < 20) return json(res, 400, { error: 'Write a few sentences about the decision first.' });
      return json(res, 200, await screen(text.slice(0, MAX_CHARS)));
    }

    if (req.method === 'POST' && url.pathname === '/api/run') {
      const { text } = JSON.parse(await readBody(req));
      if (!text || text.trim().length < 20) return json(res, 400, { error: 'Write a few sentences about the decision first.' });
      const id = randomUUID().slice(0, 8);
      const job = { id, stage: 'intake', lenses: Object.fromEntries(LENSES.map((k) => [k, 'waiting'])), started: Date.now() };
      jobs.set(id, job);
      intake(text.slice(0, MAX_CHARS), { model: MODEL })
        .then(({ file, caseId, yaml }) => {
          job.caseFile = file;
          job.caseId = caseId;
          job.yaml = yaml;
          startRun(job);
        })
        .catch((e) => {
          job.stage = 'failed';
          job.error = String(e.message || e);
        });
      return json(res, 200, { id });
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/run/')) {
      const job = jobs.get(url.pathname.split('/').pop());
      if (!job) return json(res, 404, { error: 'unknown job' });
      const { id, stage, lenses, verdict, synthesis, reports, yaml, error, caseId, started } = job;
      return json(res, 200, { id, stage, lenses, verdict, synthesis, reports, yaml, error, caseId, seconds: Math.round((Date.now() - started) / 1000) });
    }

    res.writeHead(404).end('not found');
  } catch (e) {
    json(res, 500, { error: String(e.message || e) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Problem Due-Diligence  http://127.0.0.1:${PORT}`);
  console.log(`model ${MODEL} · intake gate ${jevConfigured() ? 'Jev (live)' : 'Jev (MOCK - no TYPESAFE_API_KEY)'}`);
});
