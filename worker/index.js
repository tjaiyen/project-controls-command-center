// Ask AI -- Cloudflare Worker entry. This is the ONLY place ANTHROPIC_API_KEY ever exists; the
// dashboard (index.html) is fully static and public (GitHub Pages) and can never hold it. See
// docs/ASK_AI_SETUP.md for deployment steps. NOT unit-tested by stress.cjs -- it needs a real
// network/KV/DO/env, none of which exist in that Node DOM stub. worker/smoketest.js exercises this
// file's actual request-handling logic end-to-end with a scripted fake Anthropic response and a
// fake KV/DO, so it IS tested, just not against the real Cloudflare runtime or the real API --
// verify with `wrangler deploy --dry-run` and one real question before trusting it live.
//
// Every real guardrail (closed tool-use, mechanical fact-check, rate limit, daily budget) is pure
// logic factored into worker/lib.js specifically so it can be unit-tested directly. The one
// guardrail that genuinely needs Cloudflare-platform behavior -- an ATOMIC shared daily-spend
// counter -- lives in worker/budget-do.js as a Durable Object; see that file's own comment for why
// (a /stress-test finding: the original plain-KV check-then-write version let 20 concurrent
// requests all succeed, with 19 of 20 real cost updates silently lost to a last-write-wins race).

var lib = require("./lib.js");
var BudgetCounter = require("./budget-do.js").BudgetCounter; // re-exported below -- Cloudflare's
  // Durable Object binding (worker/wrangler.toml) resolves class_name against an export of THIS
  // module (the `main` entry), not the file the class happens to be defined in.

// ---- config -- tune before deploying, not secrets (the key itself is a Worker secret, below) ----
var ALLOWED_ORIGIN = "https://tjaiyen.github.io"; // Real CORS boundary against ANOTHER SITE's
  // visitors silently proxying through their own browser (a genuine browser can't spoof Origin).
  // It is NOT a boundary against a direct scripted caller (curl, a script) -- Origin is just a
  // header, and nothing stops a non-browser client from setting it to this exact value. The
  // budget Durable Object and the rate limit below are what actually bound worst-case cost
  // against that kind of direct abuse; this check alone does not, and is not relied on as if it did.
var ANTHROPIC_MODEL = "claude-haiku-4-5-20251001"; // cheapest current model that supports tool use --
  // deliberately not a larger model; this is short, narrow, structured Q&A, not open-ended work.
var DAILY_BUDGET_USD = 2.00; // hard ceiling across ALL visitors combined, per UTC day, enforced
  // atomically via the BUDGET_DO Durable Object (worker/budget-do.js) -- NOT a plain KV counter.
var RATE_LIMIT_MAX = 6; // requests
var RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // per 10 minutes, per IP. KV-backed, best-effort only
  // (KV has no atomic increment, so this can be raced under concurrency) -- an accepted,
  // explicitly-stated limitation, because the DO budget cap below is the real backstop on total
  // cost regardless of how imprecise this specific limiter is under a burst.
var MAX_TOOL_ROUNDS = 6; // bounds a single question's own cost regardless of budget headroom
// Anthropic per-million-token rates (Haiku 4.5) -- approximate, informational only (logged
// alongside the request, never used to gate anything -- the DO's flat RESERVE_PER_QUESTION_USD is
// the actual enforcement, see worker/budget-do.js). Re-check against real pricing periodically.
var RATE_IN_PER_M = 1.00, RATE_OUT_PER_M = 5.00;

function corsHeaders(origin) {
  var h = {"Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type"};
  if (origin === ALLOWED_ORIGIN) h["Access-Control-Allow-Origin"] = ALLOWED_ORIGIN;
  return h;
}
function json(body, status, origin) {
  return new Response(JSON.stringify(body), {status: status || 200,
    headers: Object.assign({"Content-Type": "application/json"}, corsHeaders(origin))});
}

async function callAnthropic(env, messages, dashboard) {
  var res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {"Content-Type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01"},
    body: JSON.stringify({model: ANTHROPIC_MODEL, max_tokens: 700, system: lib.getSystemPrompt(dashboard), tools: lib.getTools(dashboard), messages: messages})
  });
  if (!res.ok) throw new Error("Anthropic API error: " + res.status);
  return res.json();
}

async function handleAsk(request, env, origin) {
  var body;
  try { body = await request.json(); } catch (e) { return json({error: "Malformed request body."}, 400, origin); }
  var question = String(body && body.question || "").trim();
  var snapshot = body && body.snapshot;
  // dashboard selects which tool set/system prompt/dispatcher this question is answered against
  // (see worker/lib.js) -- defaults to "program" so an older client that never sends the field
  // (index.html, before this change) keeps behaving exactly as it did.
  var dashboard = body && body.dashboard === "facade" ? "facade" : "program";
  if (!question || question.length > 500) return json({error: "Question must be non-empty and under 500 characters."}, 400, origin);
  if (!snapshot || typeof snapshot !== "object") return json({error: "Missing program-data snapshot."}, 400, origin);
  if (lib.snapshotTooLarge(snapshot)) return json({error: "Program-data snapshot is larger than expected -- refusing."}, 400, origin);

  var ip = request.headers.get("CF-Connecting-IP") || "unknown";

  // Rate limit -- KV is eventually consistent, so this is an approximate per-IP limiter, not an
  // exact one; stated plainly rather than presented as airtight (see the config comment above).
  var rlKey = "rl:" + ip;
  var recent = [];
  if (env.ASK_AI_KV) {
    var stored = await env.ASK_AI_KV.get(rlKey);
    recent = stored ? JSON.parse(stored) : [];
  }
  var now = Date.now();
  if (!lib.checkRateLimit(recent, now, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX)) {
    return json({error: "Too many questions from this connection recently -- try again in a few minutes."}, 429, origin);
  }

  // Daily budget -- the real hard ceiling, so it fails CLOSED, not open: if the Durable Object
  // binding is missing (misconfigured wrangler.toml, a binding rename, etc), refuse every
  // question rather than silently running with zero cost protection. /stress-test finding
  // (2026-08-25): the original KV-only version measurably failed OPEN here -- 20 concurrent
  // requests all succeeded when ASK_AI_KV was simply unbound, spending real money with no cap in
  // effect at all. This is the one guardrail this build treats as load-bearing, not optional.
  if (!env.BUDGET_DO) return json({error: "Ask AI's cost guardrail isn't configured -- refusing to answer until it is."}, 503, origin);
  var dateKey = "spend:" + new Date().toISOString().slice(0, 10);
  var doId = env.BUDGET_DO.idFromName(dateKey);
  var doStub = env.BUDGET_DO.get(doId);
  var reserveRes = await doStub.fetch("https://budget-do/reserve", {
    method: "POST", body: JSON.stringify({dateKey: dateKey, capUsd: DAILY_BUDGET_USD})
  });
  var reserve = await reserveRes.json();
  if (!reserve.allow) {
    return json({error: "The daily question budget for this dashboard has been reached -- try again tomorrow."}, 429, origin);
  }

  // Closed tool-use loop -- Claude can only ever pull a fact via one of lib.TOOLS, backed by the
  // real snapshot the client sent this request. No code execution, no free-form data access.
  var messages = [{role: "user", content: question}];
  var toolResults = [];
  var finalText = null; // null (not "") distinguishes "never produced a final answer" from "produced an empty one"
  var usage = {input_tokens: 0, output_tokens: 0};
  for (var round = 0; round < MAX_TOOL_ROUNDS; round++) {
    var resp = await callAnthropic(env, messages, dashboard);
    usage.input_tokens += (resp.usage && resp.usage.input_tokens) || 0;
    usage.output_tokens += (resp.usage && resp.usage.output_tokens) || 0;
    var toolUses = (resp.content || []).filter(function (b) { return b.type === "tool_use"; });
    if (!toolUses.length) {
      finalText = (resp.content || []).filter(function (b) { return b.type === "text"; }).map(function (b) { return b.text; }).join(" ");
      break;
    }
    messages.push({role: "assistant", content: resp.content});
    var toolResultBlocks = toolUses.map(function (t) {
      var result = lib.callTool(t.name, t.input, snapshot, dashboard);
      toolResults.push({name: t.name, args: t.input, result: result});
      return {type: "tool_result", tool_use_id: t.id, content: JSON.stringify(result)};
    });
    messages.push({role: "user", content: toolResultBlocks});
  }

  // /stress-test finding (2026-08-25): if the model never returns a tool-free turn within
  // MAX_TOOL_ROUNDS, finalText stayed "" and the handler returned a 200 with an EMPTY answer
  // rendered as "fully grounded" -- honestly wrong on both counts (nothing was verified because
  // nothing was said, and a blank answer is not success). Surfaced as a real, explicit failure.
  if (finalText === null) {
    return json({error: "Couldn't reach a final answer within this question's tool-call budget -- try asking something more specific."}, 200, origin);
  }

  // Mechanical fact-check -- the real guardrail. Every claim not backed by an actual tool result
  // this turn is stripped from the answer before it ever reaches a reader.
  var groundTruthNumbers = lib.buildGroundTruthNumbers(toolResults);
  var groundTruthText = lib.buildGroundTruthText(toolResults);
  var claims = lib.extractNumericClaims(finalText);
  var v = lib.verifyClaims(claims, groundTruthNumbers, groundTruthText);
  var safeAnswer = v.unverified.length ? lib.sanitizeAnswer(finalText, v.unverified) : finalText;

  // Rate-limit bookkeeping only -- best-effort, see the config comment above. The real spend
  // enforcement already happened atomically in the DO reservation before Anthropic was ever
  // called, so a failure here can't let cost protection silently lapse.
  var estCostUsd = (usage.input_tokens / 1e6) * RATE_IN_PER_M + (usage.output_tokens / 1e6) * RATE_OUT_PER_M;
  if (env.ASK_AI_KV) {
    try {
      recent.push(now);
      await env.ASK_AI_KV.put(rlKey, JSON.stringify(recent.slice(-RATE_LIMIT_MAX)), {expirationTtl: 3600});
    } catch (e) { /* logging-only failure, never blocks the response */ }
  }

  // toolCalls carries the REAL {name, args, result} of every tool call made this turn -- not just
  // a flattened field-name string -- so the client can render "show your work" and cross-link
  // chips (UX upgrade round, 2026-08-25) straight from the same real data the fact-check itself
  // used, never a second summary that could drift from it.
  return json({answer: safeAnswer, toolCalls: toolResults, totalClaims: claims.length,
    unverifiedCount: v.unverified.length, estCostUsd: estCostUsd}, 200, origin);
}

module.exports = {
  fetch: async function (request, env, ctx) {
    var origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") return new Response(null, {status: 204, headers: corsHeaders(origin)});
    if (request.method !== "POST") return json({error: "Method not allowed."}, 405, origin);
    if (origin !== ALLOWED_ORIGIN) return json({error: "Origin not allowed."}, 403, origin);
    try {
      return await handleAsk(request, env, origin);
    } catch (e) {
      // Never leak internals (stack traces, the key, raw Anthropic error bodies) to a public caller.
      return json({error: "Something went wrong answering that question."}, 500, origin);
    }
  },
  BudgetCounter: BudgetCounter // re-export -- see the require() comment above
};
