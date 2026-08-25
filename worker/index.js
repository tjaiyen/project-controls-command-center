// Ask AI -- Cloudflare Worker entry. This is the ONLY place ANTHROPIC_API_KEY ever exists; the
// dashboard (index.html) is fully static and public (GitHub Pages) and can never hold it. See
// docs/ASK_AI_SETUP.md for deployment steps. NOT unit-tested by stress.cjs -- it needs a real
// network/KV/env, none of which exist in that Node DOM stub. Every real guardrail (closed tool-use,
// mechanical fact-check, rate limit, daily budget) is pure logic factored into worker/lib.js
// specifically so IT can be unit-tested even though this glue code can't be. Accepted limitation,
// stated plainly (not hidden): verify this file with `wrangler deploy --dry-run` and a manual
// round-trip before relying on it -- it has not been exercised against the real Anthropic API or a
// real Cloudflare runtime this session (no deploy access here).

var lib = require("./lib.js");

// ---- config -- tune before deploying, not secrets (the key itself is a Worker secret, below) ----
var ALLOWED_ORIGIN = "https://tjaiyen.github.io"; // exact match only, never "*" -- otherwise any
  // site could proxy questions through this Worker and spend TJ's own budget.
var ANTHROPIC_MODEL = "claude-haiku-4-5-20251001"; // cheapest current model that supports tool use --
  // deliberately not a larger model; this is short, narrow, structured Q&A, not open-ended work.
var DAILY_BUDGET_USD = 2.00; // hard ceiling across ALL visitors combined, per UTC day. The page is
  // public with no login, so this bounds worst-case runaway cost, not per-user cost.
var RATE_LIMIT_MAX = 6; // requests
var RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // per 10 minutes, per IP
var MAX_TOOL_ROUNDS = 6; // bounds a single question's own cost regardless of budget headroom
// Anthropic per-million-token rates (Haiku 4.5) -- approximate, for the spend-cap estimate only,
// not a billing-accurate figure. Re-check against real pricing before trusting DAILY_BUDGET_USD
// precisely; the cap still fails safe (refuses once estimated spend crosses it) even if this is
// off by some margin.
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

async function callAnthropic(env, messages) {
  var res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {"Content-Type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01"},
    body: JSON.stringify({model: ANTHROPIC_MODEL, max_tokens: 700, system: lib.SYSTEM_PROMPT, tools: lib.TOOLS, messages: messages})
  });
  if (!res.ok) throw new Error("Anthropic API error: " + res.status);
  return res.json();
}

async function handleAsk(request, env, origin) {
  var body;
  try { body = await request.json(); } catch (e) { return json({error: "Malformed request body."}, 400, origin); }
  var question = String(body && body.question || "").trim();
  var snapshot = body && body.snapshot;
  if (!question || question.length > 500) return json({error: "Question must be non-empty and under 500 characters."}, 400, origin);
  if (!snapshot || typeof snapshot !== "object") return json({error: "Missing program-data snapshot."}, 400, origin);

  var ip = request.headers.get("CF-Connecting-IP") || "unknown";

  // Rate limit -- KV is eventually consistent, so this is an approximate per-IP limiter, not an
  // exact one; stated plainly rather than presented as airtight. Good enough at this scale.
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

  // Daily budget -- refuses BEFORE calling Anthropic once the estimated spend crosses the cap, so
  // a runaway day fails closed rather than exceeding the ceiling mid-call.
  var dateKey = new Date().toISOString().slice(0, 10);
  var spendKey = "spend:" + dateKey;
  var spentUsd = 0;
  if (env.ASK_AI_KV) spentUsd = parseFloat((await env.ASK_AI_KV.get(spendKey)) || "0");
  if (!lib.checkDailyBudget(spentUsd, DAILY_BUDGET_USD)) {
    return json({error: "The daily question budget for this dashboard has been reached -- try again tomorrow."}, 429, origin);
  }

  // Closed tool-use loop -- Claude can only ever pull a fact via one of lib.TOOLS, backed by the
  // real snapshot the client sent this request. No code execution, no free-form data access.
  var messages = [{role: "user", content: question}];
  var toolResults = [];
  var finalText = "";
  var usage = {input_tokens: 0, output_tokens: 0};
  for (var round = 0; round < MAX_TOOL_ROUNDS; round++) {
    var resp = await callAnthropic(env, messages);
    usage.input_tokens += (resp.usage && resp.usage.input_tokens) || 0;
    usage.output_tokens += (resp.usage && resp.usage.output_tokens) || 0;
    var toolUses = (resp.content || []).filter(function (b) { return b.type === "tool_use"; });
    if (!toolUses.length) {
      finalText = (resp.content || []).filter(function (b) { return b.type === "text"; }).map(function (b) { return b.text; }).join(" ");
      break;
    }
    messages.push({role: "assistant", content: resp.content});
    var toolResultBlocks = toolUses.map(function (t) {
      var result = lib.callTool(t.name, t.input, snapshot);
      toolResults.push({name: t.name, args: t.input, result: result});
      return {type: "tool_result", tool_use_id: t.id, content: JSON.stringify(result)};
    });
    messages.push({role: "user", content: toolResultBlocks});
  }

  // Mechanical fact-check -- the real guardrail. Every claim not backed by an actual tool result
  // this turn is stripped from the answer before it ever reaches a reader.
  var groundTruth = lib.buildGroundTruthText(toolResults);
  var claims = lib.extractNumericClaims(finalText);
  var v = lib.verifyClaims(claims, groundTruth);
  var safeAnswer = v.unverified.length ? lib.sanitizeAnswer(finalText, v.unverified) : finalText;
  var citedFields = toolResults.map(function (t) { return t.name + (t.args && t.args.id ? "(" + t.args.id + ")" : ""); });

  // Persist rate-limit + spend state. Best-effort -- a KV write failure degrades to "no memory of
  // this request" rather than blocking the answer that already succeeded.
  var estCostUsd = (usage.input_tokens / 1e6) * RATE_IN_PER_M + (usage.output_tokens / 1e6) * RATE_OUT_PER_M;
  if (env.ASK_AI_KV) {
    try {
      recent.push(now);
      await env.ASK_AI_KV.put(rlKey, JSON.stringify(recent.slice(-RATE_LIMIT_MAX)), {expirationTtl: 3600});
      await env.ASK_AI_KV.put(spendKey, String(spentUsd + estCostUsd), {expirationTtl: 172800});
    } catch (e) { /* logging-only failure, never blocks the response */ }
  }

  return json({answer: safeAnswer, citedFields: citedFields, unverifiedCount: v.unverified.length}, 200, origin);
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
  }
};
