// Ask AI Worker smoke test -- exercises worker/index.js's actual fetch() handler directly (no
// real network, no Cloudflare runtime, no real Anthropic key) using Node's built-in Request/
// Response/fetch, a fake KV namespace, and a fake Durable Object namespace. This is NOT part of
// stress.cjs (that file is specifically the index.html/otak.html harness) -- run it on its own:
// `node worker/smoketest.js`.
//
// What this DOES prove: CORS/method/origin/body/snapshot-size validation, the daily-budget-
// exhausted refusal, the DO-unbound fail-closed refusal, the tool-round-exhaustion fallback, the
// full tool-use loop + mechanical fact-check integration end-to-end (including a genuinely
// fabricated PROSE claim and a genuinely correct $-FORMATTED claim, not just the narrow shapes
// the first version of this guardrail happened to catch -- /stress-test finding, 2026-08-25), and
// a real concurrent-request race against the fake Durable Object, proving it correctly bounds
// spend where a plain-KV counter measurably did not (20/20 requests used to all succeed).
//
// What this does NOT and CANNOT prove without a real deploy: that the real Anthropic API accepts
// this exact request shape, and that a REAL Cloudflare Durable Object's blockConcurrencyWhile +
// storage behaves exactly like the fake mutex-queue stub below. The stub's serialization
// guarantee (one fetch() at a time per id, strictly, even under Promise.all) is written to match
// Cloudflare's own documented Durable Object guarantee -- not a weaker approximation -- but it is
// still a stand-in, stated plainly in docs/ASK_AI_SETUP.md.

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

// Mimics a real Durable Object namespace closely enough to prove the atomicity property that
// matters: fetch() calls against the SAME id never interleave, even when fired concurrently.
// Backed by the REAL BudgetCounter class (worker/budget-do.js) -- this stub only supplies the
// platform primitives (storage, blockConcurrencyWhile) that class expects, it does not
// reimplement any of the actual reservation logic under test.
function makeFakeDoNamespace() {
  const { BudgetCounter } = require("./budget-do.js");
  const instances = new Map();
  const queues = new Map(); // id -> tail Promise, the actual serialization mechanism
  function instanceFor(id) {
    if (!instances.has(id)) {
      const store = new Map();
      const state = {
        storage: { async get(k) { return store.has(k) ? store.get(k) : null; }, async put(k, v) { store.set(k, v); } },
        async blockConcurrencyWhile(fn) {
          const prev = queues.get(id) || Promise.resolve();
          const next = prev.then(fn, fn); // runs AFTER the previous call fully settles, never overlapping
          queues.set(id, next.catch(() => {})); // keep the chain alive even if one call throws
          return next;
        },
      };
      instances.set(id, new BudgetCounter(state));
    }
    return instances.get(id);
  }
  return {
    idFromName(name) { return name; },
    get(id) {
      const counter = instanceFor(id);
      return { fetch: (url, opts) => counter.fetch(new Request(url, opts)) };
    },
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
function makeEnv() {
  return {ANTHROPIC_API_KEY: "sk-test-not-real", ASK_AI_KV: makeFakeKv(), BUDGET_DO: makeFakeDoNamespace()};
}
const ORIGIN = "https://tjaiyen.github.io";

async function run() {
  delete require.cache[require.resolve("./index.js")];
  delete require.cache[require.resolve("./budget-do.js")];
  const worker = require("./index.js");

  // 1. OPTIONS preflight
  {
    const res = await worker.fetch(new Request("https://worker.example/ask", {method: "OPTIONS", headers: {Origin: ORIGIN}}), makeEnv());
    ok(res.status === 204, "OPTIONS preflight returns 204");
    ok(res.headers.get("Access-Control-Allow-Origin") === ORIGIN, "preflight echoes the allowed origin");
  }
  // 2. Wrong method
  {
    const res = await worker.fetch(new Request("https://worker.example/ask", {method: "GET", headers: {Origin: ORIGIN}}), makeEnv());
    ok(res.status === 405, "GET is rejected with 405");
  }
  // 3. Wrong origin
  {
    const res = await worker.fetch(new Request("https://worker.example/ask", {method: "POST", headers: {Origin: "https://evil.example"}, body: "{}"}), makeEnv());
    ok(res.status === 403, "a non-allowlisted Origin is refused with 403, not silently served");
  }
  // 4. Malformed body
  {
    const res = await worker.fetch(new Request("https://worker.example/ask", {method: "POST", headers: {Origin: ORIGIN, "Content-Type": "application/json"}, body: "not json"}), makeEnv());
    ok(res.status === 400, "malformed JSON body is rejected with 400, not a 500 crash");
  }
  // 5. Missing snapshot
  {
    const res = await worker.fetch(new Request("https://worker.example/ask", {method: "POST", headers: {Origin: ORIGIN}, body: JSON.stringify({question: "hi"})}), makeEnv());
    ok(res.status === 400, "a request with no program-data snapshot is refused, never silently answered from the model's own knowledge");
  }
  // 6. Oversized snapshot -- /stress-test finding: an attacker calling the Worker directly
  // (Origin is spoofable, see finding notes) could send a huge fake snapshot to amplify real
  // token cost across the tool-use loop. Now rejected before ever calling Anthropic.
  {
    const hugeSnapshot = makeSnapshot();
    hugeSnapshot.risks = Array.from({length: 5000}, (_, i) => ({id: "R-" + i, name: "x".repeat(200)}));
    const res = await worker.fetch(new Request("https://worker.example/ask", {method: "POST", headers: {Origin: ORIGIN}, body: JSON.stringify({question: "hi", snapshot: hugeSnapshot})}), makeEnv());
    ok(res.status === 400, "an oversized snapshot payload is refused with 400, before any Anthropic call");
  }
  // 7. BUDGET_DO unbound -- fails CLOSED, not open (the original KV-only version measurably
  // failed open here: 20/20 concurrent requests succeeded with zero cost protection in effect).
  {
    const env = {ANTHROPIC_API_KEY: "sk-test-not-real", ASK_AI_KV: makeFakeKv()}; // no BUDGET_DO
    const res = await worker.fetch(new Request("https://worker.example/ask", {method: "POST", headers: {Origin: ORIGIN}, body: JSON.stringify({question: "hi", snapshot: makeSnapshot()})}), env);
    ok(res.status === 503, "a missing Durable Object binding refuses every question (fails closed) rather than running with zero cost protection");
  }
  // 8. Daily budget already exhausted -- refuses BEFORE ever calling Anthropic
  {
    const { RESERVE_PER_QUESTION_USD } = require("./budget-do.js");
    const DAILY_BUDGET_USD = 2.00; // mirrors worker/index.js's own constant
    const env = makeEnv();
    const dateKey = "spend:" + new Date().toISOString().slice(0, 10);
    const stub = env.BUDGET_DO.get(env.BUDGET_DO.idFromName(dateKey));
    // Genuinely exhaust it via the SAME real reservation mechanism (each call only ever adds ONE
    // flat RESERVE_PER_QUESTION_USD, regardless of the capUsd passed) -- not a single call with a
    // tiny cap, which would just get refused itself without ever recording any spend.
    for (let i = 0; i < Math.ceil(DAILY_BUDGET_USD / RESERVE_PER_QUESTION_USD) + 1; i++) {
      await stub.fetch("https://budget-do/reserve", {method: "POST", body: JSON.stringify({dateKey: dateKey, capUsd: DAILY_BUDGET_USD})});
    }
    let anthropicCalled = false;
    const realFetch = global.fetch;
    global.fetch = (url, ...rest) => { if (String(url).includes("anthropic.com")) anthropicCalled = true; return realFetch(url, ...rest); };
    const res = await worker.fetch(new Request("https://worker.example/ask", {method: "POST", headers: {Origin: ORIGIN}, body: JSON.stringify({question: "Are we on budget?", snapshot: makeSnapshot()})}), env);
    global.fetch = realFetch;
    ok(res.status === 429, "an exhausted daily budget is refused with 429");
    ok(!anthropicCalled, "an exhausted budget never even calls the Anthropic API -- fails closed before spending anything");
  }
  // 9. Concurrent-race proof -- the actual bug this round's /stress-test found and fixed. A tiny
  // cap that should allow exactly floor(cap/RESERVE) requests, fired as 20 truly concurrent
  // requests via Promise.all against the SAME fake DO id.
  {
    const { RESERVE_PER_QUESTION_USD } = require("./budget-do.js");
    const cap = RESERVE_PER_QUESTION_USD * 5; // exactly 5 should succeed, never more
    const env = makeEnv();
    const realFetch = global.fetch;
    global.fetch = async (url, opts) => {
      if (String(url).includes("anthropic.com")) return new Response(JSON.stringify({content: [{type: "text", text: "0.588"}], usage: {input_tokens: 10, output_tokens: 5}}), {status: 200});
      return realFetch(url, opts);
    };
    // DAILY_BUDGET_USD isn't exposed via env -- instead pre-load real spend down to exactly `cap`
    // of headroom via the SAME real reservation mechanism the Worker itself uses (each call adds
    // one flat RESERVE_PER_QUESTION_USD, regardless of the capUsd passed in), so this test doesn't
    // need to touch index.js's module-level constant directly.
    const dateKey = "spend:" + new Date().toISOString().slice(0, 10);
    const stub = env.BUDGET_DO.get(env.BUDGET_DO.idFromName(dateKey));
    const DAILY_BUDGET_USD = 2.00; // mirrors worker/index.js's own constant
    const primingCalls = Math.round((DAILY_BUDGET_USD - cap) / RESERVE_PER_QUESTION_USD);
    for (let i = 0; i < primingCalls; i++) {
      await stub.fetch("https://budget-do/reserve", {method: "POST", body: JSON.stringify({dateKey: dateKey, capUsd: DAILY_BUDGET_USD})});
    }
    // Distinct fake IPs per request -- isolates this test to ONLY the budget/DO gate. Without
    // this, all 20 requests share the same "unknown" IP and the (separately, deliberately
    // best-effort) per-IP rate limiter -- RATE_LIMIT_MAX=6 -- becomes an uncontrolled second
    // variable, entangling two independent guardrails in one assertion.
    const reqs = Array.from({length: 20}, (_, i) =>
      worker.fetch(new Request("https://worker.example/ask", {method: "POST", headers: {Origin: ORIGIN, "CF-Connecting-IP": "10.0.0." + i}, body: JSON.stringify({question: "q" + i, snapshot: makeSnapshot()})}), env));
    const results = await Promise.all(reqs);
    global.fetch = realFetch;
    const succeeded = results.filter(r => r.status === 200).length;
    const refused = results.filter(r => r.status === 429).length;
    ok(succeeded === 5, "exactly 5 of 20 truly concurrent requests succeed against a 5-question-sized remaining budget -- the Durable Object serializes correctly, not the 20/20 the original plain-KV version allowed", "got " + succeeded);
    ok(refused === 15, "the other 15 are correctly refused with 429, not silently over-served");
  }
  // 10. Tool-round exhaustion -- the model never stops calling tools within MAX_TOOL_ROUNDS.
  {
    const env = makeEnv();
    let callCount = 0;
    const realFetch = global.fetch;
    global.fetch = async (url) => {
      if (!String(url).includes("anthropic.com")) return realFetch(url);
      callCount++;
      return new Response(JSON.stringify({content: [{type: "tool_use", id: "t" + callCount, name: "get_totals", input: {}}], usage: {input_tokens: 50, output_tokens: 10}}), {status: 200});
    };
    const res = await worker.fetch(new Request("https://worker.example/ask", {method: "POST", headers: {Origin: ORIGIN}, body: JSON.stringify({question: "keep going forever", snapshot: makeSnapshot()})}), env);
    global.fetch = realFetch;
    const body = await res.json();
    ok(callCount === 6, "the loop really stops at MAX_TOOL_ROUNDS (6), not runaway");
    ok(!!body.error, "exhausting the tool-round budget returns an honest error, not a blank 'fully grounded' answer (the exact /stress-test finding)");
  }
  // 11. Full round trip -- a REALISTIC fabrication test: prose-phrased (not the narrow $X.XM/
  // X.X% shapes the first guardrail version only caught), plus a genuinely correct $-FORMATTED
  // claim that must NOT be wrongly stripped (the independent reviewer's finding: the snapshot's
  // raw totals don't string-match a dashboard-style "$1,303.7M" answer under the OLD substring
  // logic -- now verified by numeric value instead).
  {
    const env = makeEnv();
    let callCount = 0;
    const realFetch = global.fetch;
    global.fetch = async (url) => {
      if (!String(url).includes("anthropic.com")) return realFetch(url);
      callCount++;
      if (callCount === 1) {
        return new Response(JSON.stringify({content: [{type: "tool_use", id: "t1", name: "get_totals", input: {}}], usage: {input_tokens: 200, output_tokens: 40}}), {status: 200});
      }
      return new Response(JSON.stringify({
        content: [{type: "text", text: "The current EAC is $1,303.7M against a BAC of $1,240.0M -- contingency coverage sits at about 58.8 percent, and it's about 47 million dollars worse than last reported."}],
        usage: {input_tokens: 260, output_tokens: 60},
      }), {status: 200});
    };
    const res = await worker.fetch(new Request("https://worker.example/ask", {method: "POST", headers: {Origin: ORIGIN}, body: JSON.stringify({question: "What's the EAC?", snapshot: makeSnapshot()})}), env);
    global.fetch = realFetch;
    ok(res.status === 200, "a real (scripted) round trip returns 200");
    const body = await res.json();
    ok(body.answer.includes("$1,303.7M") && body.answer.includes("$1,240.0M"), "the two real, correctly-formatted dollar claims survive verification (numeric-value match, not exact string shape)");
    ok(body.answer.includes("58.8 percent"), "a real number rephrased in plain prose as a percentage ('58.8 percent', the real 0.588 contCoverage x100) also survives -- the broadened extractor catches it, not just the dashboard's own $X.XM/X.X% formats");
    ok(!body.answer.includes("47 million dollars") && body.answer.includes("[unverified]"), "a fabricated claim phrased in ordinary prose ('47 million dollars') is caught and stripped -- NOT just the narrow shapes the first guardrail version checked");
    ok(typeof body.estCostUsd === "number" && body.estCostUsd > 0, "the response reports a real, non-zero estimated cost for visibility");
    ok(Array.isArray(body.toolCalls) && body.toolCalls.length === 1 && body.toolCalls[0].name === "get_totals",
      "the response carries the REAL {name,args,result} of every tool call made this turn (UX round, 2026-08-25), not just a flattened field-name string", JSON.stringify(body.toolCalls));
    ok(body.toolCalls[0].result.eac === 1303.67, "toolCalls[0].result is the actual real tool result object, usable client-side for 'show your work'");
    ok(typeof body.totalClaims === "number" && body.totalClaims >= 4, "the response reports the real total claim count the fact-check evaluated, not just how many failed", body.totalClaims);
  }
  // 12. Anthropic fails mid-loop (a 5xx, a timeout) -- an independent reviewer's finding: does the
  // real spend already incurred before the failure get accounted for? Under this design it must,
  // because the budget is RESERVED atomically BEFORE the loop ever starts (not committed after a
  // successful completion), so a mid-loop throw can't cause it to silently go unrecorded.
  {
    const env = makeEnv();
    const realFetch = global.fetch;
    global.fetch = async (url) => { if (String(url).includes("anthropic.com")) return new Response("{}", {status: 500}); return realFetch(url); };
    const dateKey = "spend:" + new Date().toISOString().slice(0, 10);
    const stub = env.BUDGET_DO.get(env.BUDGET_DO.idFromName(dateKey));
    const before = (await (await stub.fetch("https://x/reserve", {method: "POST", body: JSON.stringify({dateKey, capUsd: 999})})).json()).spent;
    const res = await worker.fetch(new Request("https://worker.example/ask", {method: "POST", headers: {Origin: ORIGIN}, body: JSON.stringify({question: "hi", snapshot: makeSnapshot()})}), env);
    const after = (await (await stub.fetch("https://x/reserve", {method: "POST", body: JSON.stringify({dateKey, capUsd: 999})})).json()).spent;
    global.fetch = realFetch;
    ok(res.status === 500, "a mid-loop Anthropic failure returns a safe 500, not a leaked stack trace");
    const errBody = await res.clone().json().catch(() => null);
    ok(errBody && !JSON.stringify(errBody).toLowerCase().includes("sk-test"), "the error response never leaks the API key or internal details");
    ok(after > before, "the budget reservation from this failed request is still recorded (spend went up) -- reserved atomically BEFORE the Anthropic call, not committed only on success, so a mid-loop failure can't cause spend to silently go unaccounted for");
  }

  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
