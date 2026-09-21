# Evidence summary (public)

The underlying cases are one operator's real business decisions (pricing, client counts,
audience size) and stay private. What can be stated:

| What | n | Result | Limit |
|---|---|---|---|
| Method benchmark, code/document review (original domain) | 5 commits | up to 14 issues vs 1 on claims-heavy diffs; lost on plain code | different domain |
| Backtests, business decisions | 4 (3 failed, 1 held) | 4/4 verdicts in accepted set; real reason found blind 4/4 | reconstructed and scored by the interested party; one model family |
| Control: one blunt chat, same isolation | same 4 | 3/4 | ties the engine on 3; both miss the same case the same way |
| Self-review of the launch plan | 2 runs | 4/4 BLOCKING both times (HOLD, then VALIDATE) | the author's own plan |
| Blindness proof (`test/blindness.mjs`) | every runner change | passes: zero tools, no project files, no other reports reach a reviewer | proves isolation, not judgement |
| Run-to-run variance | 1 case, 2 runs | KILL, then VALIDATE | run twice before acting |
| Overnight batch, 5 domains (frontend, backend, strategy, 2 codebase) | 5 cases x (2 engine + 1 control) | 15/15 verdicts in accepted set; decisive flaw named blind in every run; run-to-run verdict agreement 4/5 | reconstructed by someone who knew the outcomes; control matched 5/5 too, so these cases do not separate the protocols |
| Off-domain probe: a migration, a hire, a content series | 3 planted-flaw cases | decisive flaw named blind 3/3, all four lenses converging; 0 false alarms | control chat found it 3/3 too |
| Big messy input: 8 documents, ~2'900 words, every flaw needing 2-3 documents joined | 5 planted flaws x (2 engine + 3 control runs) | 5/5 found in every completed run of BOTH arms, 0 false alarms | the pre-registered prediction that one pass would drop 2 of them is REFUTED; still untested at a 40-page bundle |

One difference did show up in the big-input probe, and it is not detection: three control runs
on the identical bundle produced HOLD, a crash, and VALIDATE — and the VALIDATE report opens
with "Do not do this." The engine produced KILL twice, with the body matching the word both
times. Reproducibility of the stated decision, not a better nose.

Scope: business decisions. The method lost to a normal review on plain mechanical code, so
this project does not point at code at all.

Claims this supports: "found the real flaw blind in 15/15 runs across five domains"; "as
reliable as one blunt chat on verdicts, with a convergence signal, four distinct lenses, and
an enforced audit trail." Claims it does not support: "better than a chat", "accurate as a
decision-maker" (13 of 15 verdicts were VALIDATE — it is a what-to-test-next machine, not a
judge), any accuracy percentage; and after four side-by-side tests, any claim of a detection edge over
one careful reader.
