# Web front door

One text box instead of a YAML file. Local only.

```
node web/server.mjs            # http://127.0.0.1:5317
node web/server.mjs --model opus --port 8080
```

It binds to `127.0.0.1` on purpose, and there is no hosted version. Taking other people's plans
over the internet needs a consent notice, a pseudonymisation rule and a takedown path, and none of
that is here. Run it on your own machine with your own key and the plan never leaves it.

## What happens to a submission

1. **Intake gate** (`screen.mjs`) — a readiness map, not a grade. Jev marks each of the six areas
   the reviewers actually read (who exactly, proof it is real, who pays, how they hear, what they
   do today, what it costs you) as covered, thin or missing, each gap carrying the one sentence
   that closes it, and routes the submission to *not enough on the page yet*, *just try it, you
   can undo this*, or *ready for the four reviewers*. It measures how much has been written down,
   never how good the idea is, and the page says so. No composite number anywhere: a made-up
   score is exactly the thing this project exists to refuse.
2. **Translation** (`intake.mjs`) — the free text becomes a case file with the fields the four
   reviewers read. It may rephrase and sort; it may not invent. Anything the author did not say
   becomes a `critical_unknown`, and every evidence item keeps the author as `collected_by`,
   because a submitted plan is the interested party's own account.
3. **The run** — `run.mjs` unchanged: four blind reviewers in four separate processes, then the
   synthesiser. The page shows each lens as it finishes.
4. **Ledger** — the second tab is `RUNS.md`: every verdict ever recorded, written before reality
   answered.

Submitted cases land in `cases/inbox/` and are git-ignored. They are **not frozen**: the runner
is called with `--allow-unfrozen`, so a web run has a fingerprint but no commit behind it. Only a
committed case belongs in the ledger.

## Jev

[TypeSafe's System One model](https://docs.typesafe.ai/api.md). It answers typed questions —
a boolean with a probability, a choice, a position on a scale — and returns confidence with each.
That is the right shape for a cheap intake gate and the wrong shape for a verdict, which is why it
never touches the review itself.

```
setx TYPESAFE_API_KEY "..."     # Windows, new shell afterwards
export TYPESAFE_API_KEY=...     # macOS/Linux
```

The key comes from typesafe.ai directly (early access since 2026-09-15), not from Vercel or
OpenRouter. Without a key the gate runs in **mock mode**: deterministic fake numbers, labelled as
fake in the interface, so the page can be worked on without an account. Mock output is never
presented as a result.

## Known limits

- The four reviewers need a logged-in Claude CLI. If the login has expired, the page says so
  instead of producing an empty review.
- A run takes minutes. The page polls; it does not stream tokens.
- Jobs live in memory. Restart the server and running jobs are lost — the reports stay in `runs/`.
