# CLAUDE.md — Project Controls Command Center

A phase-gated capital-program-controls dashboard, one 14K-line static `index.html`, zero
dependencies, four independent proof layers. Full depth: [docs/HANDOFF.md](docs/HANDOFF.md)
(architecture, tab-by-tab guide, extension points) and [docs/KNOWN_GAPS.md](docs/KNOWN_GAPS.md)
(the volatile deferred-work log — check before assuming something isn't built yet). Read this
file first; it's the router, not the reference.

## The one rule this project enforces hardest

**Every number traces to a real `derive*()` function or a literal in `PKGS`/`WBS`/`RISKS`/
`DELAYS`/`CONTRACTS`/`ACTIONS`/`CPH_CELLS`/`PROGRAM` — never a hand-typed figure that merely looks
consistent.** This is the rule a `/stress-test` assertion should check for anything new. Violating
it is the single most common real bug class found across 18 days of `/stress-test` rounds.

## Testing doctrine

Never test against the app's own formula by calling its `derive*()` function and reapplying the
same math — that catches nothing, since a wrong formula and a wrong test agree with each other.
Every assertion in `stress.cjs`/`verify.cjs` independently re-derives its expected value from raw
literal data in the test file itself.

**Before any commit that touches `index.html`, `pipeline/`, or a companion page**, run:

```bash
node verify.cjs               # independent EVM tie-out
node stress.cjs                # the full interaction/structure assertion suite (README.md has the current count)
node worker/smoketest.js       # Ask AI backend, if worker/ touched
node verify-facade.cjs         # if facade.html touched
node verify-walters-wolf.cjs   # if walters-wolf.html touched
pipeline/.venv/bin/python3 pipeline/run_pipeline.py   # SQL/DuckDB parity proof — set up pipeline/.venv
                                                       # once first if it doesn't exist yet (docs/HANDOFF.md §16)
```

A pre-push hook (`.claude/hooks/pre-push-verify.mjs`) runs the fast subset automatically — see
[.claude/settings.json](.claude/settings.json). It can be bypassed; it isn't a substitute for
actually reading what failed.

## Stress-testing this repo

Use `/stress-test` ([.claude/skills/stress-test/SKILL.md](.claude/skills/stress-test/SKILL.md)) —
codifies the exact dual-reviewer pattern (self-review + a fresh-context Agent) already run a dozen
times informally in this project's history, most recently catching a real, high-severity bug in
the schedule-risk composite the same day it shipped.

## Concurrency — this repo is not always yours alone

This is a plain checkout, not a git worktree — another session can be actively working here at the
same time, on a different branch, in the same directory. Before any commit:

1. `git branch -vv` and `git log --oneline -5` — confirm what branch you're actually on and that it
   still matches what you expect. A checkout can change underneath you mid-session (this has
   happened for real — see `docs/KNOWN_GAPS.md`'s "2026-09-03 additions" entry, "Schedule-risk
   composite fix," for the full incident this rule is written from).
2. If your working-tree edits and `HEAD` no longer line up with what you last read, stop and
   re-verify before committing — don't assume the branch you started on is still checked out.
3. If you know or suspect a concurrent session owns other files in this repo right now, state that
   scope explicitly in your own commit message ("X.html was owned by a concurrent session, out of
   scope") — this project's own history shows that convention working when both sides follow it.
4. Never force-push, never rewrite a commit already on `origin/main`.

## Extension points (quick reference — full detail in docs/HANDOFF.md §17)

- **New KPI**: one object in `KPIS` (`id/fam/abbr/name/tier/f/th/ph/src/why/act`) — appears
  automatically on Overview + the Operating Framework reference library. Add a `GUARDS` entry only
  if it has a real independent way to recompute itself.
- **New glossary term**: one `{k,t,p,e}` object in `GLOSS` — `e` must be a function returning a
  **live-computed** worked example, never a hand-typed number.
- **New story-navigator diagram**: copy the CDE-flow pattern exactly (a `*_NODES` array, a
  `*Caption(node)` function with genuinely additive content, `select*(idx)`, the matching HTML
  block verbatim).
- **New `bars()`-rendered chart with a tooltip**: pass a 4th `tipFmt(item, i)` closure to the
  existing `bars(el, items, fmt, tipFmt)` helper.
- **New risk-to-package linkage**: never hand-author a static field. Route through
  `riskLinkedActions()` (reads `ACTIONS[].pkg`, the one real derivation) — a hand-typed map was
  built and shipped once already, contradicted this codebase's own stated design principle, and
  was factually wrong for 3 of 4 mappings. Don't repeat it.

## Deployment

GitHub Pages, served directly from `main` — pushing to `main` **is** the deploy, no build step. A
real `.github/workflows/test.yml` runs the four harnesses on every push/PR, but it's advisory, not
a hard gate: a direct push to `main` is never blocked on it passing (only a PR merge could be, and
this project doesn't currently require PRs). The pre-push hook (`.claude/hooks/pre-push-verify.mjs`,
this machine only — see the concurrency section above) is the actual, working gate today. Do not
add a build step without a real reason; the zero-dependency architecture is the point.

## Synthetic data — hard rule

The program, packages, risks, and change log are invented. No client, employer, or agency data
belongs anywhere in this repository, ever.
