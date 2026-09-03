---
name: stress-test
description: Adversarial stress-test for this repo — self-review + a fresh-context reviewer, empirical verification, findings table, fix, re-verify. Codifies the pattern already run a dozen+ times informally across this project's history.
---

# Stress-test — Project Controls Command Center

This is the project-specific version of the pattern this repo has run informally, by prose
instruction, at least a dozen times since 2026-08-17 — most recently catching a real, high-severity
bug (a fabricated risk-to-package mapping) in the schedule-risk composite the same day it shipped.
Run it after any non-trivial build, before a commit that touches `index.html`, a companion page, or
`pipeline/`.

## Method

1. **Review adversarially, two ways.** Do it yourself, reading the actual diff and the surrounding
   code it touches — not just the new lines. AND spawn an independent fresh-context `Agent` to
   review the same change with no memory of why you built it. Each returns findings only, not file
   dumps. Two reviewers catch different things; this project's own history proves it (the
   fresh-context reviewer on the schedule-risk fix caught 6 real findings the self-review missed,
   including one CRITICAL/CI-worthy internal contradiction).
2. **Pre-register, then probe.** Before running any check, write down what you expect it to show.
   State the number, the pass/fail, the exact string. A contradicted prediction IS the finding —
   don't rationalize it away.
3. **Verify empirically, three ways minimum:**
   - `node verify.cjs` — independent EVM tie-out. Compare against the tie-out table in
     `docs/HANDOFF.md` §2; any drift is a real finding, not noise.
   - `node stress.cjs` — the full assertion suite. Read the actual failure list
     (`grep -n "^FAIL"`), not just the pass/fail count.
   - `python3 pipeline/run_pipeline.py` (needs `pipeline/.venv` — `python3 -m venv pipeline/.venv &&
     pipeline/.venv/bin/pip install duckdb` once) — the SQL/DuckDB parity proof, a genuinely
     independent third implementation.
   - If the change touches `worker/`, also run `node worker/smoketest.js`.
   - If it touches `facade.html`/`walters-wolf.html`, also run their `verify-*.cjs` harness.
   - **Live-browser check, not just the DOM stub**, for anything CSS/visual/canvas — the Node DOM
     stub in `stress.cjs` has no real layout engine (documented limitation, §18 of HANDOFF.md).
     Start a local server (`.claude/launch.json` has one configured) and actually look.
4. **Check for stale-count drift specifically.** This project's single most recurring bug class
   (11+ documented re-sync events): a check count / KPI count / guard count cited in prose
   (`README.md`, `docs/HANDOFF.md`, `architecture.html`, `stress.cjs`'s own degraded-mode fallback
   literals) that silently falls behind a live array after any change to that array. If your change
   adds or removes a `check(...)`/`ok(...)` call, a `KPIS`/`GUARDS`/`RISKS`/`ACTIONS` entry, or
   anything else counted in prose somewhere, grep for the old count across the whole repo — not
   just the one file you were editing.
5. **Findings table** — severity, file:line, concrete repro, one-line fix. Rank most severe first.
6. **Drive every finding to a fix, then re-verify all three harnesses again.** A fix can introduce
   its own drift (this project has hit this exact recursion — fixing a stale count once, then
   needing to fix the *fixed* count again after a follow-on change).
7. **State accepted limitations explicitly**, even if the list is empty. Don't imply more coverage
   than exists — this project's own `README.md`/`docs/HANDOFF.md` model this discipline throughout
   (e.g. "the proof covers the SQL aggregation layer, not an independently-sourced dataset").

## The doctrine this enforces (see CLAUDE.md for the short version)

- Every number traces to a real `derive*()` function or a literal — never test the app's formula
  against itself; independently re-derive the expected value in the test file.
- A hand-authored data-relationship (like a risk-to-package map) that could instead be derived from
  real linked data is a bug waiting to be found, not a shortcut. This project shipped exactly that
  bug once; don't repeat the pattern.
- Multi-session concurrency is real in this repo (not a git worktree) — re-check `git branch -vv`
  before any commit if the session has been running a while; see CLAUDE.md's concurrency section.

## Output format

Findings table, most severe first:

| # | Severity | File:line | Finding | Repro | Fix |
|---|---|---|---|---|---|

Then: fixes applied, before/after check counts for every harness re-run (never just "fixed" —
paste the actual `N passed, 0 failed` line), and accepted limitations stated plainly.
