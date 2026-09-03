# Ask AI — deployment (TJ-only step)

The Executive Command tab's free-text "Ask anything" feature needs a small Cloudflare Worker to
hold the real Anthropic API key — `index.html` is fully static and public (GitHub Pages), so the
key can never live in this repo. This is the one hands-on step to turn the feature on; everything
else (the UI, the guardrail logic, the tests) already ships in the repo and is dormant until this
is done.

**One Worker, two dashboards (2026-09-03).** `facade.html`'s own Method tab carries the same
feature, answered against its own package ledger (panels/gates/EAC methods), never the program
KPI board. Both pages talk to the SAME Worker deployment and SHARE one `DAILY_BUDGET_USD` pool and
one rate limiter — a request's `dashboard` field ("program" or "facade") just selects which tool
set and system prompt (`worker/lib.js`'s `PROGRAM_TOOLS`/`FACADE_TOOLS`) answers it. There is
nothing to deploy twice; steps 1–6 below stand up the one Worker both pages use.

This step needs a Cloudflare account and your own Anthropic API key — do this part yourself
rather than handing credentials to an assistant.

## 1. Install Wrangler and log in

```bash
npm install -g wrangler
wrangler login
```

## 2. Create the KV namespace (per-IP rate limit only — best-effort)

```bash
cd worker
wrangler kv namespace create ASK_AI_KV
```

Paste the `id` it prints into `worker/wrangler.toml`, replacing `REPLACE-ME`. This is the per-IP
rate limiter only; if you skip it, the Worker still answers questions, it just can't rate-limit by
IP (real cost enforcement is the Durable Object below, not this — a `/stress-test` finding
2026-08-25: plain KV has no atomic increment, so a KV-only counter can be raced by ordinary
concurrent traffic, not just an attacker; see `worker/budget-do.js`'s own comment for the numbers).

## 3. The daily-budget Durable Object needs no separate creation step

Unlike the KV namespace above, `BUDGET_DO` (in `worker/wrangler.toml`) doesn't need a `wrangler`
command to provision — the `[[migrations]]` block in that file tells Cloudflare to create it on
your **first** `wrangler deploy` (step 6). This one IS required, not optional: the Worker refuses
every question if it's ever unbound (fails closed, not open) — see `worker/index.js`'s own comment.

## 4. Set the API key as a Worker secret (never in a file)

```bash
wrangler secret put ANTHROPIC_API_KEY
```

Paste your key when prompted. It's stored encrypted by Cloudflare, never written to disk here.

## 5. Review the config before deploying

Open `worker/index.js` and check these constants match what you want:

- `ALLOWED_ORIGIN` — real CORS boundary against another site's visitors proxying through their own
  browser (default `https://tjaiyen.github.io`). It is **not** a boundary against a direct
  scripted caller (curl, a script) — Origin is just a header a non-browser client can set to
  anything. The budget Durable Object and the rate limit are what actually bound cost against that.
- `DAILY_BUDGET_USD` — hard ceiling across every visitor combined, per UTC day (default `$2.00`),
  enforced atomically by the `BUDGET_DO` Durable Object (`worker/budget-do.js`), not a KV counter.
- `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` — per-IP question rate (default 6 per 10 minutes,
  best-effort — see step 2).
- Open `worker/budget-do.js` and check `RESERVE_PER_QUESTION_USD` (default `$0.05`) — a flat,
  conservative reservation taken atomically for every question BEFORE Anthropic is ever called
  (not the real per-question cost, which is usually well under this). Re-check it's still
  comfortably above worst-case real cost if you ever raise `MAX_TOOL_ROUNDS` or the model's
  `max_tokens` in `worker/index.js`.
- `RATE_IN_PER_M` / `RATE_OUT_PER_M` in `worker/index.js` — informational only (logged per
  response as `estCostUsd`, not used to gate anything) — update against current Anthropic pricing
  if you want that figure to stay accurate.

## 6. Dry-run, then deploy

```bash
wrangler deploy --dry-run   # catches syntax/bundling errors with zero real deploy
wrangler deploy
```

Wrangler prints the live URL, something like `https://pcc-ask-ai.<your-subdomain>.workers.dev`.

## 7. Point BOTH dashboards at it

The same `ASK_AI_WORKER_URL` placeholder appears twice — once per page, each its own module-scope
variable, deliberately not shared code (there's no shared JS file between the two pages):

```js
var ASK_AI_WORKER_URL = "https://REPLACE-ME.workers.dev/ask";
```

in `index.html` (index.html's own Ask AI, program dashboard) and in `facade.html` (Method tab,
facade dashboard). Replace both with the real URL from step 6 (keep the `/ask` path — the Worker
doesn't currently route on it, but keeping a path makes future routing additions non-breaking).
Commit and push.

`stress.cjs`'s external-asset sweep only allowlists the literal `REPLACE-ME.workers.dev`
placeholder, deliberately — once you set the real URL, that sweep will fail until you also update
its allowlist regex (search `no unexpected external assets`) to match your real subdomain. That's
intentional, not a bug: it forces a conscious acknowledgment of the one new external dependency
this feature adds, the same discipline this file already applies to every other external URL.
`verify-facade.cjs` has the equivalent check for `facade.html`'s own copy of the placeholder.

Each page's feature stays off by default either way (`state.askAiEnabled` / the local `askAi.enabled`
in facade.html both start `false`) — this step only makes the "Enable Ask AI" toggle actually work
on each page instead of showing the "not yet configured" notice.

## What this session did NOT do (accepted limitation, stated plainly)

This build has no Cloudflare account access, so `worker/index.js` and `worker/budget-do.js` have
**not** been exercised against a real Cloudflare runtime (real KV, a real Durable Object) or the
real Anthropic API. What HAS been tested, directly against the real code (not just in isolation):
`worker/lib.js`'s pure guardrail logic (tool dispatch, claim extraction/verification, rate-limit
math) via `stress.cjs`; `worker/index.js`'s own request handling — CORS/method/origin/snapshot-size
validation, the daily-budget-exhausted refusal, the tool-round-exhaustion fallback, and the full
tool-use loop + mechanical fact-check running end-to-end — via `node worker/smoketest.js`, which
scripts a fake Anthropic response, a fake KV, and a fake Durable Object stub so it never needs real
network or a real key; and a genuine concurrent-request race test against that fake DO/KV (20
simultaneous requests), confirming the Durable Object correctly bounds the count that succeeds
where the original plain-KV version let all 20 through. Verified this smoke test genuinely catches
a broken guardrail, not just a green mechanical pass: temporarily disabled the fact-check strip and
confirmed the exact predicted test failure before restoring it.

The one thing that genuinely cannot be tested without spending real money against a real
deployment: whether the ACTUAL Anthropic API accepts this exact request/tool-use shape, and
whether a real Cloudflare Durable Object's `blockConcurrencyWhile` + storage behave exactly like
the fake stub here (the *design* — single-threaded `fetch()` per DO id — is Cloudflare's own
documented guarantee, not something this session invented, but it was never exercised against the
real platform). Run `wrangler deploy --dry-run` first, then ask it one real question yourself and
read the response before trusting it in front of anyone else.

## Turning it back off

Set `state.askAiEnabled` default back to `false` if it's ever flipped in code (it already is), or
simply don't complete step 5/6 — the dashboard degrades to the existing fixed FAQ with no feature
loss and zero cost.
