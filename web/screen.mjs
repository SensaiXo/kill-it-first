// Intake gate: a readiness map, not a grade.
//
// Two different questions get confused constantly, so this file keeps them apart:
//
//   "How good is this idea?"     - the four reviewers answer that, after you run them.
//   "Have you said enough yet?"  - this gate answers that, in seconds, before you spend a run.
//
// The area map below measures only the SECOND one. An area comes back thin because the text is
// thin, not because the business is weak: a strong idea described in two sentences maps the same
// as a doomed one. Claiming otherwise would be the invented precision this project exists to
// refuse, so the interface says it in those words too.
//
// One question is different and is kept apart on purpose: reversibility asks about the decision
// itself, not about the writing. It is what lets the gate say "just go and try it" instead of
// charging someone four reviewers for a mistake they could undo in an afternoon.
//
// Routes:
//   more      - not enough on the page yet; the map says exactly what is missing
//   just-try  - cheap and reversible; a review would cost more than the mistake
//   run       - hand it to the four lenses

import { jev, jevConfigured } from '../models/jev.mjs';

// The six areas the four reviewers actually read. Not a business-plan template: each one maps to
// something a lens will ask for, so a gap here becomes a run spent asking questions.
export const AREAS = [
  {
    key: 'customer',
    label: 'Who exactly',
    ask: 'How precisely does `plan` say who has this problem?',
    levels: [
      'Nobody is named; it could be anyone.',
      'A broad category like "businesses" or "consumers".',
      'A recognisable group, loosely drawn.',
      'A specific kind of person you could go and find.',
      'A named niche, with the moment they hit the problem.',
    ],
    fix: 'Name the exact person and the moment they hit this. "Everyone" reads as nobody.',
  },
  {
    key: 'evidence',
    label: 'Proof it is real',
    ask: 'How much real-world evidence does `plan` carry that the problem exists?',
    levels: [
      'None: only what the author believes.',
      'Opinions and conversations that cost the other side nothing.',
      'Some observed behaviour, small numbers, gathered by an interested party.',
      'Behaviour that cost someone something, with sources named.',
      'People already paying or already doing it, with receipts.',
    ],
    fix: 'Add one thing somebody actually did about this, not what they said they would do.',
  },
  {
    key: 'money',
    label: 'Who pays',
    ask: 'How clearly does `plan` say who pays, how much, and how often?',
    levels: [
      'Money is not mentioned.',
      'A vague intention to charge somebody.',
      'A price or a model, but not who signs.',
      'Payer, price and rhythm are all stated.',
      'Payer, price, rhythm, and what it replaces in their budget.',
    ],
    fix: 'Say who signs the invoice, what it costs them, and how often.',
  },
  {
    key: 'reach',
    label: 'How they hear',
    ask: 'How concretely does `plan` say how these people would be reached?',
    levels: [
      'No route to customers is mentioned at all.',
      'Channels named as a wish list, with no access to any of them.',
      'One plausible route, untested.',
      'A route with a reason to believe it, or one already in use.',
      'A route the author already has and can measure.',
    ],
    fix: 'Say where these people already gather and what access you already have there.',
  },
  {
    key: 'alternatives',
    label: 'What they do today',
    ask: 'How well does `plan` describe what these people do about this today?',
    levels: [
      'Today is not described; it reads as if nothing exists.',
      'Competitors listed by name, with nothing about the habit.',
      'The current workaround is named.',
      'The current workaround is described with its cost.',
      'The current workaround, its cost, and why people tolerate it.',
    ],
    fix: 'Describe what they do about this today, even if the answer is "they live with it".',
  },
  {
    key: 'commitment',
    label: 'What it costs you',
    ask: 'How clearly does `plan` state what is being committed - money, time, term?',
    levels: [
      'Nothing about time, money or commitment.',
      'A gesture at effort, no numbers.',
      'Either the spend or the term, not both.',
      'What is committed and roughly for how long.',
      'Spend, term, exit cost, and who else is affected.',
    ],
    fix: 'Say what you commit, for how long, and what it costs to walk away.',
  },
];

// Questions about the decision itself rather than about the writing.
const GATES = {
  understandable: {
    type: 'noul',
    instructions: 'A careful reader can tell from `plan` what is being proposed.',
    criteria: { true: 'The proposal is clear', false: 'Too vague to judge' },
  },
  is_decision: {
    type: 'noul',
    instructions: '`plan` describes a decision someone is about to take, not a finished thing or a general question.',
    criteria: { true: 'A decision is pending', false: 'No pending decision' },
  },
  reversibility: {
    type: 'score',
    instructions: 'If the decision in `plan` turns out to be wrong, how hard is it to undo?',
    criteria: [
      'Undone in an afternoon, nothing lost but time.',
      'A few days of work and some money back out.',
      'Money and time are gone, but the business carries on.',
      'A long contract, a hire or a public commitment: painful to unwind.',
      'Effectively permanent within the next year.',
    ],
  },
};

export const SCREEN_QUESTIONS = {
  ...GATES,
  ...Object.fromEntries(AREAS.map((a) => [a.key, { type: 'score', instructions: a.ask, criteria: a.levels }])),
};

// 0-4 folded into three words someone can act on. Three and not a percentage on purpose: the
// difference between 2.4 and 2.6 is not something a paragraph of prose can support.
const band = (score) => (score >= 2.5 ? 'covered' : score >= 1.2 ? 'thin' : 'missing');

const list = (xs) => xs.map((x) => x.label.toLowerCase()).join(', ').replace(/, ([^,]*)$/, ' and $1');

export async function screen(planText) {
  const r = await jev(planText, SCREEN_QUESTIONS);
  const a = r.answers || {};
  const understandable = a.understandable?.noul ?? 0;
  const isDecision = a.is_decision?.noul ?? 0;
  const reversibility = a.reversibility?.score ?? 0;

  const areas = AREAS.map((area) => {
    const score = a[area.key]?.score ?? 0;
    const state = band(score);
    return {
      key: area.key,
      label: area.label,
      state,
      score,
      confidence: a[area.key]?.confidence ?? null,
      fix: state === 'covered' ? null : area.fix,
    };
  });

  const missing = areas.filter((x) => x.state === 'missing');
  const thin = areas.filter((x) => x.state === 'thin');
  const covered = areas.filter((x) => x.state === 'covered');

  let route, because;
  if (understandable < 0.5) {
    route = 'more';
    because = 'Nobody could tell what is being proposed. Start with what you would do, and for whom.';
  } else if (isDecision < 0.4) {
    route = 'more';
    because = 'This is a topic, not a decision. Name the thing you are about to commit to.';
  } else if (missing.length >= 3) {
    route = 'more';
    because = `Four reviewers would spend the whole run asking for ${list(missing)}. Fill those in first and you get findings back instead of questions.`;
  } else if (reversibility < 1.5) {
    route = 'just-try';
    because = 'You can undo this. A review would cost more than the mistake. Go and try it, then come back with what happened.';
  } else if (missing.length + thin.length === 0) {
    route = 'run';
    because = 'Every area a reviewer will ask about is answered. Run it.';
  } else {
    route = 'run';
    because = `Enough to run. Expect the weakest findings on ${list([...missing, ...thin])} — that is where your text is thinnest, which is not the same as where the idea is weakest.`;
  }

  return {
    route,
    because,
    areas,
    tally: { covered: covered.length, thin: thin.length, missing: missing.length, total: AREAS.length },
    mock: r.mock === true || !jevConfigured(),
    model: r.model,
    gates: { understandable, isDecision, reversibility },
    usage: r.usage,
  };
}
