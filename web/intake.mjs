// Free text in, frozen case file out.
//
// The four reviewers only ever see templates/case-template.yaml fields. A paste box therefore
// needs one translation step. That step is allowed to REPHRASE and to SORT. It is not allowed
// to invent: anything the author did not say becomes a critical_unknown, and every evidence
// item keeps the author as collected_by, because a submitted plan is by definition the
// interested party's own account.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { runIsolated } from '../lib/claude.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const SYSTEM = `You turn one person's description of a decision into a due-diligence case file.

Output ONLY a YAML document. No commentary, no code fence.

Rules you may not break:
1. Never add a fact the author did not state. If a field has no support in their text, leave it
   empty ("") and add the missing thing to critical_unknowns instead.
2. Every evidence item is the author's own account until proven otherwise: collected_by is the
   author, and limit says what that item does NOT establish.
3. Do not soften and do not sharpen. If they wrote "everyone wants this", the evidence item is
   type stated-intent with n unknown, not a demand claim.
4. current_alternatives must include what the customer does today even if that is "nothing".
5. Keep their own words in claimed_problem where you can.

Schema (fill every key, empty string or empty list when unsupported):

case_id: WEB-<slug>
version: v1.0
author: "web submission"
date: "<today>"
customer: ""
moment: ""
claimed_problem: ""
proposed_outcome: ""
business_claim: ""
viral_claim: ""
current_alternatives: []
critical_unknowns: []
evidence:
  - id: E01
    type: paid | costly-action | stated-intent | attention | analogy
    fact: ""
    source: ""
    collected_by: ""
    n: ""
    limit: ""
decision_on_the_table: ""
reversibility: ""`;

export async function intake(text, { model = 'sonnet' } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const slug = createHash('sha256').update(text).digest('hex').slice(0, 8);
  const yaml = (await runIsolated(SYSTEM.replace('<today>', today), text, { model }))
    .replace(/^```[a-z]*\n?/i, '')
    .replace(/```\s*$/, '')
    .trim();

  // The translator runs through the CLI, and a CLI that is logged out still answers with a
  // sentence. A case file without the fields the reviewers read is not a case file.
  if (!/claimed_problem:/.test(yaml) || !/evidence:/.test(yaml)) {
    throw new Error(
      /authenticate|OAuth/i.test(yaml)
        ? 'The Claude CLI is not logged in on this machine. Run `claude login` in a terminal, then try again.'
        : `intake did not produce a case file: ${yaml.slice(0, 200)}`,
    );
  }

  const dir = join(ROOT, 'cases', 'inbox');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `WEB-${slug}.yaml`);
  const withId = yaml.includes('case_id:') ? yaml.replace(/^case_id:.*$/m, `case_id: WEB-${slug}`) : `case_id: WEB-${slug}\n${yaml}`;
  writeFileSync(file, withId);
  return { file, caseId: `WEB-${slug}`, yaml: withId };
}

export function readCase(file) {
  return readFileSync(file, 'utf8');
}
