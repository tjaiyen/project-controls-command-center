# Ask AI — deployment (TJ-only step)

The Executive Command tab's free-text "Ask anything" feature needs a small Cloudflare Worker to
hold the real Anthropic API key — `index.html` is fully static and public (GitHub Pages), so the
key can never live in this repo. This is the one hands-on step to turn the feature on; everything
else (the UI, the guardrail logic, the tests) already ships in the repo and is dormant until this
is done.

This step needs a Cloudflare account and your own Anthropic API key — do this part yourself
rather than handing credentials to an assistant.

## 1. Install Wrangler and log in

```bash
npm install -g wrangler
wrangler login
```

## 2. Create the KV namespace (rate limit + daily budget state)

```bash
cd worker
wrangler kv namespace create ASK_AI_KV
```

Paste the `id` it prints into `worker/wrangler.toml`, replacing `REPLACE-ME`.

## 3. Set the API key as a Worker secret (never in a file)

```bash
wrangler secret put ANTHROPIC_API_KEY
```

Paste your key when prompted. It's stored encrypted by Cloudflare, never written to disk here.

## 4. Review the config before deploying

Open `worker/index.js` and check these constants match what you want:

- `ALLOWED_ORIGIN` — must exactly match the dashboard's real origin (`https://tjaiyen.github.io`
  by default). Any other value means the Worker will refuse every request from the live page.
- `DAILY_BUDGET_USD` — hard ceiling across every visitor combined, per UTC day (default `$2.00`).
  The page is public with no login, so this bounds worst-case cost, not per-visitor cost.
- `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` — per-IP question rate (default 6 per 10 minutes).
- `RATE_IN_PER_M` / `RATE_OUT_PER_M` — the per-million-token rates used to estimate spend against
  the budget cap. These are approximate as of when this was written — check current Anthropic
  pricing and update them before trusting `DAILY_BUDGET_USD` precisely; the cap still fails safe
  (refuses once *estimated* spend crosses it) even if these are somewhat off.

## 5. Dry-run, then deploy

```bash
wrangler deploy --dry-run   # catches syntax/bundling errors with zero real deploy
wrangler deploy
```

Wrangler prints the live URL, something like `https://pcc-ask-ai.<your-subdomain>.workers.dev`.

## 6. Point the dashboard at it

In `index.html`, find:

```js
var ASK_AI_WORKER_URL = "https://REPLACE-ME.workers.dev/ask";
```

Replace it with the real URL from step 5 (keep the `/ask` path — the Worker doesn't currently
route on it, but keeping a path makes future routing additions non-breaking). Commit and push.

`stress.cjs`'s external-asset sweep only allowlists the literal `REPLACE-ME.workers.dev`
placeholder, deliberately — once you set the real URL, that sweep will fail until you also update
its allowlist regex (search `no unexpected external assets`) to match your real subdomain. That's
intentional, not a bug: it forces a conscious acknowledgment of the one new external dependency
this feature adds, the same discipline this file already applies to every other external URL.

The feature stays off by default either way (`state.askAiEnabled` starts `false`) — this step only
makes the "Enable Ask AI" toggle actually work instead of showing the "not yet configured" notice.

## What this session did NOT do (accepted limitation, stated plainly)

This build has no Cloudflare account access, so `worker/index.js` has **not** been exercised
against a real Cloudflare runtime or the real Anthropic API. What HAS been tested, directly against
the real Worker code (not just in isolation): `worker/lib.js`'s pure guardrail logic (tool
dispatch, claim extraction/verification, rate-limit/budget math) via `stress.cjs`, plus
`worker/index.js`'s own request handling — CORS/method/origin validation, malformed-body handling,
daily-budget gating, and the full tool-use loop + mechanical fact-check running end-to-end — via
`node worker/smoketest.js`, which scripts a fake Anthropic response so it never needs real network
or a real key. Verified this smoke test genuinely catches a broken guardrail, not just a green
mechanical pass: temporarily disabled the fact-check strip and confirmed the exact predicted test
failure before restoring it.

The one thing that genuinely cannot be tested without spending real money against a real
deployment: whether the ACTUAL Anthropic API accepts this exact request/tool-use shape and Cloudflare's
real KV binding behaves like the fake one here. Run `wrangler deploy --dry-run` first, then ask it
one real question yourself and read the response before trusting it in front of anyone else.

## Turning it back off

Set `state.askAiEnabled` default back to `false` if it's ever flipped in code (it already is), or
simply don't complete step 5/6 — the dashboard degrades to the existing fixed FAQ with no feature
loss and zero cost.
