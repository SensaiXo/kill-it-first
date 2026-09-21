// Intake gate. Five typed questions to Jev, one routing decision, no grade.
//
// Deliberately NOT a score. A 0-100 number would invent precision the input does not carry,
// and the engine's only defensible edge is restraint. So the gate answers one question:
// is this worth four blind reviewers, or is the honest answer something cheaper?
//
// Routes:
//   more     - cannot be judged yet: say what is missing
//   just-try - reversible and cheap: running a review costs more than the mistake would
//   run      - a real commitment with evidence attached: hand it to the four lenses

import { jev, jevConfigured } from '../models/jev.mjs';

export const SCREEN_QUESTIONS = {
  understandable: {
    type: 'noul',
    instructions: 'A careful reader can tell from `plan` what is being proposed and what decision is on the table.',
    criteria: { true: 'The proposal and the decision are both clear', false: 'Too vague to judge' },
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
  evidence: {
    type: 'score',
    instructions: 'How much real-world evidence does `plan` carry for its central claim?',
    criteria: [
      'None: only what the author believes.',
      'Opinions and conversations, none of them costly to the other side.',
      'Some observed behaviour, small numbers, collected by an interested party.',
      'Behaviour that cost someone something, with sources named.',
      'People already paying or already doing it, with receipts.',
    ],
  },
  stakes: {
    type: 'score',
    instructions: 'How large is the commitment in `plan` relative to a small company?',
    criteria: [
      'Pocket change and a weekend.',
      'A few thousand francs or a couple of weeks.',
      'A month of work or a five-figure sum.',
      'A quarter of the year, a hire, or a large contract.',
      'Bet-the-company.',
    ],
  },
};

export async function screen(planText) {
  const r = await jev(planText, SCREEN_QUESTIONS);
  const a = r.answers;
  const understandable = a.understandable?.noul ?? 0;
  const isDecision = a.is_decision?.noul ?? 0;
  const reversibility = a.reversibility?.score ?? 0;
  const evidence = a.evidence?.score ?? 0;
  const stakes = a.stakes?.score ?? 0;

  let route, because;
  if (understandable < 0.5) {
    route = 'more';
    because = 'Nobody could tell what is being proposed. Say what you would do, for whom, and what you would spend.';
  } else if (isDecision < 0.4) {
    route = 'more';
    because = 'There is no decision here yet, only a topic. Name the thing you are about to commit to.';
  } else if (reversibility < 1.5 && stakes < 1.5) {
    route = 'just-try';
    because = 'This is cheap and you can undo it. A review would cost more than the mistake. Go and try it, then come back with what happened.';
  } else {
    route = 'run';
    because = evidence < 1.5
      ? 'A real commitment resting on very little evidence. This is the case the four lenses exist for.'
      : 'A real commitment with evidence attached. Worth four separate passes before you sign.';
  }

  return {
    route,
    because,
    mock: r.mock === true || !jevConfigured(),
    model: r.model,
    signals: { understandable, isDecision, reversibility, evidence, stakes },
    usage: r.usage,
  };
}
