// Jev adapter — TypeSafe's System One model (https://docs.typesafe.ai/api.md).
//
// Jev answers TYPED questions: a boolean with a probability ("noul"), a choice with
// probabilities, or a position on an ordered scale with a confidence. It does not write prose.
// That is exactly the right shape for a cheap intake gate and exactly the wrong shape for a
// verdict, so it is used here only to decide whether a submission is worth a full run.
//
// No key configured => mock mode. The mock is deterministic (hash of the text), so the UI and
// the tests behave the same way without an account.

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const MODEL = process.env.JEV_MODEL || 'jev-latest';

export const jevConfigured = () => Boolean(process.env.TYPESAFE_API_KEY);

export async function jev(state, questions, { timeoutMs = 20000 } = {}) {
  if (!jevConfigured()) return mock(state, questions);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.TYPESAFE_API_KEY}`,
      },
      body: JSON.stringify({ state, model: MODEL, questions }),
      signal: ctl.signal,
    });
    if (!res.ok) throw new Error(`jev ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = await res.json();
    return { ...body, mock: false };
  } finally {
    clearTimeout(timer);
  }
}

// ---- mock ----------------------------------------------------------------------------
// Deterministic pseudo-answers. Never presented as real: every caller carries `mock: true`
// through to the UI, which labels it.
function mock(state, questions) {
  let h = 0;
  for (const ch of state) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const pick = (i, n) => (((h >>> (i * 3)) % 1000) / 1000) * n;
  const answers = {};
  Object.entries(questions).forEach(([key, q], i) => {
    if (q.type === 'noul') {
      answers[key] = { type: 'noul', noul: Math.min(0.97, 0.15 + pick(i, 0.8)) };
    } else if (q.type === 'choice') {
      const opts = Object.keys(q.criteria);
      answers[key] = { type: 'choice', choice: opts[Math.floor(pick(i, opts.length)) % opts.length], confidence: 0.5 };
    } else {
      const max = q.criteria.length - 1;
      answers[key] = { type: 'score', score: pick(i, max), confidence: 0.5 };
    }
  });
  return { model: 'mock', answers, usage: { input_tokens: 0, output_tokens: 0 }, mock: true };
}
