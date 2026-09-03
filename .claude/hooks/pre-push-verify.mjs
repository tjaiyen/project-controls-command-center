#!/usr/bin/env node
// pre-push-verify — PreToolUse hook that runs this repo's own fast verification harnesses before
// letting a `git push` go out, and BLOCKS the push if either fails.
//
// WHY: pushing to `main` is the deploy (docs/HANDOFF.md §15, no build step, no staging gate) — CI
// (.github/workflows/test.yml) only runs AFTER the push lands, so a broken commit can go live
// before anyone (human or CI) ever sees red. This closes that specific hole for any push made from
// inside a Claude Code session, the same way ruflo-runtime's command-guard.mjs makes B7 mechanical
// instead of a habit that can slip under load.
//
// Runs `node verify.cjs` (independent EVM tie-out) and `node stress.cjs` (the full assertion
// suite) synchronously — the two fast, universal, always-available harnesses. Deliberately does
// NOT run worker/smoketest.js, verify-facade.cjs, verify-walters-wolf.cjs, or the Python SQL
// pipeline here: those are narrower or slower, and belong to the full /stress-test discipline
// (.claude/skills/stress-test/SKILL.md), not an automatic push-time floor. This hook is a floor,
// not a substitute for actually running the full suite before a real change.
//
// FAIL-OPEN on anything that isn't a real test failure (node missing, repo moved, timeout) — a
// hook bug must never brick every push; only an ACTUAL non-zero exit from a real run blocks.
//
// Wired in .claude/settings.json under hooks.PreToolUse, matcher "Bash".

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

function emit(decision, reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision,
      permissionDecisionReason: reason,
    },
  }));
}

function allow() { process.exit(0); }

let input;
try {
  input = JSON.parse(readStdin());
} catch {
  allow(); // malformed input — fail open, per hooks.md doctrine
}

const command = input?.tool_input?.command;
// Real bug found and fixed (/stress-test finding, empirically probed, 2026-09-03): the original
// `\bgit\s+push\b` gate requires "push" immediately after "git", so `git -C <path> push` (flags
// in between) never reached the cd/-C detection logic below AT ALL — it exited here first,
// silently, before ever considering the -C target. Broadened to "git" anywhere followed by "push"
// anywhere later; slightly over-inclusive (e.g. `git log --grep push`) is fine and safe — the
// worst case is running an unnecessary ~2s test pass, never skipping a real one.
if (typeof command !== 'string' || !/\bgit\b[\s\S]*?\bpush\b/.test(command)) {
  allow(); // not a push — nothing to check
}

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');

// Only guard THIS repo's own pushes — a push run from elsewhere on the machine (this hook is
// project-scoped via .claude/settings.json, but defend anyway in case that ever changes) is none
// of this hook's business.
if (!fs.existsSync(REPO_ROOT + '/stress.cjs') || !fs.existsSync(REPO_ROOT + '/verify.cjs')) {
  allow();
}

// Real gap found and fixed (/stress-test finding, independent reviewer, 2026-09-03): a compound
// command like `cd ~/dev/some-other-repo && git push` still matched `\bgit\s+push\b` above, and
// REPO_ROOT is pinned to THIS hook file's own location regardless of what the command actually
// cd's into first — so a push to a completely unrelated repo would have been gated on PCC's own
// unrelated test results. Heuristic, not a real shell parser (consistent with this project's own
// "regex floor, not a sandbox" hook doctrine): if the command names an explicit `cd <path>` (or
// `git -C <path> push`) that resolves outside this repo, fail OPEN rather than run PCC's tests
// against someone else's push.
//
// CORRECTED again the same day (/stress-test finding, a SECOND independent reviewer, empirically
// probed against fixtures, not just read): the first version of this fix had two real bugs, both
// in the dangerous direction (silently skipping protection a push actually needed) or the original
// direction (running irrelevant tests) depending on the shape:
//   1. `cd /tmp && cd $REPO && git push` — a SECOND cd back INTO the repo — matched only the
//      FIRST cd (`/tmp`), concluded "outside," and skipped verification for a push that actually
//      DID target this repo. Fixed by taking the LAST cd/`-C` target in the command, not the first.
//   2. `(cd /other/repo && git push)` — a subshell — the boundary character class before `cd`
//      didn't include `(`, so the cd was invisible and the original bug (running PCC's tests
//      against an unrelated push) came right back for this one shape. Fixed by adding `(` to the
//      boundary set.
// A third, harder problem surfaced by the same probing: `$REPO` (a shell variable) can't be
// resolved without actually invoking a shell, which this hook deliberately never does for
// security/complexity reasons. Rather than guess, an unresolvable target ($VAR, `cmd`, $(cmd))
// now falls through to running the tests — the SAFE default, since the failure mode of running an
// unnecessary 2-second test pass is far cheaper than the failure mode of skipping a push's real
// verification because its target couldn't be confidently classified.
const targetRe = /(?:^|[;&(]|\|\|)\s*cd\s+(['"]?)([^;&|'"()]+)\1|git\s+-C\s+(['"]?)([^;&|'"()\s]+)\3\s+push/g;
const targetMatches = [...command.matchAll(targetRe)];
if (targetMatches.length) {
  const last = targetMatches[targetMatches.length - 1];
  const rawTarget = (last[2] ?? last[4]).trim();
  if (!/[$`]/.test(rawTarget)) { // unresolvable without a real shell — fall through, don't guess
    const expanded = rawTarget.startsWith('~')
      ? path.join(process.env.HOME || '', rawTarget.slice(1))
      : rawTarget;
    const resolvedTarget = path.resolve(REPO_ROOT, expanded);
    if (resolvedTarget !== REPO_ROOT && !resolvedTarget.startsWith(REPO_ROOT + path.sep)) {
      allow(); // the command's LAST cd/-C target resolves outside this repo
    }
  }
}

function run(label, args) {
  try {
    execFileSync('node', args, { cwd: REPO_ROOT, timeout: 60_000, stdio: 'pipe' });
    return { label, ok: true };
  } catch (e) {
    // ENOENT here means the `node` binary itself couldn't be found/started — a hook-environment
    // problem, not a real test failure. Re-throw so the outer catch fails OPEN instead of
    // wrongly blocking every push because this machine's PATH is broken. A real test failure
    // (non-zero exit, stdout/stderr populated) has e.status set instead — that's the only case
    // that should ever return ok:false.
    if (e.code === 'ENOENT') throw e;
    const out = (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : '');
    return { label, ok: false, tail: out.split('\n').filter(Boolean).slice(-15).join('\n') };
  }
}

let results;
try {
  results = [run('verify.cjs', ['verify.cjs']), run('stress.cjs', ['stress.cjs'])];
} catch {
  allow(); // node itself failed to run at all — fail open, don't brick every push over a broken PATH
}

const failed = results.filter((r) => !r.ok);
if (failed.length === 0) {
  allow();
}

const reason =
  `Blocked: ${failed.map((f) => f.label).join(' and ')} failed on this repo's own verification ` +
  `harnesses right before the push. Fix the failure(s) below, re-run, then push again — or run ` +
  `/stress-test for the full dual-reviewer pass if this isn't a small fix.\n\n` +
  failed.map((f) => `--- ${f.label} (tail) ---\n${f.tail}`).join('\n\n');

emit('deny', reason);
