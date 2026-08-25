// Ask AI Worker smoke test -- exercises worker/index.js's actual fetch() handler directly (no
// real network, no Cloudflare runtime, no real Anthropic key) using Node's built-in Request/
// Response/fetch. This is NOT part of stress.cjs (that file is specifically the index.html/
// otak.html harness) -- run it on its own: `node worker/smoketest.js`.
//
// What this DOES prove: CORS/method/origin/body validation, rate-limit and daily-budget gating
// (via a fake in-memory KV), and the full tool-use loop + mechanical fact-check integration
// end-to-end, using a scripted fake Anthropic response (global.fetch overridden for the duration
// of this script only). What this does NOT prove, and cannot: that the real Anthropic API accepts
// this exact request shape, or that a real Cloudflare KV binding behaves identically to the fake
// one here. Stated plainly in docs/ASK_AI_SETUP.md -- run one real question through the deployed
// Worker before trusting it live.

const assert = require("assert");
let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; } else { fail++; console.error("FAIL: " + label); }
}

function makeFakeKv() {
  const store = new Map();
  return {
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async put(k, v) { store.set(k, v); },
    _store: store,
  };
}
function makeSnapshot() {
  return {
    asOf: "31 Jul 2026",
    totals: {bac: 1240.0, eac: 1303.67, vac: -63.67, contRemaining: 52.6, overrun: 63.67, riskExposure: 25.74, contCoverage: 0.588},
    gate5: {pass: false, checks: [{key: "contCoverage", label: "coverage", pass: false, detail: "0.588"}]},
    openingDate: {target: "15 Mar 2028", forecast: "24 Apr 2028", driftDays: 40},
    kpis: [{id: "cpi", fam: "Cost", name: "Cost Performance Index", val: "0.956", raw: 0.956, rag: "a", formula: "CPI = EV / AC"}],
    risks: [{id: "R-01", name: "Ground conditions", probBand: "Likely", impact: "High", cost: 18.5, exposure: 12.95, owner: "Geotech lead", mitigation: "Supplemental program"}],
    actions: [{id: "A-09", title: "Close funding gap", owner: "Program director", status: "escalated", opened: "2026-07-01", due: "2026-07-15"}],
    mc: {n: 10000, p10: 1250, p50: 1300, p80: 1330, p95: 1360, pOver: 0.98, pBust: 1.0},
  };
}

async function run() {
  delete require.cache[require.resolve("./index.js")];
  const worker = require("./index.js");
  const env = {ANTHROPIC_API_KEY: "sk-test-not-real", ASK_AI_KV: makeFakeKv()};
  const ORIGIN = "https://tjaiyen.github.io";

  // 1. OPTIONS preflight
  {
    const res = await worker.fetch(new Request("https://worker.example/ask", {method: "OPTIONS", headers: {Origin: ORIGIN}}), env);
    ok(res.status === 204, "OPTIONS preflight returns 204");
    ok(res.headers.get("Access-Control-Allow-Origin") === ORIGIN, "preflight echoes the allowed origin");
  }

  // 2. Wrong method
  {
    const res = await worker.fetch(new Request("https://worker.example/ask", {method: "GET", headers: {Origin: ORIGIN}}), env);
    ok(res.status === 405, "GET is rejected with 405");
  }

  // 3. Wrong origin -- the actual CORS boundary, not decorative
  {
    const res = await worker.fetch(new Request("https://worker.example/ask", {method: "POST", headers: {Origin: "https://evil.example"}, body: "{}"}), env);
    ok(res.status === 403, "a non-allowlisted Origin is refused with 403, not silently served");
  }

  // 4. Malformed body
  {
    const res = await worker.fetch(new Request("https://worker.example/ask", {method: "POST", headers: {Origin: ORIGIN, "Content-Type": "application/json"}, body: "not json"}), env);
    ok(res.status === 400, "malformed JSON body is rejected with 400, not a 500 crash");
  }

  // 5. Missing snapshot
  {
    const res = await worker.fetch(new Request("https://worker.example/ask", {method: "POST", headers: {Origin: ORIGIN}, body: JSON.stringify({question: "hi"})}), env);
    ok(res.status === 400, "a request with no program-data snapshot is refused, never silently answered from the model's own knowledge");
  }

  // 6. Daily budget already exhausted -- refuses BEFORE ever calling Anthropic
  {
    const budgetEnv = {ANTHROPIC_API_KEY: "sk-test-not-real", ASK_AI_KV: makeFakeKv()};
    const dateKey = "spend:" + new Date().toISOString().slice(0, 10);
    await budgetEnv.ASK_AI_KV.put(dateKey, "999.00");
    let anthropicCalled = false;
    const realFetch = global.fetch;
    global.fetch = (url, ...rest) => { if (String(url).includes("anthropic.com")) anthropicCalled = true; return realFetch(url, ...rest); };
    const res = await worker.fetch(new Request("https://worker.example/ask", {method: "POST", headers: {Origin: ORIGIN}, body: JSON.stringify({question: "Are we on budget?", snapshot: makeSnapshot()})}), budgetEnv);
    global.fetch = realFetch;
    ok(res.status === 429, "an exhausted daily budget is refused with 429");
    ok(!anthropicCalled, "an exhausted budget never even calls the Anthropic API -- fails closed before spending anything");
  }

  // 7. Full round trip -- scripted fake Anthropic response (tool_use turn, then a final text turn
  // that includes ONE fabricated claim never returned by any tool) -- proves the tool loop AND
  // the mechanical fact-check both actually run end-to-end inside the real Worker code path, not
  // just in lib.js isolation.
  {
    let callCount = 0;
    const realFetch = global.fetch;
    global.fetch = async (url, opts) => {
      if (!String(url).includes("anthropic.com")) return realFetch(url, opts);
      callCount++;
      if (callCount === 1) {
        return new Response(JSON.stringify({
          content: [{type: "tool_use", id: "t1", name: "get_gate5_status", input: {}}],
          usage: {input_tokens: 200, output_tokens: 40},
        }), {status: 200});
      }
      return new Response(JSON.stringify({
        content: [{type: "text", text: "Gate 5 is BLOCKED at a coverage of 0.588, and the sky is $47.2M."}],
        usage: {input_tokens: 260, output_tokens: 60},
      }), {status: 200});
    };
    const res = await worker.fetch(new Request("https://worker.example/ask", {method: "POST", headers: {Origin: ORIGIN}, body: JSON.stringify({question: "Is Gate 5 clear?", snapshot: makeSnapshot()})}), env);
    global.fetch = realFetch;
    ok(res.status === 200, "a real (scripted) round trip returns 200");
    const body = await res.json();
    ok(callCount === 2, "the tool-use loop really made 2 Anthropic calls (one tool_use turn, one final text turn), not a single blind pass-through");
    ok(body.answer.includes("0.588"), "the verified claim (returned by the real get_gate5_status tool call) survives in the final answer");
    ok(!body.answer.includes("$47.2M") && body.answer.includes("[unverified]"), "the fabricated claim (never returned by any tool this turn) is stripped from the answer before it's returned");
    ok(body.citedFields.includes("get_gate5_status"), "the response cites the real tool that was actually called");
    ok(body.unverifiedCount === 1, "the response honestly reports 1 unverified claim was removed, not silently 0");
  }

  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
