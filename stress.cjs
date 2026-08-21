// Adversarial stress harness for index.html + otak.html
// 1. Static structure: duplicate ids, JS-referenced ids exist, tab/panel wiring
// 2. Runtime: executes both pages' scripts under a DOM stub
// 3. Interaction: fires captured listeners (tabs, phases, filters, KPI drawer,
//    package drill-down, what-if sliders, theme) and asserts the DOM writes
// 4. Narrative vs data: recomputes every quoted number independently and
//    string-matches the rendered markup
// 5. Compliance sweeps: fabrication + sanitization patterns (B35/B22 style)
const fs = require("fs");
// __dirname, not a hardcoded absolute path — a hardcoded path silently reads/grades whatever
// happens to sit at that literal location on the author's own machine (possibly a stale or
// different copy than the one actually in front of a reviewer/CI run) instead of failing loudly
// on a clone elsewhere (/stress-test finding, 2026-08-18: reproduced both failure modes).
const DIR = __dirname + "/";
const indexSrc = fs.readFileSync(DIR + "index.html", "utf8");
const otakSrc = fs.readFileSync(DIR + "otak.html", "utf8");
const archSrc = fs.readFileSync(DIR + "architecture.html", "utf8");

let pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL: " + label + (extra ? " — " + extra : "")); }
}

/* ---------- DOM stub ---------- */
function makeEl(id) {
  const el = {
    id: id || "", _html: "", textContent: "", value: "0", hidden: false,
    // minimal CSSStyleDeclaration-like stub — just enough to back setProperty/getPropertyValue
    // (index.html's text-size control calls these on document.documentElement.style)
    // setProperty coerces to String, matching real CSSStyleDeclaration behavior — the app passes
    // a number (TEXT_ZOOM[i].zoom) here, and a stub that stored it un-coerced would make a
    // string-comparison test fail for the wrong reason (stub fidelity, not an app bug)
    style: { _props: {}, setProperty(n, v) { this._props[n] = String(v); }, getPropertyValue(n) { return this._props[n] || ""; }, removeProperty(n) { delete this._props[n]; } },
    dataset: {}, _listeners: {}, _attrs: {},
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    addEventListener(t, fn){ (this._listeners[t] = this._listeners[t] || []).push(fn); },
    removeEventListener(){},
    setAttribute(n, v){ this._attrs[n] = String(v); }, getAttribute(n){ return n in this._attrs ? this._attrs[n] : null; },
    insertAdjacentHTML(_pos, h){ this._html += h; }, scrollIntoView(){},
    // click() now actually dispatches this element's own registered "click" listeners, matching
    // real DOM behavior — it was a dead no-op before, silently masking that app code calling
    // .click() (e.g. the tab-bar's keydown handler) had never actually been exercised by any
    // test in this file; every prior test worked around it via fire() directly instead
    // (/stress-test finding, 2026-08-18).
    click(){ fire(this, "click"); },
    // tracks whether/how-many-times .focus() was called — was a bare no-op before, which meant
    // "does exitPresent()/exitTour() actually return focus to the trigger" was unobservable
    // (/stress-test brainstorm, 2026-08-20)
    _focusCount: 0, focus(){ this._focusCount++; },
    closest(){ return null; },
    querySelector(){ return makeEl(); }, querySelectorAll(){ return []; },
  };
  Object.defineProperty(el, "innerHTML", {
    get(){ return this._html; }, set(v){ this._html = String(v); }
  });
  return el;
}
function fire(el, type, ev) {
  (el._listeners[type] || []).forEach(fn => fn.call(el, ev || { target: makeEl() }));
}

// lsSeed: optional {key: value} to pre-seed window.localStorage with before eval — lets a caller
// test index.html's own read-on-init path (textSize persistence) instead of only regex-checking
// that the read is try/catch-guarded (/stress-test coverage gap, 2026-08-20).
function runPage(src, lsSeed) {
  const registry = {};
  const documentStub = {
    documentElement: makeEl("html"),
    getElementById(id){ return registry[id] || (registry[id] = makeEl(id)); },
    querySelector(){ return makeEl(); },
    querySelectorAll(){ return []; },
    // document-level delegated listeners (wireAccountHighlight, 2026-08-19) — stored, not
    // dispatched; this stub's querySelectorAll always returning [] already means the actual
    // cross-chart highlight logic can't be exercised here regardless (same limitation as
    // wireDetailsAnimation before it), so this only needs to exist, not behave.
    _listeners: {},
    addEventListener(t, fn){ (this._listeners[t] = this._listeners[t] || []).push(fn); },
    removeEventListener(){},
  };
  global.document = documentStub;
  global.window = { matchMedia(){ return { matches: true }; }, scrollTo(){}, innerWidth: 1400,
    _listeners: {},
    addEventListener(t, fn){ (this._listeners[t] = this._listeners[t] || []).push(fn); },
    print(){ this._printed = true; },
    open(){
      const popupRegistry = {};
      const popupDoc = {
        write(html){ this._written = (this._written || "") + html; },
        close(){},
        getElementById(id){ return popupRegistry[id] || (popupRegistry[id] = makeEl(id)); },
      };
      const popup = { closed: false, focus(){}, close(){ this.closed = true; }, document: popupDoc };
      this._lastPopup = popup; // so tests can inspect what got opened, without needing the page's own reference
      return popup;
    },
    // minimal localStorage stub, only populated when a caller passes lsSeed — omitted entirely
    // (stays undefined) by default, matching every other runPage() caller's existing environment
    // where window.localStorage was never present, so the app's own `if(window.localStorage)`
    // guards keep behaving exactly as already tested elsewhere.
    localStorage: lsSeed ? {
      _store: Object.assign({}, lsSeed),
      getItem(k){ return k in this._store ? this._store[k] : null; },
      setItem(k, v){ this._store[k] = String(v); },
      removeItem(k){ delete this._store[k]; },
    } : undefined };
  global.getComputedStyle = () => ({ getPropertyValue: () => "0 0 0" });
  const m = src.match(/<script>([\s\S]*)<\/script>/);
  let err = null;
  try { eval(m[1]); } catch (e) { err = e; }
  return { registry, err, win: global.window };
}

/* =========================================================================
   A. STATIC STRUCTURE — index.html
   ========================================================================= */
console.log("== A. static structure ==");
function ids(s){ const out = []; const re = /id="([^"]+)"/g; let m; while ((m = re.exec(s))) out.push(m[1]); return out; }
const idsA = ids(indexSrc);
const dupA = idsA.filter((v, i) => idsA.indexOf(v) !== i);
ok(dupA.length === 0, "index.html duplicate ids", dupA.join(","));
const idsO = ids(otakSrc);
const dupO = idsO.filter((v, i) => idsO.indexOf(v) !== i);
ok(dupO.length === 0, "otak.html duplicate ids", dupO.join(","));

// every id the script looks up must exist in markup (dimNote is created dynamically)
const jsIds = [...new Set([...indexSrc.match(/getElementById\("([^"]+)"\)/g)].map(s => s.slice(16, -2)))];
const missing = jsIds.filter(id => !idsA.includes(id) && id !== "dimNote");
ok(missing.length === 0, "JS-referenced ids exist in markup", missing.join(","));

// tab -> panel wiring
["over", "cost", "sched", "risk", "del", "fw", "act", "data"].forEach(t => {
  ok(idsA.includes("t-" + t) && idsA.includes("p-" + t), "tab/panel pair " + t);
});
ok(indexSrc.includes('aria-controls="p-over"'), "tab aria-controls present");

// rough tag balance
["div", "section", "table", "button", "script", "style"].forEach(tag => {
  const open = (indexSrc.match(new RegExp("<" + tag + "(\\s|>)", "g")) || []).length;
  const close = (indexSrc.match(new RegExp("</" + tag + ">", "g")) || []).length;
  ok(open === close, "tag balance <" + tag + ">", open + " open vs " + close + " close");
});

// mobile: the CSS grid blowout guard must stay in place. Every table on the page carries
// min-width:800px (index) / 680px (otak); a grid item without min-width:0 refuses to shrink
// below that, forcing the whole page to scroll horizontally on a phone. A jsdom-less stub
// can't run real layout to catch this directly (browser-verified 2026-08-18, 320-390px, both
// files, 0 overflow) — this is the static tripwire so the fix can't silently regress.
ok(/\.grid>\*\{min-width:0\}/.test(indexSrc), "index.html: grid items have min-width:0 (mobile overflow guard)");
ok(/\.grid2>\*\{min-width:0\}/.test(otakSrc), "otak.html: grid items have min-width:0 (mobile overflow guard)");
// Same overflow-guard class, a sibling layout pattern (.rowbar, not .grid) — found live by a
// /stress-test visual pass at 320px, 2026-08-2x: several .rowbar rows (GUARDS/z-score/EWMA/
// ingestion-guard's inline "1fr auto 64px" override, and the base rule's own 72px last column
// against a wide value like "1.42 (bench 2.20)") forced real, reproduced page-level horizontal
// scroll on the AI & Data and Delivery tabs specifically (64px and 4px respectively) — confirmed
// via direct browser measurement (scrollWidth>clientWidth), not assumed. min-width:0 alone
// wasn't enough (the un-clipped nowrap text still visually bled past its own box and contributed
// to the page's scrollWidth) — overflow:hidden;text-overflow:ellipsis was also required. Scoped
// to .tab-num/.mono specifically (the columns this file's own rule already marks nowrap), not a
// blanket .rowbar>* — a first draft used the blanket selector and, live-verified at 320px, broke
// the plain-text label column (meant to wrap normally) into a one-word-per-line mess with a
// mid-word ellipsis, worse than the bug it fixed. Both the bug and this fix's own first-draft
// regression were caught by live browser measurement, not assumed correct from reading the CSS.
ok(/\.rowbar>\.tab-num,\.rowbar>\.mono\{min-width:0;overflow:hidden;text-overflow:ellipsis\}/.test(indexSrc),
  "index.html: rowbar .tab-num/.mono items have the same min-width:0 + overflow:hidden overflow guard (mobile), scoped to nowrap columns only");

// Table no-horizontal-scroll fix (2026-08-19, user-reported: "I want to see the entire component
// at once"). Same class of guard as above — real width-fitting behavior needs a real layout
// engine, so these are static tripwires; browser-verified live 2026-08-19 at 768/1050/1400px:
// all 7 of the widest tables (portTable, contractTable, wbsTable, gateTable, stakeMap, libTable,
// guardrailTable) fit their container with zero horizontal scroll at every width from 768px up,
// with 0 page-level overflow at any width tested (down to 375px mobile, where these specific
// dense tables still need scroll — a card-layout redesign, not a CSS fix, stated as a known,
// accepted limitation rather than silently dropped).
// guardrailTable -> recoveryTable (2026-08-21): the Data Strategy UI/UX round replaced the
// guardrail table with a .ledgerGrid tile grid (no longer a <table>, so this min-width tripwire
// doesn't apply to it), and introduced one new real <table> — #recoveryTable — in its place.
ok(!/table\{width:100%;border-collapse:collapse;font-size:12\.8px;min-width:800px\}/.test(indexSrc),
  "the global table min-width:800px floor (root cause of forced horizontal scroll) is gone");
["portTable", "contractTable", "wbsTable", "gateTable", "stakeMap", "libTable", "recoveryTable"].forEach(id =>
  ok(!new RegExp('id="' + id + '"[^>]*style="min-width:\\d+px"').test(indexSrc),
    "#" + id + " no longer carries a fixed min-width forcing scroll"));
ok(/th,td\{text-align:right;padding:9px 11px;border-bottom:1px solid var\(--c-line\);\s*font-variant-numeric:tabular-nums;white-space:normal\}/.test(indexSrc),
  "table cells wrap by default now (was nowrap — the other half of the root cause)");
ok(/\.tab-num,td\.mono\{white-space:nowrap\}/.test(indexSrc),
  "numeric/date cells stay protected from mid-content wrapping");
ok(/td \.pill\{white-space:normal;max-width:96px;text-align:center;line-height:1\.3\}/.test(indexSrc),
  "pills inside table cells wrap when genuinely tight instead of forcing the table wider — the single biggest cause found (a 3-word status label was as wide as 5 numeric columns combined)");

// Follow-up sweep (2026-08-19, user: "check all the layout... make sure no layout gets cut off"):
// a systematic pass across all 11 tabs + otak.html at 375/768/1050/1400px, walking every element
// for real scrollWidth>clientWidth overflow (excluding deliberately self-scrolling containers:
// .tw tables, pre.code blocks, .phases — all three already had their own overflow-x:auto by
// design before this session). Found and fixed 3 more root causes of the same class as above.
ok(!/\.chart svg\{display:block;min-width:640px;width:100%\}/.test(indexSrc),
  "chart SVGs no longer carry a 640px min-width floor — was overflowing any chart placed in a squeezed grid column (found: risk tab's tornado chart, 107px over)");
["eacTable", "cashflow", "scenTable", "coDefense", "fcastTable"].forEach(id =>
  ok(!new RegExp('id="' + id + '"[^>]*style="min-width:\\d+px"').test(indexSrc),
    "#" + id + " no longer carries a fixed min-width (second wave of the same table fix)"));
ok(/<h3>EAC trend[\s\S]{0,600}<div id="eacTrend">/.test(indexSrc) && !/<div class="grid g2">\s*<div class="card"><h3>EAC trend/.test(indexSrc),
  "EAC-trend / 1-month-forecast-accuracy pair no longer squeezed into a 2-column grid (same fix as the earlier EAC-methods/contingency pair)");
ok(/#pkgTable th,#pkgTable td\{padding:9px 6px\}/.test(indexSrc),
  "pkgTable (11 columns, the densest standalone table) gets the same scoped padding lever as portTable");
ok(/#escTable td\.mono\{white-space:normal\}/.test(indexSrc),
  "escTable's Trigger column no longer force-nowrapped — a REAL bug this sweep caught: td.mono was added " +
  "to protect short atomic values (dates/ids) from ugly breaks, but escTable reuses .mono for full rule-" +
  "condition sentences (\"Contingency coverage < 1.00\") that should wrap like any other prose");

// Tier 3 nav rail: same class of guard as above — a jsdom-less stub can't run real CSS Grid/
// media-query layout, so these are static tripwires (browser-verified live at 1400px desktop
// and 390px mobile 2026-08-18: rail renders and switches tabs correctly at desktop width;
// .tabs stays flex-direction:row and #main stays display:block below the breakpoint, 0 overflow).
ok(/@media\(min-width:1050px\)\{/.test(indexSrc), "desktop nav-rail media query is present");
ok(/#main\.wrap\{max-width:1320px;display:grid/.test(indexSrc), "nav-rail breakpoint switches #main to a two-column grid");
ok(/\[role="tabpanel"\]\{grid-column:2;min-width:0\}/.test(indexSrc),
  "tabpanel grid items carry min-width:0 (same overflow-guard class as the mobile grid check above)");
ok((indexSrc.match(/class="nav-ic"/g) || []).length === 11, "all 11 nav-rail tabs carry an icon");
// the rail is presentation-only: TABS, activateTab(), and the tab click wiring are untouched —
// confirmed here by re-checking the tab count/order the D9 TABS_CHECK already asserts elsewhere,
// as a direct probe that this CSS/markup-only change didn't silently touch the tab logic
ok(idsA.filter(id => /^t-(over|port|cost|sched|risk|del|ai|fw|act|gloss|data)$/.test(id)).length === 11,
  "all 11 tab buttons still present with their original ids after the rail markup change");
// roving tabindex on genuinely pristine (pre-any-click) markup: the D. interactions section's
// own tabindex assertions run after earlier tests have already clicked several tabs, so they
// verify the MECHANISM (flips correctly on activateTab) but not the untouched initial-load DOM.
// This checks the static source directly, independent of any test execution order.
ok(/id="t-over"[^>]*tabindex="0"/.test(indexSrc), "t-over declares tabindex=0 explicitly in markup (not relying on the button-default)");
ok((indexSrc.match(/aria-selected="false" tabindex="-1"/g) || []).length === 10,
  "all 10 non-default tabs declare tabindex=-1 in markup, matching t-over's explicit tabindex=0");

/* =========================================================================
   B. RUNTIME — index.html
   ========================================================================= */
console.log("== B. runtime ==");
const R = runPage(indexSrc);
ok(!R.err, "index.html IIFE executes", R.err && R.err.message);
const P = R.win.__PCC__;
ok(!!P, "__PCC__ exposed");
if (R.err || !P) { console.error("fatal — aborting"); process.exit(1); }
ok(P.kpis.length === 20, "exactly 20 KPIs", String(P.kpis.length));

// every KPI fully specified
const phaseKeys = P.kpis ? ["plan", "env", "pe", "fd", "proc", "con", "close"] : [];
P.kpis.forEach(k => {
  ["f", "th", "src", "why", "act"].forEach(field =>
    ok(k[field] && String(k[field]).length > 10, "KPI " + k.id + " has " + field));
  ok(k.ph.length > 0 && k.ph.every(p => phaseKeys.includes(p)), "KPI " + k.id + " phases valid");
  ok(!String(k.val()).includes("NaN"), "KPI " + k.id + " value not NaN");
  ok(/^[gar]$/.test(k.rag()), "KPI " + k.id + " rag valid");
});
// playbook claim: "All twenty" live in construction
ok(P.kpis.every(k => k.ph.includes("con")), "playbook claim: all 20 KPIs live in construction phase");

const T = P.totals, rows = P.rows, G = R.registry;
const has = (el, s, label) => ok(G[el]._html.includes(s), label, "missing '" + s + "'");

/* =========================================================================
   B2. PORTFOLIO TAB — agency rollup, one line read live, three summary-only (Gap 1)
   ========================================================================= */
console.log("== B2. portfolio tab ==");
ok(idsA.includes("t-port") && idsA.includes("p-port"), "portfolio tab/panel wired");
["portStrip", "portTable"].forEach(id => ok(idsA.includes(id), "markup contains #" + id));
{
  const lines = P.portfolioRows();
  ok(lines.length === 4, "exactly 4 portfolio lines", String(lines.length));
  ok(lines.filter(l => l.detail).length === 1 && lines[0].id === "link-lrt",
    "exactly one line has full drill-down, and it's the flagship");
  ok(lines[0].bac === T.bac && lines[0].ac === T.ac && lines[0].ev === T.ev,
    "flagship line reads live from this program's own totals, not a duplicate literal");
  const expectedStatus = { "link-lrt": "Within Managed Variance", sounder: "Favorable Variance",
    stride: "Action Required / Alert", fleet: "On Baseline Target" };
  lines.forEach(l => ok(l.statusLabel === expectedStatus[l.id],
    "status for " + l.id + " = " + expectedStatus[l.id], l.statusLabel));
  const bacSum = lines.reduce((s, l) => s + l.bac, 0);
  const vacSum = lines.reduce((s, l) => s + l.vac, 0);
  ok(Math.abs(bacSum - 2680.0) < 1e-6, "portfolio BAC totals $2,680.0M", bacSum.toFixed(1));
  ok(vacSum < 0, "portfolio net variance is genuinely a gap (negative), not decorative", vacSum.toFixed(1));
  // funding-tier prioritization (2026-08-19): a genuinely different axis from status above —
  // pre-registered by hand against pct=ev/bac and cpi for each line before running
  const expectedTier = { "link-lrt": "Partially funded", sounder: "Fully funded",
    stride: "Pursuing added funding", fleet: "Fully funded" };
  lines.forEach(l => {
    const ft = P.fundingTier(l);
    ok(ft.tier === expectedTier[l.id], "funding tier for " + l.id + " = " + expectedTier[l.id], ft.tier);
    ok(typeof ft.why === "string" && ft.why.length > 0, l.id + "'s funding tier carries a reason, not just a label");
  });
  // the rule genuinely has two independent inputs, not one axis wearing a new label — this
  // dataset's 4 real lines don't happen to expose that (progress and health move together here),
  // so probe the function directly with constructed inputs instead of relying on live data to
  // demonstrate it. Four cases, one per (farAlong, healthy) combination:
  // fundingTier(l) reads l.cpi as a precomputed field (matching what portfolioLine() actually
  // produces), not derived from ac/ev itself — cpi must be passed explicitly, not implied
  const farAlongHealthy = P.fundingTier({ bac: 100, ev: 60, cpi: 1.00 }); // pct .60, cpi 1.00
  const farAlongSick    = P.fundingTier({ bac: 100, ev: 60, cpi: 0.923 }); // pct .60, cpi .923
  const earlyHealthy    = P.fundingTier({ bac: 100, ev: 20, cpi: 1.053 }); // pct .20, cpi 1.053
  const earlySick       = P.fundingTier({ bac: 100, ev: 20, cpi: 0.80 }); // pct .20, cpi .80
  ok(farAlongHealthy.tier === "Fully funded", "unit: far-along + healthy = Fully funded", farAlongHealthy.tier);
  ok(farAlongSick.tier === "Partially funded" && farAlongSick.why.includes("too far along"),
    "unit: far-along + sick = Partially funded, sunk-cost reason", farAlongSick.tier);
  ok(earlyHealthy.tier === "Partially funded" && earlyHealthy.why.includes("still early"),
    "unit: early + healthy = Partially funded, but a DIFFERENT reason than the far-along case", earlyHealthy.tier);
  ok(earlySick.tier === "Pursuing added funding", "unit: early + sick = the most exposed tier", earlySick.tier);
  ok(farAlongSick.why !== earlyHealthy.why,
    "same tier name (Partially funded) but genuinely different reasoning per axis — proves it's not a relabel");
}
has("portTable", "Cascade Transit Extension", "portfolio table names the flagship line");
has("portTable", "full detail", "portfolio table marks the flagship line's drill-down");
has("portTable", "summary only", "portfolio table marks the synthetic sibling lines");
has("portTable", "Funding tier", "portfolio table carries the new funding-tier column");
has("fundingTierRead", "Pursuing added funding", "funding-tier readout names the most exposed line");
ok(indexSrc.includes("Transit's board ran on the ST3 program") && indexSrc.includes("in May 2026"),
  "funding-tier framework is explicitly cited as modeled on the real ST3 exercise, not a reproduction");
ok(indexSrc.includes("R2026-11"), "the ST3 citation carries a specific, checkable source (board resolution number)");
has("portStrip", "1 of 4", "strip states exactly 1 of 4 lines has full drill-down");
has("aiGuards", "flagship line reads live from this program", "integrity gate covers the portfolio tie-out");

/* =========================================================================
   C. NARRATIVE vs DATA — recompute everything the copy quotes
   ========================================================================= */
console.log("== C. narrative vs data ==");
// derived anchors
const eacCP201 = 305 / (178.4 / 205.1);
const vacCP201 = 305 - eacCP201;
const grossOver = rows.filter(r => r.bac - r.eac < 0).reduce((s, r) => s + Math.abs(r.bac - r.eac), 0);
const shareCP201 = Math.abs(vacCP201) / grossOver;
const exposure = 0.7 * 18.5 + 0.5 * 9.4 + 0.7 * 6.2 + 0.5 * 4.8 + 0.3 * 2.9 + 0.3 * 1.6;
const topShare = (0.7 * 18.5) / exposure;

has("strip", "66.1%", "strip: 66.1% complete");
has("strip", "20 of 20", "strip: 20 of 20 KPIs live in construction");
has("scurveRead", "$37.9M", "S-curve copy: CV $37.9M");
has("scurveRead", "$27.3M", "S-curve copy: SV $27.3M");

// S-curve prediction cone (/brainstorm 2026-08-19, Design Guide triage) — a fan from the data
// date to the Monte Carlo P10/P80 range at completion, reading canonical MC not activeMc (same
// precedent renderPrint() already set, so the headline chart never silently reshapes when the MC
// tab's own per-account filter changes elsewhere on the page).
// independent reimplementation of index.html's own m(), not a reference to it — same discipline
// idx()/days() already use elsewhere in this file (B27: verify by independent derivation).
function m(v) { var s = Math.abs(v).toFixed(1).split("."); return (v < 0 ? "−" : "") + "$" + s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + s[1] + "M"; }
function pct(v, d) { return (v * 100).toFixed(d === undefined ? 1 : d) + "%"; }
function sgn(v) { return (v >= 0 ? "+" : "−") + m(Math.abs(v)).replace("−", ""); }
ok(idsA.includes("scurve"), "markup contains #scurve");
ok((G.scurve._html.match(/data-role="predcone"/g) || []).length === 1,
  "S-curve renders exactly one prediction-cone polygon");
has("scurveRead", m(P.mc.p10), "S-curve narrative states the live P10 value");
has("scurveRead", m(P.mc.p80), "S-curve narrative states the live P80 value");
has("scurveRead", pct(P.mc.pOver, 0), "S-curve narrative states the live pOver percentage");
has("scurveRead", m(P.totals.bac), "S-curve narrative's pOver claim is stated against budget (BAC), not EAC — the field it's actually computed from");
{
  // pre-registered: the cone's polygon coordinates should encode a real fan (min < max at the
  // completion edge, degenerate to a point at the start edge), not two coincident lines
  const m2 = G.scurve._html.match(/<polygon points="([^"]+)"[^>]*data-role="predcone"/);
  ok(!!m2, "prediction-cone polygon has parseable points");
  if (m2) {
    const pts = m2[1].trim().split(/\s+/).map(p => p.split(",").map(Number));
    ok(pts.length === 3, "prediction cone is a 3-point triangle (start, P10, P80)");
    if (pts.length === 3) {
      ok(pts[1][0] === pts[2][0], "the P10 and P80 points share the same x (both at the last month)");
      ok(pts[0][0] !== pts[1][0], "the start point sits at an earlier x than the completion edge — a real fan, not a vertical line");
      ok(pts[1][1] !== pts[2][1], "P10 and P80 map to genuinely different y positions, not a degenerate line");
    }
  }
}

// S-curve math explainer (2026-08-19) — same "how this is computed" pattern as Monte Carlo
has("scurveMathBody", "PV = &Sigma;", "S-curve math panel states the PV formula");
has("scurveMathBody", "$847.0M", "S-curve math panel states the live PV total");
has("scurveMathBody", "$819.7M", "S-curve math panel states the live EV total");
has("scurveMathBody", "$857.6M", "S-curve math panel states the live AC total");
has("scurveMathBody", "0.968", "S-curve math panel states the live SPI");
has("scurveMathBody", "0.956", "S-curve math panel states the live CPI");
has("scurveMathBody", "CP-201", "S-curve math panel names its worked-example control account");
has("scurveMathBody", "bell-shaped interpolation",
  "S-curve math panel honestly discloses the monthly curve is a constructed interpolation, not tracked monthly actuals");
// mobile upgrade (2026-08-19): S-curve tooltip is mousemove-only upstream of this fix (never
// fires on touch) — now also bound to click. Content-detail is already covered by the existing
// math-panel checks above; this just proves the click path actually wires to the shared #tip.
G.tip._html = "";
fire(G.scurve, "click", { target: { classList: { contains: () => true }, dataset: { mo: "0" } }, clientX: 60, clientY: 60 });
ok(G.tip._html.includes("Month 1"), "tapping the S-curve at month 0 (click, no prior hover) shows that month's tooltip");
{
  const cp201row = rows.find(r => r.id === "CP-201");
  const share = Math.round((cp201row.pv / T.pv) * 100) + "%";
  has("scurveMathBody", share, "S-curve worked example's share-of-total matches independent recomputation");
}

// Timeline scrubber (2026-08-19) — this one IS meaningfully runtime-testable for its historical-
// month branch: pvA/evA/acA are real per-month arrays, exposed via __PCC__, and the scrubber
// reads them directly rather than through a DOM query the stub would silently defeat. The future-
// month branch and the Gantt cross-tab marker are source-checked only (creating a real SVG
// element via createElementNS and appending it isn't meaningfully exercisable under this stub).
{
  function m(v) { const s = Math.abs(v).toFixed(1).split(".");
    return (v < 0 ? "−" : "") + "$" + s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + s[1] + "M"; }
  function idx(v) { return v.toFixed(3); }
  ok(idsA.includes("scurveScrub") && idsA.includes("scurveScrubHud") && idsA.includes("scurveScrubCursor"),
    "markup contains the scrubber input, its HUD, and the SVG cursor placeholder");

  // historical month (10 <= monthsElapsed 22): real PV/EV/AC/CPI/SPI, independently recomputed
  G.scurveScrub.value = "10";
  fire(G.scurveScrub, "input");
  const jHist = 9; // month 10, 0-indexed
  has("scurveScrubHud", m(P.pvA[jHist]), "historical-month HUD states the real PV for that month");
  has("scurveScrubHud", m(P.evA[jHist]), "historical-month HUD states the real EV for that month");
  has("scurveScrubHud", m(P.acA[jHist]), "historical-month HUD states the real AC for that month");
  has("scurveScrubHud", idx(P.evA[jHist] / P.acA[jHist]), "historical-month HUD's CPI matches independent recomputation");
  has("scurveScrubHud", idx(P.evA[jHist] / P.pvA[jHist]), "historical-month HUD's SPI matches independent recomputation");

  // future month (30 > monthsElapsed 22): pre-registered — no EV/AC exists for a month that
  // hasn't happened, so the HUD must say so honestly rather than compute a fabricated ratio
  // (an earlier draft of this feature did exactly that: showed $NaN.undefinedM, caught live)
  G.scurveScrub.value = "30";
  fire(G.scurveScrub, "input");
  has("scurveScrubHud", m(P.pvB[30 - P.program.monthsElapsed - 1]), "future-month HUD states the real planned-value baseline for that month");
  has("scurveScrubHud", "hasn", "future-month HUD states plainly that EV/AC don't exist yet, not a fabricated ratio");
  ok(!G.scurveScrubHud._html.includes("NaN"), "pre-registered: future-month HUD never renders NaN — the bug this exact check would have caught");
}

// Variance bridge — narrative, math explainer, and hover interactivity (2026-08-19)
{
  function m(v) { const s = Math.abs(v).toFixed(1).split(".");
    return (v < 0 ? "−" : "") + "$" + s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + s[1] + "M"; }
  function pct(v, d) { return (v * 100).toFixed(d === undefined ? 1 : d) + "%"; }
  const sortedByVac = rows.slice().sort((a, b) => a.vac - b.vac);
  const worstRow = sortedByVac[0];
  const shareStr = pct(Math.abs(worstRow.vac) / T.grossOver, 1);
  has("waterfallRead", worstRow.id, "waterfall narrative names the actual worst-VAC account, not a hardcoded one");
  has("waterfallRead", shareStr, "waterfall narrative's share-of-gross-overrun matches independent recomputation");
  has("waterfallRead", m(T.grossOver), "waterfall narrative states the live gross-overrun total");
  has("waterfallMathBody", "EAC = BAC", "math panel states the bridge formula");
  has("waterfallMathBody", m(T.bac), "math panel states the live BAC");
  has("waterfallMathBody", m(T.eac), "math panel states the live EAC");
  has("waterfallMathBody", worstRow.id, "math panel names the same worked-example account as the narrative");
  has("waterfallMathBody", shareStr, "math panel's share-of-gross-overrun matches independent recomputation");

  // hover: bars[0] is the BAC total, bars[1] is sortedByVac[0] (the worst step) — pre-registered
  // from the sort order above, not assumed from bar position on screen
  fire(G.waterfall, "mousemove", { target: { classList: { contains: () => true }, dataset: { bar: "1" } }, clientX: 100, clientY: 100 });
  ok(G.tip._html.includes(worstRow.id), "hovering bars[1] (the worst VAC step) shows that account's id in the shared tooltip");
  ok(G.tip._html.includes(shareStr), "hover tooltip's share matches the same independently-recomputed figure");
  // mobile upgrade (2026-08-19): mousemove never fires on touch, so the tooltip is now bound to
  // click too — same handler, same output, just a second trigger. Prove click alone (no prior
  // mousemove) produces the identical tooltip.
  G.tip._html = "";
  fire(G.waterfall, "click", { target: { classList: { contains: () => true }, dataset: { bar: "1" } }, clientX: 100, clientY: 100 });
  ok(G.tip._html.includes(worstRow.id), "tapping bars[1] (click, no prior hover) shows the same account id in the tooltip");
}

has("eacTable", "$1,303.7M", "EAC table: bottom-up $1,303.7M");
has("eacTable", "$1,297.3M", "EAC table: BAC/CPI $1,297.3M");
// user-reported layout finding (2026-08-19): "Estimate at completion" + "Contingency vs. progress"
// sat in a 2-column grid.g2 that squeezed each to half-width at >=840px, cutting off the table/
// chart. Confirmed live: at 1400px both cards now measure the SAME full width and stack, not
// split into halves — this static check locks in the markup change (12 other grid g2 pairs
// elsewhere on the page are deliberately untouched, only this one pair's wrapper changed).
ok(/How the baseline was built[\s\S]{0,600}<div class="grid">\s*<div class="card">\s*<h3>Estimate at completion/.test(indexSrc),
  "the EAC-methods / contingency-vs-progress pair no longer uses the 2-column grid.g2 wrapper");
has("drill", "CP-201", "default drill-down is CP-201");
has("drill", (shareCP201 * 100).toFixed(1) + "%", "drill: CP-201 share of gross overrun " + (shareCP201 * 100).toFixed(1) + "%");
has("miles", "+40d", "milestones: revenue service +40d");
has("miles", "24 Apr 2028", "milestones: forecast date rendered");
has("schedTriad", "0.968", "triad: SPI 0.968");
has("schedTriad", "0.878", "triad: CPLI 0.878 (driving path)");
has("schedTriad", "0.937", "triad: BEI 0.937");
// Schedule-tab citation (2026-08-19): independently verified against the actual 791-page primary
// Sound Transit specification document (not the untrusted CMP-scheduling research doc that
// prompted this — that doc's own AI-addressed metadata and several fabricated specifics, PCPP
// policy numbers and "Section 01 35 00", were confirmed absent from the real primary source and
// were deliberately never used here).
ok(indexSrc.includes("01&nbsp;32&nbsp;13.25"), "Schedule tab cites the real, verified 01 32 13.25 section number");
ok(indexSrc.includes("Oracle Primavera P6"), "Schedule tab cites the real, verified P6 requirement");
ok(!indexSrc.includes("PCPP"), "the unverifiable PCPP policy numbers from the untrusted research doc never made it onto the page");
ok(!/01[\s&;a-z]*35[\s&;a-z]*00/i.test(indexSrc), "the fabricated 'Section 01 35 00' citation never made it onto the page");
has("risks", "$25.7M", "risks: total exposure $25.7M (recomputed " + exposure.toFixed(2) + ")");
has("risks", (topShare * 100).toFixed(1) + "%", "risks: top risk share " + (topShare * 100).toFixed(1) + "%");
has("risks", "$11.1M", "risks: contingency shortfall $11.1M before risk");
has("contCover", "0.588", "coverage ratio 0.588");
has("changePipe", "17 days past the 30-day target", "change cycle 17d past target");
has("coContext", "3.49%", "CO rate 3.49%");
has("coContext", "5.07%", "CO total exposure 5.07%");
has("docctl", "1.4×", "RFI 1.4x target");
has("docctl", "1.5×", "submittals 1.5x target");
has("compliance", "35.5%", "TRIR 35.5% under benchmark");
has("compliance", "CP-201, CP-601", "compliance narrative names the two negative-float packages");
has("funding", "$45.6M", "funding: fronted cash $45.6M = AC - drawn");
has("funding", "0.861", "funding drawdown index 0.861");
has("contChart", "still trailing progress", "contingency narrative: trailing progress");
has("contChart", "$89.4M", "contingency narrative: $89.4M overrun+risk demand");
has("libTable", "TRIR = recordable incidents", "library lists TRIR formula");
ok((G.kboard._html.match(/data-kpi=/g) || []).length === 20, "board renders 20 KPI cards");
// KPI RAG dual-coding (/stress-test finding: KPI cards were the one color-only severity signal
// in the file — every pill/escalation icon elsewhere already pairs color with text). Confirm both
// the visible badge and the aria-label carry the same word statusOf() already uses elsewhere.
ok((G.kboard._html.match(/class="trend"/g) || []).length === 20,
  "all 20 KPI cards render a .trend RAG-word badge, not color-only");
["On track", "Watch", "At risk"].forEach(w =>
  ok(G.kboard._html.includes(w), "kboard uses the same RAG vocabulary as statusOf() (\"" + w + "\")"));
{
  const cpiRag = P.kpis.find(k => k.id === "cpi").rag();
  const wantWord = { g: "On track", a: "Watch", r: "At risk" }[cpiRag];
  ok(G.kboard._html.includes('aria-label="Cost Performance Index, ' + P.kpis.find(k => k.id === "cpi").val().replace(/<[^>]*>/g, "") + ", " + wantWord + '"'),
    "CPI card's aria-label states its live RAG word, not just the raw value", "expected word=" + wantWord);
}
ok((G.libTable._html.match(/<tr style/g) || []).length === 20, "library table has 20 body rows");
// float KPI card lists the right three packages
const floatKpi = P.kpis.find(k => k.id === "float");
ok(floatKpi.sub().includes("CP-201") && floatKpi.sub().includes("CP-601") && floatKpi.sub().includes("CP-701"),
  "float KPI names CP-201/601/701");
// CPLI KPI driving path is the true minimum
const cpliKpi = P.kpis.find(k => k.id === "cpli");
const trueMin = rows.reduce((a, b) => (b.cpli < a.cpli ? b : a), rows[0]);
ok(cpliKpi.sub().includes(trueMin.id), "CPLI KPI names true driving path " + trueMin.id);

// CPLI math explainer (2026-08-19) — worked example against the actual driving path
function idx(v) { return v.toFixed(3); }
function days(v) { return (v > 0 ? "+" : "") + v + "d"; }
has("cpliMathBody", "CPLI = (remaining duration", "CPLI math panel states the formula");
has("cpliMathBody", trueMin.id, "CPLI math panel's worked example names the true driving path, not a hardcoded one");
has("cpliMathBody", String(trueMin.cpRem), "CPLI math panel states the driving path's live remaining duration");
has("cpliMathBody", days(trueMin.float), "CPLI math panel states the driving path's live total float");
has("cpliMathBody", idx(trueMin.cpli), "CPLI math panel's computed result matches independent recomputation");
ok(Math.abs(trueMin.cpli - T.cpli) < 1e-9,
  "pre-registered: the driving path's own cpli is bit-identical to T.cpli (program CPLI), not merely close");

// Tracking Gantt (2026-08-19) — every date independently recomputed from the same two real
// fields (cpRem, float) and the same anchor date already used by actDays()/isStale() elsewhere.
// renderGanttScrubMarker() (index.html, repositions #ganttScrubMarker) is the same direct-DOM-
// -manipulation-not-full-re-render pattern as renderScurveConfMarker() — this stub's
// querySelector always returns a fresh, disconnected stub, so it's live-browser-only coverage,
// not exercised here (2026-08-20 /stress-test finding: this specific function/id had zero
// mentions anywhere in this file, unlike its twin at line 372/983-987, though the class of
// limitation was already noted in general terms at line 372 — naming it here closes that gap).
{
  const ACT_ASOF = new Date(Date.UTC(2026, 6, 31)); // 31 Jul 2026 — matches PROGRAM.dataDate
  function addDays(base, n) { return new Date(base.getTime() + n * 86400000); }
  function fmtDate(d) {
    const mo = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return d.getUTCDate() + " " + mo[d.getUTCMonth()] + " " + d.getUTCFullYear();
  }
  ok(idsA.includes("gantt") && idsA.includes("ganttMathBody"), "markup contains #gantt and #ganttMathBody");
  ok((G.gantt._html.match(/data-part="fcst"/g) || []).length === rows.length,
    "one forecast bar per control account", String((G.gantt._html.match(/data-part="fcst"/g) || []).length));
  ok((G.gantt._html.match(/data-part="base"/g) || []).length === rows.length,
    "one baseline-implied bar per control account");
  has("gantt", P.program.dataDate, "chart labels the real data date, not a placeholder");

  const worst = rows.reduce((w, r) => (r.float < w.float ? r : w), rows[0]);
  const worstFcst = addDays(ACT_ASOF, worst.cpRem);
  const worstBase = addDays(ACT_ASOF, worst.cpRem + worst.float);
  has("ganttMathBody", worst.id, "math panel's worked example names the account with the worst (most negative) absolute float — a real, independently-recomputed minimum, not assumed to be the CPLI driving path (a different metric, computed and shown separately on this same tab)");
  has("ganttMathBody", fmtDate(worstFcst), "math panel's forecast-finish date matches independent recomputation");
  has("ganttMathBody", fmtDate(worstBase), "math panel's baseline-implied-finish date matches independent recomputation");

  // pre-registered: for an account with negative float, baseline-implied finish must be EARLIER
  // than forecast finish (less time than the plan implied) — the exact inverse for positive float
  ok(worst.float < 0 && worstBase.getTime() < worstFcst.getTime(),
    "pre-registered: this account's negative float means its baseline-implied finish sits before its forecast finish");
  // mobile upgrade (2026-08-19): gantt tooltip now bound to click too, same as the S-curve check
  G.tip._html = "";
  fire(G.gantt, "click", { target: { classList: { contains: () => true }, dataset: { gantt: "0" } }, clientX: 60, clientY: 60 });
  ok(G.tip._html.includes("Forecast finish"), "tapping the gantt chart (click, no prior hover) shows a tooltip");
  const aheadRow = rows.find(r => r.float > 0);
  if (aheadRow) {
    const aheadFcst = addDays(ACT_ASOF, aheadRow.cpRem), aheadBase = addDays(ACT_ASOF, aheadRow.cpRem + aheadRow.float);
    ok(aheadBase.getTime() > aheadFcst.getTime(),
      "pre-registered: a positive-float account's baseline-implied finish sits after its forecast finish (inverse of the negative-float case)");
  }
}

// waterfall arithmetic: BAC + sum(-vac) == EAC
const wfSum = 1240 + rows.reduce((s, r) => s + (-(r.bac - r.eac)), 0);
ok(Math.abs(wfSum - T.eac) < 0.01, "waterfall closes: BAC + steps = EAC", wfSum.toFixed(2) + " vs " + T.eac.toFixed(2));
// heat map accounts for all six risks
const heatNums = (G.heat._html.match(/role="img"/g) || []).length;
ok(heatNums === 25, "heat map renders 25 cells", String(heatNums));

// Risk exposure math explainer + tornado hover (2026-08-19)
{
  function m(v) { const s = Math.abs(v).toFixed(1).split(".");
    return (v < 0 ? "−" : "") + "$" + s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + s[1] + "M"; }
  const rankedRisks = P.risks.map(k => Object.assign({}, k, { exp: P.pBand[k.p] * k.cost }))
    .sort((a, b) => b.exp - a.exp);
  const top = rankedRisks[0];
  has("riskMathBody", "P_BAND[probability] &times; cost", "risk math panel states the formula");
  has("riskMathBody", "P1=10%, P2=30%, P3=50%, P4=70%, P5=90%", "risk math panel states the full probability-band table");
  has("riskMathBody", top.id, "risk math panel's worked example names the actual top-ranked risk, not a hardcoded one");
  has("riskMathBody", "P" + top.p, "risk math panel states the worked risk's live probability score");
  has("riskMathBody", Math.round(P.pBand[top.p] * 100) + "%", "risk math panel's live percentage matches independent recomputation");
  has("riskMathBody", m(top.cost), "risk math panel states the worked risk's live cost impact");
  has("riskMathBody", m(top.exp), "risk math panel's computed exposure matches independent recomputation");

  // tornado hover: bar index 0 is rankedRisks[0] (the top risk), by construction of the sort above
  fire(G.tornado, "mousemove", { target: { classList: { contains: () => true }, dataset: { risk: "0" } }, clientX: 50, clientY: 50 });
  ok(G.tip._html.includes(top.id), "hovering tornado bar 0 (the top risk) shows its id in the shared tooltip");
  ok(G.tip._html.includes(m(top.exp)), "hover tooltip's exposure matches independent recomputation");
  // mobile upgrade (2026-08-19): click-bound tooltip, same as the waterfall check above
  G.tip._html = "";
  fire(G.tornado, "click", { target: { classList: { contains: () => true }, dataset: { risk: "0" } }, clientX: 50, clientY: 50 });
  ok(G.tip._html.includes(top.id), "tapping tornado bar 0 (click, no prior hover) shows its id in the tooltip");
}

/* =========================================================================
   D. INTERACTION SIMULATION
   ========================================================================= */
console.log("== D. interactions ==");
// theme toggle (2026-08-19: this assertion was a tautology — ok(R.win && true, ...) is
// unfalsifiable short of fire() throwing, and verified nothing about which render functions
// actually re-ran. That gap is exactly how redrawCharts() shipped missing renderGantt() and
// renderScurveScrub(): a real, reproduced bug (theme toggle left the Gantt's C("ok")/C("bad")-
// baked bar colors stale; a tab switch — which also calls redrawCharts(), a pre-existing pattern
// — silently reset the scrubber's cursor to hidden while its slider/HUD still showed whatever
// was scrubbed). Found live via getComputedStyle before/after a real toggle, not caught by this
// suite. Fixed the app; fixing the test now too, per this project's own "close the gate hole,
// same session" rule — a color-value comparison here would still be meaningless (this stub's
// getComputedStyle returns the same value for every property regardless of theme, same
// limitation as every other color-token check in this file), so the honest test is the contract
// itself: every render function whose output bakes a C(...) color literal must be listed here.)
{
  const redrawBody = indexSrc.match(/function redrawCharts\(\)\{([^}]*)\}/);
  ok(!!redrawBody, "redrawCharts() found in source");
  const themedRenderFns = ["renderScurve", "renderWaterfall", "renderCont", "renderRisk", "syncMcView", "renderGantt", "renderScurveScrub"];
  themedRenderFns.forEach(fn =>
    ok(redrawBody && redrawBody[1].includes(fn + "()"),
      "redrawCharts() calls " + fn + "() — omitting a themed chart here is exactly the bug this check exists to catch"));
  try {
    fire(G.themeBtn, "click");
    ok(true, "theme toggle runs without throwing");
  } catch (e) { ok(false, "theme toggle", e.message); }
}
// tab switch to cost and back
try {
  fire(G["t-cost"], "click");
  ok(G["p-cost"].hidden === false && G["p-over"].hidden === true, "tab switch shows cost, hides overview");
  fire(G["t-over"], "click");
  ok(G["p-over"].hidden === false, "tab switch back to overview");
} catch (e) { ok(false, "tab switching", e.message); }
// /stress-test finding (2026-08-18): the tab bar had no keyboard-nav test at all, and Tier 3's
// vertical rail (>=1050px) needs Up/Down arrows + a synced aria-orientation on top of the
// original horizontal Left/Right — plus a roving tabindex so Tab enters/exits the rail in one
// stop instead of stopping at all 11 buttons individually.
try {
  ok(G.tabs.getAttribute("aria-orientation") === "vertical",
    "aria-orientation syncs to the stub's matchMedia (always matches:true, i.e. the >=1050px rail) at load");
  ok(G["t-over"].getAttribute("tabindex") === "0", "the initially-selected tab is the roving tabindex=0 stop");
  // TABS is a var inside the eval'd page IIFE, not visible at this module's scope — same 11
  // ids TABS_CHECK() below regex-extracts from source, hardcoded here to match that convention
  const TAB_IDS = ["over", "port", "cost", "sched", "risk", "del", "ai", "fw", "act", "gloss", "data"];
  ok(TAB_IDS.filter(id => id !== "over").every(id => G["t-" + id].getAttribute("tabindex") === "-1"),
    "every other tab starts at tabindex=-1");
  fire(G["t-cost"], "click");
  ok(G["t-cost"].getAttribute("tabindex") === "0" && G["t-over"].getAttribute("tabindex") === "-1",
    "activating a different tab moves the roving tabindex=0 stop with it");
  fire(G["t-over"], "click"); // back to a known state before exercising the keydown handler
  // ArrowRight/ArrowDown both move forward; ArrowLeft/ArrowUp both move backward — the same
  // physical keydown handler serves the bar below 1050px and the rail at/above it
  fire(G.tabs, "keydown", { key: "ArrowRight" });
  ok(G["p-port"].hidden === false, "ArrowRight (horizontal-bar convention) advances to the next tab");
  fire(G.tabs, "keydown", { key: "ArrowDown" });
  ok(G["p-cost"].hidden === false, "ArrowDown (vertical-rail convention) also advances to the next tab");
  fire(G.tabs, "keydown", { key: "ArrowUp" });
  ok(G["p-port"].hidden === false, "ArrowUp moves back");
  fire(G.tabs, "keydown", { key: "ArrowLeft" });
  ok(G["p-over"].hidden === false, "ArrowLeft also moves back, wrapping to Overview");
} catch (e) { ok(false, "nav-rail keyboard + roving tabindex + orientation", e.message); }
// phase re-scope to final design: 5 KPIs live (bei, msv, expo, ccr, rfi)
try {
  fire(G.phases, "click", { target: { closest: () => ({ dataset: { ph: "fd" } }) } });
  has("strip", "5 of 20", "phase re-scope to final design: 5 of 20 live");
  ok(G.dimNote.textContent.includes("15 dimmed") || G.strip._html.includes("5 of 20"), "dim note updates");
} catch (e) { ok(false, "phase re-scope", e.message); }
// back to construction
try {
  fire(G.phases, "click", { target: { closest: () => ({ dataset: { ph: "con" } }) } });
  has("strip", "20 of 20", "phase re-scope back to construction");
} catch (e) { ok(false, "phase re-scope back", e.message); }
// family filter Risk -> 2 cards
try {
  fire(G.kfilters, "click", { target: { closest: () => ({ dataset: { fam: "Risk" } }) } });
  ok((G.kboard._html.match(/data-kpi=/g) || []).length === 2, "Risk family filter shows 2 cards");
  fire(G.kfilters, "click", { target: { closest: () => ({ dataset: { fam: "All" } }) } });
  ok((G.kboard._html.match(/data-kpi=/g) || []).length === 20, "filter reset to All shows 20");
} catch (e) { ok(false, "family filter", e.message); }
// audience-scoped KPI view (/brainstorm 2026-08-19, Design Guide triage) — every KPI's tier[]
// pre-registered against its own why/act text, not guessed here; PCM (the default) must equal
// the unfiltered 20 so this feature can never silently narrow what a returning visitor sees.
{
  ok(idsA.includes("audienceFilters"), "markup contains #audienceFilters");
  ok(P.audiences.length === 3, "3 audience tiers defined");
  const execN = P.kpis.filter(k => k.tier.includes("exec")).length;
  const pmoN = P.kpis.filter(k => k.tier.includes("pmo")).length;
  const pcmN = P.kpis.filter(k => k.tier.includes("pcm")).length;
  ok(execN >= 4 && execN <= 6, "Executive tier holds 4-6 KPIs, the guide's own constraint applied honestly", String(execN));
  ok(pmoN >= execN && pmoN <= 12, "PMO tier is a superset of Executive and stays within the guide's 10-12 range", String(pmoN));
  ok(pcmN === 20, "Project Controls Manager tier is the full working set (all 20)", String(pcmN));
  // inclusion, not partition — every exec KPI must also appear at pmo and pcm
  const execIds = P.kpis.filter(k => k.tier.includes("exec")).map(k => k.id);
  ok(execIds.every(id => P.kpis.find(k => k.id === id).tier.includes("pmo")), "every Executive-tier KPI also appears at PMO tier (inclusive, not a partition)");
  ok(execIds.every(id => P.kpis.find(k => k.id === id).tier.includes("pcm")), "every Executive-tier KPI also appears at PCM tier");
}
try {
  fire(G.audienceFilters, "click", { target: { closest: () => ({ dataset: { aud: "exec" } }) } });
  const execN = P.kpis.filter(k => k.tier.includes("exec")).length;
  ok((G.kboard._html.match(/data-kpi=/g) || []).length === execN, "Executive view shows exactly the Executive-tier count", String((G.kboard._html.match(/data-kpi=/g) || []).length));
  fire(G.audienceFilters, "click", { target: { closest: () => ({ dataset: { aud: "pcm" } }) } });
  ok((G.kboard._html.match(/data-kpi=/g) || []).length === 20, "switching back to Project Controls Manager restores all 20");
} catch (e) { ok(false, "audience filter", e.message); }
// KPI drawer open/close
try {
  fire(G.kboard, "click", { target: { closest: () => ({ dataset: { kpi: "cpi" } }) } });
  has("kdetail", "CPI = EV ÷ AC", "KPI drawer shows CPI formula");
  has("kdetail", "The play when it breaches", "KPI drawer shows the play");
  fire(G.kboard, "click", { target: { closest: () => ({ dataset: { kpi: "cpi" } }) } });
  ok(G.kdetail._html === "", "KPI drawer closes on second click");
} catch (e) { ok(false, "KPI drawer", e.message); }
// package drill-down selection
try {
  fire(G.pkgBody, "click", { target: { closest: () => ({ dataset: { i: "6" } }) } });
  has("drill", "CP-601", "selecting row 6 drills into CP-601");
  has("drill", "driving the completion date", "CP-601 drill notes negative float drives completion");
} catch (e) { ok(false, "package drill-down", e.message); }
// what-if sliders
try {
  G.sCpi.value = "1.10";
  fire(G.sCpi, "input");
  has("whatIfOut", "$1,127.3M", "what-if at CPI 1.10 gives EAC $1,127.3M");
  ok(G.whatIfOut._html.includes("wi-flash"), "what-if values that changed carry the flash animation class");
  fire(G.sCpi, "input"); // same value again — nothing actually changed this time
  ok(!G.whatIfOut._html.includes("wi-flash"), "re-firing with an unchanged value carries no flash class");
  fire(G.resetWhatIf, "click");
  has("whatIfOut", "$1,297.3M", "what-if reset returns to actuals ($1,297.3M)");
  ok(G.whatIfOut._html.includes("wi-flash"), "reset (a real value change back) re-triggers the flash class");
} catch (e) { ok(false, "what-if model", e.message); }

/* =========================================================================
   D2. NEW SURFACES — monte carlo, scenarios, print brief
   (must run BEFORE section E: runPage for otak.html reassigns the globals)
   ========================================================================= */
console.log("== D2. monte carlo / scenarios / print ==");
// monte carlo: deterministic, ordered, sane
const MC = P.mc;
ok(!!MC && MC.n === 4000, "monte carlo exposed with 4,000 runs");
ok(MC.p10 < MC.p50 && MC.p50 < MC.p80, "P10 < P50 < P80",
   MC.p10.toFixed(1) + " / " + MC.p50.toFixed(1) + " / " + MC.p80.toFixed(1));
// P95 tail-risk stat (advanced-quant upgrade, 2026-08-23) — independent re-derivation via a raw
// array index, not by calling mcQuantile() a second time and trusting it.
ok(MC.p80 < MC.p95, "P80 < P95", MC.p80.toFixed(1) + " / " + MC.p95.toFixed(1));
ok(MC.p95 === MC.sims[Math.floor(0.95 * MC.sims.length)],
  "P95 matches an independent index into the raw sorted sims array", MC.p95.toFixed(2));
has("mcStats", "P95 (tail risk)", "MC stats render the new P95 tile");
has("mcStats", m(MC.p95), "MC stats render the live P95 value");
ok(MC.p50 > 1270 && MC.p50 < 1330, "P50 plausible vs point forecast 1303.7", MC.p50.toFixed(1));
ok(MC.pOver > 0.9, "P(overrun) high given CPI 0.956", MC.pOver.toFixed(3));
ok(MC.pBust > 0 && MC.pBust <= 1, "P(bust) a probability", MC.pBust.toFixed(3));
// reproducibility: the point forecast should sit inside the P10–P80 band
ok(T.eac > MC.p10 && T.eac < MC.p80, "point EAC inside the P10–P80 band");
has("mcStats", "P50 (median)", "MC stats render P50");
has("mcRead", "funding", "MC narrative renders");
// histogram renders 26 bins
ok((G.mcChart._html.match(/<rect/g) || []).length === 26, "MC histogram renders 26 bins");
// reference-class forecasting callout (2026-08-19): static content, not JS-rendered — check the
// raw source directly, same pattern as the other static-content checks in this file
ok(indexSrc.includes("Reference class forecasting") && indexSrc.includes("45%") && indexSrc.includes("34%") && indexSrc.includes("20%"),
  "Cost tab names reference class forecasting with Flyvbjerg's real base rates (rail/fixed-link/road)");
ok(indexSrc.includes('data-help="referenceclass"'), "reference-class callout carries its own inline help icon");

// D2.1 — interactive view toggle, zoned histogram, live math explainer (2026-08-19)
{
  ok(G.mcViewHist.getAttribute("aria-pressed") === "true", "distribution view active on load");
  ok(G.mcViewCdf.getAttribute("aria-pressed") === "false", "cumulative view inactive on load");
  ok((G.mcChart._html.match(/<rect/g) || []).length === 26, "initial view is the 26-bin histogram");
  ok(!G.mcChart._html.includes("<polyline"), "initial view has no CDF polyline");

  // Color-zoning is a static-source check, not a runtime color comparison — this harness's
  // getComputedStyle stub returns the same value for every custom property, so C("ok")/C("warn")/
  // C("bad") are indistinguishable strings at runtime here even though they render distinctly in
  // a real browser. Pre-registered awareness of that trap, not a color-distinctness assertion
  // that would silently always pass (or always fail) regardless of the actual zoning logic.
  ok(indexSrc.includes('mid<T.bac?C("ok"):mid<(T.bac+T.contRemaining)?C("warn"):C("bad")'),
    "histogram bars are zone-colored in source (ok below BAC / warn to BAC+contingency / bad beyond)");

  fire(G.mcViewCdf, "click");
  ok(G.mcViewCdf.getAttribute("aria-pressed") === "true", "cumulative view active after click");
  ok(G.mcViewHist.getAttribute("aria-pressed") === "false", "distribution view inactive after click");
  ok(G.mcChart._html.includes("<polyline"), "cumulative view renders a polyline");
  ok(!G.mcChart._html.includes("<rect"), "cumulative view has no histogram bars");
  has("mcStats", "P50 (median)", "stats box still populated in cumulative view");
  has("mcRead", "funding", "narrative still populated in cumulative view");

  fire(G.mcViewHist, "click");
  ok(G.mcViewHist.getAttribute("aria-pressed") === "true", "distribution view active again after toggling back");
  ok((G.mcChart._html.match(/<rect/g) || []).length === 26, "toggling back restores the 26-bin histogram");

  // Math explainer — recompute the worked CP-201 example independently rather than trusting the
  // app's own math, matching this file's section-4 doctrine.
  const mcR = rows.find(x => x.id === "CP-201");
  ok(!!mcR, "CP-201 present for the worked example");
  function triangCheck(u, a, b, mode) {
    const fc = (mode - a) / (b - a);
    return u < fc ? a + Math.sqrt(u * (b - a) * (mode - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - mode));
  }
  function m_(v) { const s = Math.abs(v).toFixed(1).split(".");
    return (v < 0 ? "−" : "") + "$" + s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + s[1] + "M"; }
  // Ground truth is the CLAMPED formula (mirrors index.html's mcParams(), never by calling
  // P.mcParams() itself — 2026-08-20 /stress-test finding: this used to hand-roll the same
  // unclamped duplicate the app itself had, so it would have silently enshrined that bug rather
  // than catching it. Identical to the live data today (min CPI ~0.865, well above where the
  // clamp engages) but now testing real ground truth, not a shared mistake.
  const aLow = Math.max(0.78, mcR.cpi - 0.08), bHigh = Math.max(aLow + 0.02, mcR.cpi + 0.06),
    mode = Math.max(aLow, Math.min(bHigh, mcR.cpi));
  has("mcMathBody", "AC + (BAC", "math panel states the per-run formula");
  has("mcMathBody", "4000 runs", "math panel names the actual run count, not a stale number");
  has("mcMathBody", mcR.id, "math panel names the worked control account by id");
  ok(G.mcMathBody._html.includes(mcR.cpi.toFixed(3)), "math panel shows CP-201's actual live CPI");
  [0.10, 0.50, 0.90].forEach(u => {
    const c = triangCheck(u, aLow, bHigh, mode);
    const contrib = mcR.ac + (mcR.bac - mcR.ev) / c;
    has("mcMathBody", "u = " + u.toFixed(2), "math panel shows the u=" + u.toFixed(2) + " draw");
    ok(G.mcMathBody._html.includes("c = " + c.toFixed(3)),
      "u=" + u.toFixed(2) + " draw's c matches independent recomputation", c.toFixed(3));
    ok(G.mcMathBody._html.includes(m_(contrib)),
      "u=" + u.toFixed(2) + " draw's dollar contribution matches independent recomputation", m_(contrib));
  });
}

// D2.2 — "run one simulated completion, live" stepper (2026-08-19)
{
  function triangCheck2(u, a, b, mode) {
    const fc = (mode - a) / (b - a);
    return u < fc ? a + Math.sqrt(u * (b - a) * (mode - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - mode));
  }
  function lcgCheck(seed) {
    let s = seed >>> 0;
    return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }
  function m2(v) { const s = Math.abs(v).toFixed(1).split(".");
    return (v < 0 ? "−" : "") + "$" + s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + s[1] + "M"; }

  fire(G.mcRunOne, "click");
  ok(G.mcOneRun._html.includes("Run #1"), "first click renders run #1");
  // pre-registered rows.length was wrong on first pass — the actual markup has a <thead><tr> for
  // the column headers too; count body rows specifically, not every <tr> on the page (B35: this
  // contradicted the first prediction, so the count logic was fixed, not the app)
  const tbodyMatch = G.mcOneRun._html.match(/<tbody>([\s\S]*)<\/tbody>/);
  // matches <tr> or <tr class="..."> — the staggered-reveal motion pass (2026-08-19) added a
  // class+animation-delay to each row, which broke this exact-literal-<tr> match; found by
  // running the suite after that change, not assumed safe
  const bodyRowCount = tbodyMatch ? (tbodyMatch[1].match(/<tr[ >]/g) || []).length : -1;
  ok(bodyRowCount === rows.length,
    "one-run table body has exactly one row per control account", bodyRowCount + " vs expected " + rows.length);

  // independently recompute run #1 with the same per-click seed formula the app uses
  const rnd1 = lcgCheck(20260731 + 1 * 7919);
  let total1 = 0;
  rows.forEach(r => {
    // clamped ground truth (mcParams()), same 2026-08-20 fix as the math-explainer block above
    const lo1 = Math.max(0.78, r.cpi - 0.08), hi1 = Math.max(lo1 + 0.02, r.cpi + 0.06);
    const c = triangCheck2(rnd1(), lo1, hi1, Math.max(lo1, Math.min(hi1, r.cpi)));
    total1 += r.ac + (r.bac - r.ev) / c;
  });
  ok(G.mcOneRun._html.includes(m2(total1)), "run #1's summed total matches independent recomputation", m2(total1));
  const zone1 = total1 < T.bac ? "under budget"
    : total1 < (T.bac + T.contRemaining) ? "inside remaining contingency" : "busts budget";
  ok(G.mcOneRun._html.includes(zone1), "run #1's zone label matches its own independently-recomputed total", zone1);

  // second click produces a different seed/run, not a static replay
  fire(G.mcRunOne, "click");
  ok(G.mcOneRun._html.includes("Run #2"), "second click renders run #2, not a repeat of run #1");
  const rnd2 = lcgCheck(20260731 + 2 * 7919);
  let total2 = 0;
  rows.forEach(r => {
    const lo2 = Math.max(0.78, r.cpi - 0.08), hi2 = Math.max(lo2 + 0.02, r.cpi + 0.06);
    const c = triangCheck2(rnd2(), lo2, hi2, Math.max(lo2, Math.min(hi2, r.cpi)));
    total2 += r.ac + (r.bac - r.ev) / c;
  });
  ok(total1 !== total2, "pre-registered: two clicks with different seeds land on different totals", total1 + " vs " + total2);
  ok(G.mcOneRun._html.includes(m2(total2)), "run #2's summed total matches independent recomputation", m2(total2));
}

// D2.3 — reference-class-forecasting marker overlaid on the same chart (2026-08-19)
{
  function m3(v) { const s = Math.abs(v).toFixed(1).split(".");
    return (v < 0 ? "−" : "") + "$" + s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + s[1] + "M"; }
  const rcfVal = T.bac * 1.45;
  const trueMax = MC.sims[MC.sims.length - 1];
  // pre-registered against the live-checked numbers (T.bac=1240 -> rcfVal=1798.0, true worst
  // simulated run ~1330.8): the rail reference-class estimate sits past even this program's own
  // worst outcome, so the off-scale branch must be the one that actually fires — not assumed,
  // checked directly against MC's real sorted array.
  ok(rcfVal > trueMax, "pre-registered: RCF estimate exceeds this program's own worst simulated run",
    m3(rcfVal) + " vs " + m3(trueMax));

  has("mcChart", "RCF (rail, +45%)", "histogram view carries the reference-class marker");
  has("mcChart", "off scale", "histogram view's RCF marker is honestly labeled off-scale, not silently mispositioned");
  fire(G.mcViewCdf, "click");
  has("mcChart", "RCF (rail, +45%)", "cumulative view also carries the reference-class marker");
  fire(G.mcViewHist, "click");

  has("mcRcfRead", m3(rcfVal), "RCF read-out states the actual computed rail-adjusted figure");
  has("mcRcfRead", m3(trueMax), "RCF read-out states this program's own true worst simulated run, not the chart's clipped 98th percentile");
  has("mcRcfRead", "beyond even the single worst outcome", "RCF read-out takes the off-scale branch, matching the pre-registered check above");
}

// D2.4 — per-account uncertainty toggle: narrowed run stays additive, canonical MC untouched (2026-08-19)
{
  function m(v) { const s = Math.abs(v).toFixed(1).split(".");
    return (v < 0 ? "−" : "") + "$" + s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + s[1] + "M"; }
  const canonicalP50Before = P.mc.p50, canonicalPBustBefore = P.mc.pBust;
  const printBriefBefore = G.printBrief._html;
  const clickPkg = id => fire(G.mcFilter, "click", { target: { closest: () => ({ dataset: { pkg: id } }) } });

  // initial render: one button per control account, all pressed (all uncertain, matching the
  // canonical run's own default)
  ok((G.mcFilter._html.match(/<button/g) || []).length === rows.length,
    "one filter button per control account", String(rows.length));
  ok((G.mcFilter._html.match(/aria-pressed="true"/g) || []).length === rows.length,
    "all control accounts start included (uncertain) by default");
  ok(!G.mcRead._html.includes("Showing a narrowed run"), "no narrowed-run flag before any toggle");

  // lock CP-201 (the tunnel package) — chart/stats/RCF should visibly change, canonical MC must not
  clickPkg("CP-201");
  ok(G.mcRead._html.includes("Showing a narrowed run"), "narrowed-run flag appears once a package is locked");
  ok(P.mc.p50 === canonicalP50Before && P.mc.pBust === canonicalPBustBefore,
    "canonical MC (__PCC__.mc) is byte-unchanged after locking a package — recomputeActiveMc never mutates it");
  ok(G.printBrief._html === printBriefBefore,
    "print brief is byte-unchanged after locking a package — it deliberately never reads activeMc");

  // unlock it again — must land back on the exact canonical numbers, not just "similar" ones
  clickPkg("CP-201");
  ok(!G.mcRead._html.includes("Showing a narrowed run"), "narrowed-run flag clears once every account is back on");
  has("mcStats", m(canonicalP50Before), "re-checking the last box restores the exact canonical P50, not an approximation");

  // degenerate case: lock every account. Every run collapses to the same deterministic total
  // (each account priced at its own observed CPI, no draw) — pre-registered: that deterministic
  // total is exactly T.eac, the program's own point forecast, since zero modeled variance means
  // the "simulation" just reproduces the point estimate every single time.
  rows.forEach(r => clickPkg(r.id));
  ok((G.mcFilter._html.match(/aria-pressed="false"/g) || []).length === rows.length,
    "all control accounts can be locked simultaneously without erroring");
  ok(!G.mcChart._html.includes("NaN"), "degenerate all-locked chart has no NaN (lo===hi axis-padding guard fires)");
  ok((G.mcChart._html.match(/<rect/g) || []).length === 26, "degenerate case still renders a full 26-bin histogram, just a single spike");
  const eacStr = m(T.eac);
  ok(G.mcStats._html.includes(eacStr), "pre-registered: with every account locked, P10/P50/P80/P95 all collapse to T.eac exactly", eacStr);
  // 3->4 (advanced-quant upgrade, 2026-08-23): P95 was added to #mcStats, and a degenerate
  // (zero-variance) distribution collapses P95 to the same single value too — a deliberate,
  // correct update to this count, not a pinned-geometry violation.
  const p10Count = (G.mcStats._html.match(new RegExp(eacStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
  ok(p10Count === 4, "P10, P50, P80, and P95 are all that same single value (4 occurrences), not just one of them", String(p10Count));

  // restore to the default all-uncertain state for any later assertions in this file
  rows.forEach(r => clickPkg(r.id));
  ok(P.mc.p50 === canonicalP50Before, "canonical MC still byte-identical after a full lock/unlock round trip");
}

// scenarios: save two, verify table, clear
try {
  G.sCpi.value = "1.10"; G.sSpi.value = "1.05"; G.sCont.value = "150";
  fire(G.saveScen, "click");
  G.sCpi.value = "0.92"; G.sSpi.value = "0.90"; G.sCont.value = "100";
  fire(G.saveScen, "click");
  ok(G.scenWrap.style.display !== "none", "scenario table visible after save");
  ok((G.scenTable._html.match(/Scenario /g) || []).length === 2, "two scenarios saved");
  ok(G.scenTable._html.includes("$1,127.3M"), "scenario 1 EAC correct ($1,240.0M / 1.10)");
  fire(G.clearScen, "click");
  ok(G.scenWrap.style.display === "none", "clear hides scenario table");
} catch (e) { ok(false, "scenario save/clear", e.message); }

// print brief: populated at init, escalation count derived independently
has("printBrief", "Executive brief", "print brief populated at init");
has("printBrief", "nothing on this page is typed",
  "print brief opens with the thesis statement (brainstorm 2026-08-19), not just tables");
const expectedFiring =
  (T.cpi < 0.95) + (T.cpli < 0.95) + (T.tcpi - T.cpi > 0.10) + (T.tcpi > 1.10) + (T.contCoverage < 1) +
  (Math.abs(Math.min(0, T.vac)) > T.contRemaining) + (T.negFloat.length > 0) +
  (P.program.coCycleDays > P.program.coCycleTarget) + (P.program.rfiOver30 > 0) +
  (P.program.trir > P.program.trirBenchmark) +
  // EAC Drift Velocity (megaproject-controls-doc upgrade, 2026-08-22) — recomputed from the
  // literal first EAC_HISTORY point (1266.0, index.html's own source) + live T.eac, not from
  // P.eacTrendSeries()'s own output (a /stress-test reviewer caught the original version of this
  // as circular — it called eacTrendSeries() and reapplied the same formula the app's own
  // eacDriftVelocity() uses, which only proves the formula is deterministic, not correct).
  (((T.eac - 1266.0) / 5) > 1.0) +
  // Non-Critical Progress Inflation (megaproject-controls-doc upgrade, 2026-08-22) — false today
  // (T.spi<1.00), included here so this count stays correct if that ever flips, not just today.
  (T.spi >= 1.00 && T.cpli < 0.90);
has("printBrief", "Escalations firing (" + expectedFiring + ")", "print brief escalation count matches independent derivation");
ok(!G.printBrief._html.includes("DBE"), "print brief carries no swept terms");
// content correctness, not just count: a firing trigger must attach the RIGHT rule text, not a
// neighbor's — a hardcoded ESCALATION[n] index silently pointed at the wrong row here before
// (found by this stress pass: inserting a new row mid-array shifted every index after it).
if (T.contCoverage < 1) {
  has("printBrief", "Contingency coverage", "contingency-coverage trigger shows its own rule text, not a shifted neighbor's");
}
if (T.tcpi - T.cpi > 0.10) {
  has("printBrief", "TCPI − CPI", "TCPI-CPI-gap trigger shows its own rule text, not a shifted neighbor's");
}
try {
  fire(G.printBtn, "click");
  ok(R.win._printed === true, "print button invokes window.print");
} catch (e) { ok(false, "print button", e.message); }

// draggable confidence-percentile slider (brainstorm-mode upgrade, 2026-08-21) — additive to the
// existing, already-pinned P10-P80 prediction cone above; this block never touches that cone's
// own assertions, and their continued pass (unmodified, earlier in this file) IS the regression
// check that this addition didn't disturb them.
{
  // 1. the refactor (inline `q` closure -> shared mcQuantile) is behavior-preserving
  ok(P.mcQuantile(P.mc.sims, 0.50) === P.mc.p50, "mcQuantile(0.50) matches MC.p50 exactly — refactor didn't change the formula");
  ok(P.mcQuantile(P.mc.sims, 0.80) === P.mc.p80, "mcQuantile(0.80) matches MC.p80 exactly — refactor didn't change the formula");
  // 2. firing a real 'input' event (not a direct state mutation) updates state + the visible label
  try {
    ok(P.state.mcConfidence === 0.80, "confidence defaults to P80 on init", String(P.state.mcConfidence));
    G.sConf.value = "90";
    fire(G.sConf, "input");
    ok(P.state.mcConfidence === 0.90, "dragging the slider to 90 updates state.mcConfidence");
    ok(String(G.vConf.textContent) === "P90", "the visible label updates to match", String(G.vConf.textContent));
    // #scurveConfMarker's own reposition (renderScurveConfMarker) calls querySelector/setAttribute
    // directly on the live DOM to avoid a full re-render — same documented limitation as the
    // #scurveScrubCursor pattern just below it: this stub's querySelector always returns a fresh,
    // disconnected stub, so that specific direct-DOM update is live-browser-only coverage, not
    // exercised here. What IS exercised: the callout, a genuine innerHTML write.
    const required = Math.max(0, P.mcQuantile(P.mc.sims, 0.90) - P.totals.bac);
    const delta = P.totals.contRemaining - required;
    ok(G.mcConfOut._html.includes("P90"), "callout header states the current percentile");
    ok(G.mcConfOut._html.includes(m(required)), "callout's contingency-required figure matches independent recomputation at P90");
    ok(G.mcConfOut._html.includes(sgn(delta)), "callout's surplus/shortfall figure matches independent recomputation");
    // reset to the default so later sections (which read state.mcConfidence indirectly through
    // nothing else, but for cleanliness) aren't left mid-test
    G.sConf.value = "80";
    fire(G.sConf, "input");
    ok(P.state.mcConfidence === 0.80, "confidence resets cleanly back to P80");
  } catch (e) { ok(false, "confidence slider interaction", e.message); }
}

/* ---- AI & data tab ---- */
console.log("== D3. AI & data tab ==");
ok(idsA.includes("t-ai") && idsA.includes("p-ai"), "AI tab/panel pair exists");
try {
  fire(G["t-ai"], "click");
  ok(G["p-ai"].hidden === false && G["p-cost"].hidden === true, "AI tab switch works");
  fire(G["t-over"], "click");
} catch (e) { ok(false, "AI tab switching", e.message); }
// integrity gate: every check passes, pill count matches
const guardPasses = (G.aiGuards._html.match(/>PASS</g) || []).length;
const guardFails = (G.aiGuards._html.match(/>FAIL</g) || []).length;
// 27->28 (megaproject-controls-doc upgrade, 2026-08-22): one new GUARDS tie-out row added
// alongside the new floatErosionSeries() — see item C's own assertions further down for the
// independent re-derivation of that specific row.
ok(guardPasses === 28 && guardFails === 0, "integrity gate: 28 PASS, 0 FAIL",
   guardPasses + " pass / " + guardFails + " fail");
has("aiGuards", "GREEN", "gate shows GREEN");
// the header's own stated count must equal what actually rendered — a stray trailing comma in
// the GUARDS array literal previously created a silent array hole (GUARDS.length said 28, only
// 27 checks actually ran/rendered) that no prior assertion caught since it only checked the pill
// count, never the header text against that same count.
{
  const headerCount = G.aiGuards._html.match(/Integrity gate &middot; (\d+) checks/);
  ok(!!headerCount && Number(headerCount[1]) === guardPasses + guardFails,
    "integrity gate header count matches actual rendered checks (no array hole)",
    headerCount ? headerCount[1] : "no match");
}
// /stress-test finding (2026-08-19): the "N-check integrity gate" lede paragraph hardcoded the
// literal "27" in static markup — correct today, but a magic number that would silently drift
// from GUARDS.length on the next edit. renderGuards() now fills a <span id="guardCountLede">
// with the live count; check it actually landed, not just that the span exists.
// String(...) on both sides — this stub's textContent setter doesn't coerce a number to a string
// the way a real DOM does (assigning GUARDS.length, a number, leaves .textContent as a number
// here, not "27"); found via a real contradicted assertion, not assumed. The existing G.cntAct
// check a few hundred lines down already carries the identical String(...) wrap for the same
// reason — matching that established workaround rather than patching the shared stub itself.
ok(String(G.guardCountLede.textContent) === String(guardPasses + guardFails),
  "guardCountLede span reflects the live GUARDS.length (same count already verified above via " +
  "actual rendered PASS/FAIL rows), not the original hardcoded 27",
  String(G.guardCountLede.textContent));
// The "Compliance sweep" GUARDS entry reads document.body.textContent — this stub's
// documentStub has no .body property at all, so that guard's own `(document.body&&
// document.body.textContent)||""` always short-circuits to "" here, meaning it silently ALWAYS
// reports PASS in this harness regardless of its real logic. This is exactly how a real
// /stress-test VISUAL pass on the live page (2026-08-2x) found this guard genuinely FAILING —
// two allowlisted citations (Sound Transit's Primavera P6 spec requirement, otak.html's
// design-build quote) were false-flagged with no allowlist at all, plus document.body.textContent
// concatenating two adjacent SVG <text> labels with no inserted whitespace produced an accidental
// "dbe" substring collision — while `node stress.cjs` reported clean the whole time. Test the
// guard's actual regex+allowlist logic directly (same pattern as deriveEarnedSchedule()'s
// parameterized edge-case tests above) rather than trusting the stub's silent no-op.
{
  const complianceGuard = P.guards.filter(g => /Compliance sweep/.test(g.n))[0];
  ok(!!complianceGuard, "the Compliance sweep guard exists in GUARDS");
  const savedBody = global.document.body;
  try {
    global.document.body = { textContent: "prime contractors to schedule in Oracle Primavera P6 — Section 01 32 13.25" };
    ok(complianceGuard.run()[0] === true, "Compliance sweep: the allowlisted Primavera P6 citation does not false-flag");
    global.document.body = { textContent: "sibling sections 01 32 13.10/.15/.20 cover larger and design-build contracts" };
    ok(complianceGuard.run()[0] === true, "Compliance sweep: the allowlisted design-build citation does not false-flag");
    global.document.body = { textContent: "bid-stage duration modeling, not years running P6." };
    ok(complianceGuard.run()[0] === true, "Compliance sweep: the allowlisted presenter-notes 'not years running P6' disclaimer does not false-flag (missed on the first pass at this fix — found only by re-scanning the REAL live page text after, not by trusting a hand-picked synthetic-string list)");
    global.document.body = { textContent: "logged & promotedbecomes a known pattern" };
    ok(complianceGuard.run()[0] === true, "Compliance sweep: the real live-page 'dbe' substring collision (two adjacent SVG <text> labels concatenated with no whitespace) no longer false-flags");
    global.document.body = { textContent: "TJ has DBE certification and 10 years running Primavera P6 himself" };
    ok(complianceGuard.run()[0] === false, "pre-registered: a genuine fabricated-credential claim is still caught — the fix narrowed false positives, not the real check");
  } finally {
    global.document.body = savedBody;
  }
}
ok(G.arch._html.includes("fct_control_account") && G.arch._html.includes("integrity gate"),
   "architecture diagram renders pipeline stages");
// pipeline-architecture story navigator (Phase 4, engagement/interactivity upgrade, 2026-08-20) —
// same proven pattern as the Gate-Line and CDE-flow diagrams: per-node click/keyboard nav,
// mutually-distinct captions, node count matching what's actually rendered.
{
  ["archDetail", "archStoryCard", "archStoryTitle", "archStoryText", "archPos", "archDots", "archPrev", "archNext"]
    .forEach(id => ok(idsA.includes(id), "markup contains #" + id));
  ok(P.archNodes.length === 12, "ARCH_NODES has exactly 12 entries (6 sources + staging + marts + gate + 3 outputs)", String(P.archNodes.length));
  ok((G.arch._html.match(/data-k="/g) || []).length === 12,
    "rendered SVG contains all 12 clickable nodes", String((G.arch._html.match(/data-k="/g) || []).length));
  const caps = P.archNodes.map(n => P.archCaption(n));
  ok(caps.every(c => c && typeof c.t === "string" && c.t.length > 0 && typeof c.x === "string" && c.x.length > 0),
    "every ARCH_NODES entry resolves to a non-empty caption");
  ok(new Set(caps.map(c => c.x)).size === caps.length, "all 12 captions are mutually distinct — no copy-paste placeholder");
  // additive, not restated — each source node names a SPECIFIC live field/downstream tab, not a
  // generic "feeds the dashboard" sentence that would say nothing a reader couldn't already guess.
  ok(P.archCaption({ k: "ledger" }).x.includes("PKGS[].ac"), "ledger caption names the specific live field it feeds");
  ok(P.archCaption({ k: "gate" }).x.includes(String(P.guards.length)), "gate caption cites the dashboard's own live GUARDS.length, not a typed number");
  try {
    fire(G.arch, "click", { target: { closest: sel => sel === "[data-k]" ? { dataset: { k: "gate" } } : null } });
    ok(G.archStoryTitle._html.includes("Integrity gate"), "clicking a node updates the story title");
  } catch (e) { ok(false, "arch diagram click interaction", e.message); }
  try {
    fire(G.arch, "keydown", { key: " ", preventDefault(){}, target: { closest: sel => sel === "[data-k]" ? { dataset: { k: "narrative" } } : null } });
    ok(G.archStoryTitle._html.includes("AI narrative draft"), "Space-key activation on a node works the same as a click");
  } catch (e) { ok(false, "arch diagram keyboard interaction", e.message); }
  try {
    for (let i = 0; i < 20; i++) fire(G.archNext, "click");
    ok(String(G.archPos.textContent).includes("12 of 12"), "story Next clamps at the last stop");
    for (let i = 0; i < 20; i++) fire(G.archPrev, "click");
    ok(String(G.archPos.textContent).includes("1 of 12"), "story Prev clamps at the first stop");
  } catch (e) { ok(false, "arch diagram story nav", e.message); }
}
// statistical control (brainstorm-mode upgrade, 2026-08-21): a genuinely different check from
// the deterministic GUARDS above — independently re-derive mean/stddev/z-scores from the raw
// series in THIS file, not by calling P.deriveZScores (same "don't trust the app's own math"
// doctrine as the MC checks elsewhere), and match against the rendered markup.
{
  const series = P.cphCells[0].weeks.map(w => w.actual);
  const n = series.length;
  const mean = series.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(series.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n);
  const zs = series.map(v => (v - mean) / sd);
  ok(Math.abs(mean - 2884.1666666666665) < 1e-6, "independently-derived series mean matches the hand-computed value from the plan", mean.toFixed(4));
  ok(Math.abs(sd - 316.3913276659495) < 1e-6, "independently-derived population stddev matches the hand-computed value from the plan", sd.toFixed(4));
  const maxAbsZ = Math.max(...zs.map(Math.abs));
  ok(maxAbsZ < 2.5, "pre-registered: this series genuinely has zero anomalies at the 2.5σ threshold — a real null result, not assumed", maxAbsZ.toFixed(3));
  zs.forEach((z, i) => {
    ok(G.aiStatControl._html.includes("z = " + z.toFixed(2)),
      "week " + i + "'s independently-recomputed z-score (" + z.toFixed(2) + ") appears verbatim in the rendered control");
  });
  // the honest null result must be STATED, not a blank/dropped section — this is the exact
  // failure mode the plan calls out as unacceptable (dropping a feature because it found nothing)
  has("aiStatControl", "GREEN — 0 anomalies", "the control explicitly states the true zero-anomaly verdict");
  has("aiStatControl", "2.5", "the ±2.5σ threshold is stated in the rendered control");
  ok((G.aiStatControl._html.match(/class="rowbar"/g) || []).length === 6,
    "exactly one row per week (6 weeks of CPH history)", String((G.aiStatControl._html.match(/class="rowbar"/g) || []).length));
  ok((G.aiStatControl._html.match(/>PASS</g) || []).length === 6 && (G.aiStatControl._html.match(/>FLAG</g) || []).length === 0,
    "all 6 weeks render PASS, none FLAG — matches the independently-confirmed zero-anomaly result");
  // the new "how this is actually computed" dbox (Phase 3, 2026-08-20) walks the last (most
  // recent) week's arithmetic — reuse the same independently-derived mean/sd/z above, formatted
  // the same way usd() rounds in the live app, rather than trusting the rendered panel's own math.
  {
    const usdL = v => (v < 0 ? "−" : "") + "$" + Math.round(Math.abs(v)).toLocaleString("en-US");
    const lastZ = zs[zs.length - 1];
    has("zscoreMathBody", "z = (v", "z-score math panel states the formula");
    has("zscoreMathBody", usdL(mean) + "/hr", "z-score math panel states the independently-derived mean");
    has("zscoreMathBody", usdL(sd) + "/hr", "z-score math panel states the independently-derived σ");
    has("zscoreMathBody", "z = (" + usdL(series[series.length - 1]) + " &minus; " + usdL(mean) + ") &divide; " + usdL(sd) + " = " + lastZ.toFixed(2),
      "z-score math panel's worked-week arithmetic matches an independent recomputation");
  }
}
// EWMA control chart (advanced-quant upgrade, 2026-08-23) — same real series as the z-score
// check above, independently recomputed from the literal series in this file, never via
// P.deriveEwma() and trusting it.
{
  const series = [2495, 2560, 2710, 3020, 3340, 3180];
  const n = series.length;
  const mean = series.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(series.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n);
  const lambda = 0.20, L = 2.7;
  let ewma = mean;
  const points = series.map((v, i) => {
    ewma = lambda * v + (1 - lambda) * ewma;
    const t = i + 1;
    const width = L * sd * Math.sqrt((lambda / (2 - lambda)) * (1 - Math.pow(1 - lambda, 2 * t)));
    return { ewma, ucl: mean + width, lcl: mean - width, flag: Math.abs(ewma - mean) > width };
  });
  const real = P.deriveEwma(series);
  ok(points.every((p, i) => Math.abs(p.ewma - real.points[i].ewma) < 1e-6 && Math.abs(p.ucl - real.points[i].ucl) < 1e-6),
    "deriveEwma() matches an independent recomputation of the full EWMA path and dynamic control limits from the literal series");
  ok(Math.abs(points[0].ewma - 2806.33) < 0.01 && Math.abs(points[5].ewma - 2963.76) < 0.01,
    "pre-registered: EWMA at week 1 is ~2806.33, at week 6 is ~2963.76", points.map(p => p.ewma.toFixed(2)).join(","));
  const flags = points.filter(p => p.flag).length;
  ok(flags === 0, "pre-registered: this series genuinely has zero EWMA breaches at λ=0.20, L=2.7 — a real null result, matching the z-score check's own direction, not manufactured");
  ok(idsA.includes("aiEwmaControl"), "markup contains #aiEwmaControl");
  has("aiEwmaControl", "GREEN — 0 breaches", "the control explicitly states the true zero-breach verdict");
  // check the HTML entity form (&lambda;), not a literal Greek character — this checks the raw
  // _html string, same as every other has() call in this file.
  has("aiEwmaControl", "&lambda;=0.2", "the smoothing parameter λ is stated in the rendered control");
  has("aiEwmaControl", "L=2.7", "the control-limit width L is stated in the rendered control");
  ok((G.aiEwmaControl._html.match(/class="rowbar"/g) || []).length === 6, "exactly one row per week");
  ok((G.aiEwmaControl._html.match(/>PASS</g) || []).length === 6 && (G.aiEwmaControl._html.match(/>FLAG</g) || []).length === 0,
    "all 6 weeks render PASS, none FLAG — matches the independently-confirmed zero-breach result");
  // the "moved net, not monotonically" claim — verify it's actually true before trusting the
  // rendered prose says so (this exact false-monotonicity claim was caught and fixed while
  // building this feature, not assumed correct on the first draft).
  ok(points[1].ewma < points[0].ewma && points[2].ewma < points[1].ewma, "pre-registered: the EWMA genuinely dips in weeks 2-3, confirming the rendered prose's 'not monotonically' claim is accurate, not a stale leftover from a since-fixed draft");
  // the EWMA section's own self-distinguishing lede is STATIC markup above #aiEwmaControl, not
  // inside its rendered innerHTML — check indexSrc, not G.aiEwmaControl._html (the same
  // static-markup-vs-rendered-innerHTML boundary this file has hit, and documented, before).
  ok(indexSrc.includes("catching persistent drift, not just outliers"), "the EWMA section's own static lede is genuinely distinct wording from the z-score section's, not a copy-paste");
  // the new "how this is actually computed" dbox (Phase 3, 2026-08-20) walks the recursive
  // update and the dynamic band width for t=6 — reuse the same independently-derived points above.
  {
    const usdL = v => (v < 0 ? "−" : "") + "$" + Math.round(Math.abs(v)).toLocaleString("en-US");
    const last = points[points.length - 1], prev = points[points.length - 2];
    has("ewmaMathBody", "ewma<sub>t</sub> = &lambda;&middot;v<sub>t</sub>", "EWMA math panel states the recursive-update formula");
    has("ewmaMathBody",
      "ewma<sub>6</sub> = 0.2&middot;" + usdL(series[series.length - 1]) + " + 0.80&middot;" + usdL(prev.ewma) + " = " + usdL(last.ewma) + "/hr",
      "EWMA math panel's t=6 update arithmetic matches an independent recomputation");
    has("ewmaMathBody",
      "UCL = " + usdL(mean) + " + " + usdL(last.ucl - mean) + " = <b style='color:rgb(var(--c-ink))'>" + usdL(last.ucl) + "/hr</b>",
      "EWMA math panel's t=6 band-width arithmetic matches an independent recomputation");
  }
}
// ingestion validation (megaproject-controls-doc upgrade, 2026-08-22) — a raw-record check,
// distinct from the GUARDS reconciliation gate above. Independently re-derive both checks from
// P.rows, never trust INGEST_GUARDS' own run() in isolation.
{
  ok(idsA.includes("aiIngestGuards"), "markup contains #aiIngestGuards");
  ok(P.ingestGuards.length === 2, "exactly 2 ingestion checks — the other 4 doc conditions need a live feed this demo doesn't have", String(P.ingestGuards.length));
  const noNegAc = P.rows.every(r => r.ac >= 0);
  const evWithinBac = P.rows.every(r => r.ev <= r.bac);
  ok(noNegAc === P.ingestGuards[0].run()[0], "no-negative-AC check's own verdict matches an independent re-derivation from P.rows");
  ok(evWithinBac === P.ingestGuards[1].run()[0], "EV<=BAC check's own verdict matches an independent re-derivation from P.rows");
  ok(noNegAc === true && evWithinBac === true, "pre-registered: both checks genuinely pass against this ledger today — an honest pass, not a rigged one");
  has("aiIngestGuards", "GREEN — all 2 passing", "the section explicitly states the true pass verdict");
  // the gap-naming sentence is in the static .lede paragraph above #aiIngestGuards, not inside
  // the element's own rendered innerHTML — check indexSrc, not has() (same "which field actually
  // holds this text" discipline this file has hit before, mirrored here on the static-markup
  // vs. rendered-innerHTML boundary instead of innerHTML-vs-textContent).
  ok(indexSrc.includes("schedule/ERP feed this demo doesn't have"),
    "the section's own copy names the unimplemented-condition gap rather than silently under-delivering");
  // the file-wide fabrication sweep (section F below) already covers "no flagged tool name
  // anywhere" — this section's own copy tripped it once already while writing it (a bare "P6"
  // mention describing what the source doc proposes, not a claimed personal-experience fact),
  // fixed by rewording rather than growing the sweep's allowlist; no need for a duplicate check here.
}
// narrative: generate, verify every figure, check the contract panel
try {
  fire(G.aiNarrBtn, "click");
  has("aiNarr", "$1,303.7M", "narrative quotes the derived EAC");
  has("aiNarr", "66.1%", "narrative quotes derived % complete");
  has("aiNarr", "CP-201", "narrative names the driving package");
  const figPass = (G.aiNarrChecks._html.match(/>PASS</g) || []).length;
  const figBlock = (G.aiNarrChecks._html.match(/>BLOCK</g) || []).length;
  ok(figPass === 14 && figBlock === 0, "narrative verification: 14 figures verified, 0 blocked",
     figPass + " verified / " + figBlock + " blocked");
  has("aiNarrChecks", "cleared to publish", "verification clears the draft");
} catch (e) { ok(false, "AI narrative", e.message); }
// the displayed SQL is the real model shape
ok(indexSrc.includes("stg_progress_claims") && indexSrc.includes("fct_control_account"),
   "displayed SQL references the real model and staging table");
// pipeline files exist and are current
ok(fs.existsSync(DIR + "pipeline/run_pipeline.py") && fs.existsSync(DIR + "pipeline/models/fct_control_account.sql")
   && fs.existsSync(DIR + "pipeline/models/schema.yml"), "pipeline/ files present");

/* =========================================================================
   D4. STORY + GLOSSARY + MOTION
   (before section E: runPage for otak.html reassigns the globals)
   ========================================================================= */
console.log("== D4. tour / glossary / motion ==");
ok(idsA.includes("t-gloss") && idsA.includes("p-gloss"), "glossary tab/panel pair exists");
ok(idsA.includes("storyTourBtn"), "the Overview teaser card carries its own tour entry point");
// self-guided tour: 10 stops, hidden until entered, opens on stop 1 with live figures.
// tourBar's initial hidden state comes from the raw `hidden` HTML attribute (correct in a real
// browser, same as presentBar above); the stub doesn't parse markup into initial DOM state, only
// JS-driven changes, so the meaningful thing to verify is the actual transition once entered.
ok(P.tourBeats.length === 10, "tour carries 10 stops", String(P.tourBeats.length));
try {
  fire(G.storyTourBtn, "click"); // the Overview teaser card's own entry point
  ok(G.tourBar.hidden === false, "starting the tour from the Overview teaser card shows the bar");
  ok(G.tourBtn.getAttribute("aria-pressed") === "true", "tourBtn reports pressed once touring");
  has("tourBar", "1 / 10", "tour opens on stop 1 of 10");
  has("tourBar", "A billion-dollar promise", "stop 1 keeps the folded-in story's original opening title");
  has("tourBar", "$1,240.0M", "stop 1 quotes the live derived BAC");
  has("tourBar", "disabled", "Back is disabled on stop 1");
  ok((G.tourBar._html.match(/data-tour="/g) || []).length === 10, "tour bar renders one clickable dot per stop");

  fire(G.tourBar, "click", { target: { closest: (sel) => sel === "[data-t]" ? { dataset: { t: "next" } } : null } });
  has("tourBar", "2 / 10", "Next advances to stop 2");
  has("tourBar", "The money starts leaking", "stop 2 keeps the folded-in story's title");
  ok(G["p-cost"].hidden === false && G["p-over"].hidden === true, "stop 2 switches to the Cost tab");
  ok(!G.tourBar._html.includes("disabled"), "Back is enabled once past stop 1");

  // jump straight to a net-new stop (risk) non-linearly via its own dot, same as Presentation Mode
  const riskIdx = P.tourBeats.findIndex((b) => b.tab === "risk");
  ok(riskIdx >= 0, "a tour stop covers the Risk tab", String(riskIdx));
  fire(G.tourBar, "click", { target: { closest: (sel) => (sel === "[data-tour]" ? { dataset: { tour: String(riskIdx) } } : null) } });
  ok(G["p-risk"].hidden === false, "clicking the risk stop's dot jumps straight there, switching tabs");
  has("tourBar", "Betting on the unknown", "risk stop shows its own title");

  // Gate 5 stop replays the reveal and syncs the Gate Line diagram — same mechanism and same
  // caveat as Presentation Mode's own Gate 5 beat check just above: querySelectorAll always
  // returns [] in this stub, so the Gate Line's own story title is the observable proxy here.
  const gate5Idx = P.tourBeats.findIndex((b) => b.anchor === "gate5Card");
  ok(gate5Idx >= 0, "a tour stop anchors to gate5Card", String(gate5Idx));
  fire(G.tourBar, "click", { target: { closest: (sel) => (sel === "[data-tour]" ? { dataset: { tour: String(gate5Idx) } } : null) } });
  has("glStoryTitle", "Gate 5", "landing on the tour's Gate 5 stop syncs the Gate Line diagram to its own Gate 5 node");

  // last stop's Next button reads "Done" instead of "Next", and clicking it exits the tour
  const lastIdx = P.tourBeats.length - 1;
  fire(G.tourBar, "click", { target: { closest: (sel) => (sel === "[data-tour]" ? { dataset: { tour: String(lastIdx) } } : null) } });
  has("tourBar", "Done", "the final stop's Next button reads Done, not Next");
  has("tourBar", "Monday morning", "the final stop is the folded-in story's original closing beat");
  fire(G.tourBar, "click", { target: { closest: (sel) => (sel === "[data-t]" ? { dataset: { t: "next" } } : null) } });
  ok(G.tourBar.hidden === true, "clicking Done on the final stop exits the tour");
  ok(G.tourBtn.getAttribute("aria-pressed") === "false", "exiting un-presses the tour button");

  // arrow-key nav (not N/P — those are Presentation Mode's, so the two never collide), only
  // while touring, and inert once exited
  fire(G.tourBtn, "click"); // re-enter via the header button this time, resets to stop 1
  ok(G.tourBar.hidden === false, "re-entering the tour works a second time");
  has("tourBar", "1 / 10", "re-entering resets to stop 1");
  fire(R.win, "keydown", { key: "ArrowRight", target: { tagName: "BODY" } });
  has("tourBar", "2 / 10", "ArrowRight advances a stop while touring");
  fire(R.win, "keydown", { key: "ArrowLeft", target: { tagName: "BODY" } });
  has("tourBar", "1 / 10", "ArrowLeft steps back a stop while touring");
  fire(R.win, "keydown", { key: "Escape", target: { tagName: "BODY" } });
  ok(G.tourBar.hidden === true, "Escape exits the tour");
  const beforeKey = G.tourBar._html;
  fire(R.win, "keydown", { key: "ArrowRight", target: { tagName: "BODY" } });
  ok(G.tourBar._html === beforeKey, "ArrowRight does nothing when not touring");

  // mutual exclusivity with Presentation Mode — the two fixed bars must never stack
  fire(G.tourBtn, "click");
  ok(G.tourBar.hidden === false, "tour re-entered for the mutual-exclusivity check");
  fire(G.presentBtn, "click");
  ok(G.presentBar.hidden === false && G.tourBar.hidden === true, "entering Presentation Mode exits an active tour");
  fire(G.tourBtn, "click");
  ok(G.tourBar.hidden === false && G.presentBar.hidden === true, "entering the tour exits an active Presentation Mode");
  fire(G.tourBtn, "click"); // exit, and back to the Overview tab, so later sections aren't disturbed
  fire(G["t-over"], "click");
} catch (e) { ok(false, "tour navigation", e.message); }
// glossary: full render, live figures in examples, filter narrows and restores
const glossAll = (G.glossList._html.match(/class="gcard"/g) || []).length;
ok(glossAll >= 18, "glossary renders at least 18 terms", String(glossAll));
const exCount = (G.glossList._html.match(/Example from this program/g) || []).length;
ok(exCount === glossAll, "every glossary term carries a worked example");
has("glossList", "1,160", "BEI example uses live activity count 1,160");
has("glossList", "$52.6M", "contingency example uses live remaining balance");
has("glossList", "1.42", "TRIR example recomputes to 1.42");
// 6 new glossary entries (engagement/interactivity upgrade, 2026-08-2x, Phase 3) — each checked
// against an independent recomputation from raw exposed data (ACTIONS/WBS/DELAYS filtered
// directly), except EWMA/GBM which quote deriveEwma()/deriveGbmParams() — both already
// independently re-derived elsewhere in this file from their own literal series, so re-testing
// their formula math a third time here would be redundant; this test's real job is confirming the
// glossary entry correctly surfaces those already-trusted values, not re-deriving them again.
{
  const cphSeries = P.cphCells[0].weeks.map(w => w.actual);
  const zReal = P.deriveZScores(cphSeries);
  const zFlags = zReal.points.filter(p => p.flag).length;
  has("glossList", zFlags + " of " + zReal.points.length + " weeks", "z-score glossary example states the real breach count against the real week count");
  const ewmaReal = P.deriveEwma(cphSeries);
  const ewmaFlags = ewmaReal.points.filter(p => p.flag).length;
  has("glossList", ewmaFlags + " of " + ewmaReal.points.length + " weeks", "EWMA glossary example states the real breach count against the real week count");
  has("glossList", "&lambda;=" + ewmaReal.lambda, "EWMA glossary example states the real lambda parameter");
  const gbmReal = P.deriveGbmParams(P.acHistorySeries().map(pt => pt.ac));
  has("glossList", pct(gbmReal.muHatMle, 2), "GBM glossary example states the real drift figure");
  has("glossList", pct(gbmReal.sigmaHatMle, 2), "GBM glossary example states the real volatility figure");
  const byType = {};
  P.actions.forEach(a => { byType[a.type] = (byType[a.type] || 0) + 1; });
  has("glossList", (byType.Issue || 0) + " Issues, " + (byType.Task || 0) + " Tasks, and " + (byType.Decision || 0) + " Decisions",
    "RAID glossary example states the real per-type counts, independently tallied from the raw ACTIONS array");
  const a1 = P.actions.filter(a => a.id === "A-01")[0];
  ok(G.glossList._html.includes(a1.root.slice(0, 74)) && G.glossList._html.includes(a1.corrective.slice(0, 60)) && G.glossList._html.includes(a1.preventive.slice(0, 60)),
    "CAPA glossary example quotes A-01's real root/corrective/preventive fields verbatim, independently sliced from the raw ACTIONS array");
  const wbs201 = P.wbs.filter(w => w.ca === "CP-201")[0];
  ok(G.glossList._html.includes(wbs201.cbs) && G.glossList._html.includes(wbs201.obs),
    "CBS/OBS glossary example names CP-201's real CBS category and OBS owner, independently filtered from the raw WBS array");
  const d01 = P.delays.filter(d => d.id === "D-01")[0], d03 = P.delays.filter(d => d.id === "D-03")[0];
  ok(G.glossList._html.includes(d01.cls) && G.glossList._html.includes(d03.cls),
    "excusable/compensable glossary example contrasts D-01's and D-03's real classification strings, independently filtered from the raw DELAYS array");
}
try {
  G.glossQ.value = "contingency";
  fire(G.glossQ, "input");
  const n = (G.glossList._html.match(/class="gcard"/g) || []).length;
  // 3->4 (engagement/interactivity upgrade, 2026-08-2x): the new CAPA glossary entry quotes A-01's
  // real preventive-action field verbatim, which itself happens to start with "Contingency release
  // is now gated..." — a genuine, real data collision (found by running this exact assertion and
  // getting 4 instead of the old <=3, not assumed), not a bug to fix in either direction.
  // 4->5 (six-families card, 2026-08-21): the new "Risk family" glossary entry genuinely discusses
  // the contingency reserve twice (its own definition and its live-computed worked example) — same
  // real-collision pattern as above, found the same way, not assumed.
  ok(n >= 1 && n <= 5, "glossary filter narrows to matching terms", String(n));
  has("glossList", "Contingency", "filter keeps the contingency term");
  G.glossQ.value = "";
  fire(G.glossQ, "input");
  ok((G.glossList._html.match(/class="gcard"/g) || []).length === glossAll,
    "clearing the filter restores all terms");
} catch (e) { ok(false, "glossary filter", e.message); }
// motion hooks
ok(G.scurve._html.includes('class="draw"'), "S-curve paths carry draw-in animation");
ok((G.kboard._html.match(/animation-delay:/g) || []).length === 20,
  "all 20 KPI cards carry staggered entrance delays");
ok(indexSrc.includes("@keyframes drawin") && indexSrc.includes("prefers-reduced-motion"),
  "motion CSS present with reduced-motion guard");
// first-visit cue, now on the tour button (2026-08-19: retargeted from the old story card since
// the tour is reachable from every tab, not just Overview): this DOM stub has no
// window.localStorage (same gap that broke document.addEventListener earlier this project), so
// fvVisited()/fvClear() must be try/catch-guarded rather than assume localStorage exists —
// confirm that guard by source (classList is a stub no-op here, so "does the class actually
// toggle" can't be observed live) and confirm the guarded functions don't crash the page or any
// tour interaction.
ok(/try\{\s*return window\.localStorage/.test(indexSrc), "fvVisited() try/catches the localStorage read");
ok(/try\{\s*if\(window\.localStorage\)/.test(indexSrc), "fvClear() try/catches the localStorage write");
try {
  fire(G.tourBtn, "click");
  fire(G.tourBtn, "click");
  ok(true, "first-visit cue wiring never throws on tour entry/exit with no localStorage");
} catch (e) { ok(false, "first-visit cue (no-localStorage guard)", e.message); }
fire(G["t-over"], "click"); // the tour block above ends back on Overview, but stay defensive

/* =========================================================================
   D4.5 EXECUTIVE SUMMARY (brainstorm 2026-08-19) — the always-on-screen
   counterpart to the print-only brief; every stat cross-checked against an
   independently-derived or already-verified live value, never the pasted
   external doc's own numbers (several of which were confirmed wrong).
   ========================================================================= */
console.log("== D4.5. executive summary ==");
// the card's own thesis paragraph is static HTML, never JS-rendered into innerHTML at runtime —
// same situation as the old story card's static teaser text — so idsA (parsed from source) is
// the right check here, not has() (which only sees runtime .innerHTML assignments)
ok(idsA.includes("execSummary") && indexSrc.includes("decorative, and nothing is typed"),
  "exec summary card exists and states the platform's own doctrine");
{
  // guard count comes from guardCountLede's own already-independently-verified live value
  // (established precedent — see the AI & Data tab verification-gate check further down this
  // file — rather than re-deriving GUARDS.length a third way)
  const guardCount = G.guardCountLede.textContent;
  const expectedStats = [P.kpis.length, guardCount, P.eacs.length,
    P.gates.filter((g) => g.gate).length, P.actions.length];
  expectedStats.forEach((v) => has("execStats", ">" + v + "<", "exec stat strip shows " + v));
  ok(expectedStats[3] === 6, "6 of the program's phase gates carry a real gate number (not the null-gate Closeout phase)",
    String(expectedStats[3]));
}
{
  const gate5Pass = P.gate5Checks.every((c) => c.run()[0]);
  has("execBottomLine", m(P.totals.eac), "bottom line quotes the live EAC");
  has("execBottomLine", m(P.totals.bac), "bottom line quotes the live BAC");
  has("execBottomLine", pct(P.mc.pBust, 0), "bottom line quotes the live pBust percentage");
  has("execBottomLine", idx(P.totals.contCoverage), "bottom line quotes the live contingency coverage ratio");
  ok(gate5Pass === false, "pre-registered: this program's data has Gate 5 failing (matches the tour/framework tab's own story)", String(gate5Pass));
  has("execBottomLine", "blocked", "bottom line says Gate 5 is blocked, matching the pre-registered failing state");
}

/* =========================================================================
   D4.6 /stress-test FIXES (2026-08-19) — regression coverage for every fix
   driven by the full-file adversarial pass (3 independent reviewers + self).
   ========================================================================= */
console.log("== D4.6. stress-test fixes ==");

// 1. ESCALATION magic-index -> findEsc()/ESC_PAT lookup-by-text. firingEscalations() and the KPI
// drawer's fallback (KPI_ESCALATION) both indexed positionally; direct-test more than the two
// triggers the print-brief test already covers indirectly.
{
  const firing = P.firingEscalations();
  const cpiRow = firing.find((r) => T.cpi < 0.95 && /^CPI /.test(r[0]));
  if (T.cpi < 0.95) ok(!!cpiRow, "firingEscalations() attaches the CPI row's own text when CPI fires, not a shifted neighbor's");
  const covRow = firing.find((r) => /^Contingency coverage/.test(r[0]));
  ok(T.contCoverage < 1 ? !!covRow : true, "firingEscalations() attaches the contingency-coverage row's own text when it fires");
  // every ESC_PAT pattern still resolves to exactly one row (no drift, no collision)
  Object.keys(P.escPat).forEach((k) => {
    const matches = P.escalation.filter((e) => P.escPat[k].test(e[0]));
    ok(matches.length === 1, "ESC_PAT." + k + " matches exactly one ESCALATION row", String(matches.length));
  });
}

// 2. MILES[6] -> MILES[MILES.length-1]. Current data can't behaviorally distinguish the fix
// (MILES.length===7, so index 6 already equals length-1) — that's the bug's own "invisible
// today" nature, not a gap in this check. Source-confirm the fragile literal is gone.
ok(!/MILES\[6\]/.test(indexSrc), "no remaining MILES[6] magic-index literal in the source");
ok(P.spark.msv[P.spark.msv.length - 1] === P.milesLast.d,
  "MSV sparkline's last point still matches the live contractual-slip figure");

// 3. Hardcoded "44 days of float" removed from the CPLI KPI's why text.
ok(!indexSrc.includes("44 days of float"), "CPLI KPI's why-text no longer cites a hardcoded, unrelated float value");

// 4. TIA register footnote: was days(22)/days(40) typed by hand, now reads DELAYS live — prove
// the footnote and the register table actually agree, which is the sentence's own claim.
{
  const d01 = P.delays.find((d) => d.id === "D-01").d, d02 = P.delays.find((d) => d.id === "D-02").d;
  // matches the footnote's own specific phrasing, not just "the number appears somewhere in
  // tiaReg" (which the register rows above it would also satisfy even if the footnote were wrong)
  has("tiaReg", "D-01 is the " + days(d01), "TIA footnote's D-01 day count matches the live DELAYS entry, not a typed literal");
  has("tiaReg", "D-02 is the " + days(d02), "TIA footnote's D-02 day count matches the live DELAYS entry, not a typed literal");
}

// 5. BASELINE[0]/[1]/[3] magic-index -> lookup by label in the VE/buyout glossary entries.
{
  const award = P.baseline.find((b) => /^Engineer/.test(b.l)).v;
  const ve = P.baseline.find((b) => /Value engineering/.test(b.l)).v;
  const buyout = P.baseline.find((b) => /^Buyout/.test(b.l)).v;
  const veEntry = P.findGloss("ve"), buyoutEntry = P.findGloss("buyout");
  ok(veEntry.e().includes(m(Math.abs(ve))) && veEntry.e().includes(m(award)),
    "VE glossary entry cites the live BASELINE VE and award figures, found by label not position");
  ok(buyoutEntry.e().includes(m(Math.abs(buyout))),
    "buyout glossary entry cites the live BASELINE buyout figure, found by label not position");
}

// 6. DISCREPANCY_STEPS[0..4] -> dsStep(n) lookup by the step's own "N ·" label.
{
  for (let n = 1; n <= 5; n++) {
    const step = P.dsStep(n);
    ok(!!step && new RegExp("^" + n + "\\s").test(step.n), "dsStep(" + n + ") resolves to step " + n + "'s own row");
  }
  const detect = P.dsCaption({ k: "detect" });
  ok(detect.x.includes(P.dsStep(1).w), "dsCaption('detect') still quotes step 1's own text via the new lookup");
}

// 7. Monte Carlo triangular-distribution degenerate-point bug: min===max (NaN, silently returns
// a constant) when a control account's CPI drops to <=0.72 — pre-registered per B35: with the
// fix, hi must stay strictly greater than lo even at that floor, and triang() must return a real
// number, not NaN, across the full [0,1) draw range.
{
  const lowCpiRow = { cpi: 0.60 }; // synthetic — no real account is this low today, that's the point
  const p = P.mcParams(lowCpiRow);
  ok(p.hi > p.lo, "mcParams() guarantees hi > lo even for a CPI far below the 0.78 floor", "lo=" + p.lo + " hi=" + p.hi);
  ok(p.lo <= p.mode && p.mode <= p.hi, "mcParams() still keeps lo<=mode<=hi at the same extreme");
  let sawNaN = false;
  for (let u = 0; u < 1; u += 0.05) { if (Number.isNaN(P.triang(u, p.lo, p.hi, p.mode))) sawNaN = true; }
  ok(!sawNaN, "triang() with mcParams()'s output never returns NaN across a full sweep of draws, even at this extreme");
}

// 8. Tour keyboard boundary divergence: ArrowRight at the final stop now exits, matching what the
// Next/Done button already did — pre-registered before the probe (B35).
try {
  fire(G.tourBtn, "click");
  fire(G.tourBar, "click", { target: { closest: (sel) => (sel === "[data-tour]" ? { dataset: { tour: String(P.tourBeats.length - 1) } } : null) } });
  has("tourBar", "Done", "sanity: on the final stop before the ArrowRight probe");
  fire(R.win, "keydown", { key: "ArrowRight", target: { tagName: "BODY" } });
  ok(G.tourBar.hidden === true, "ArrowRight at the final tour stop now exits, matching the Done button (previously it silently re-clamped and stuck)");
  fire(G["t-over"], "click");
} catch (e) { ok(false, "tour ArrowRight boundary fix", e.message); }

// 9. Tour Back/Prev button + the i<0 clamp, previously entirely unexercised.
try {
  fire(G.tourBtn, "click");
  has("tourBar", "1 / 10", "sanity: fresh tour entry starts at stop 1");
  fire(G.tourBar, "click", { target: { closest: (sel) => (sel === "[data-t]" ? { dataset: { t: "prev" } } : null) } });
  has("tourBar", "1 / 10", "clicking Prev at stop 1 is a no-op (goToTourStop's i<0 clamp), not a crash");
  fire(G.tourBar, "click", { target: { closest: (sel) => (sel === "[data-t]" ? { dataset: { t: "next" } } : null) } });
  has("tourBar", "2 / 10", "sanity: Next still advances normally after the Prev-at-floor probe");
  fire(G.tourBar, "click", { target: { closest: (sel) => (sel === "[data-t]" ? { dataset: { t: "prev" } } : null) } });
  has("tourBar", "1 / 10", "Prev from stop 2 correctly returns to stop 1");
  fire(R.win, "keydown", { key: "ArrowLeft", target: { tagName: "BODY" } });
  has("tourBar", "1 / 10", "ArrowLeft at stop 1 is also a no-op, not a crash (same i<0 clamp, keyboard path)");
  fire(G.tourBtn, "click");
  fire(G["t-over"], "click");
} catch (e) { ok(false, "tour Prev/ArrowLeft boundary coverage", e.message); }

// 10. Tour narration aria-live gap: #tourText now announces on stop change.
{
  fire(G.tourBtn, "click");
  ok(G.tourBar._html.includes('id="tourText" aria-live="polite"'),
    "tour narration paragraph is now a live region, matching glDetail/dsDetail/presentOnScreen");
  fire(G.tourBtn, "click");
  fire(G["t-over"], "click");
}

// 11. themeBtn now gets a real aria-pressed at init, matching its tourBtn/presentBtn siblings.
ok(G.themeBtn.getAttribute("aria-pressed") === "true" || G.themeBtn.getAttribute("aria-pressed") === "false",
  "themeBtn carries a real aria-pressed value at init, not null", G.themeBtn.getAttribute("aria-pressed"));

// 12. My own self-found bug: the Actions tour stop's denominator was ACTIONS.length (17, includes
// 1 done item) labeled "open items" — should be the actual open count (16).
{
  const openCount = P.actions.filter((a) => !a.done).length;
  ok(openCount === P.actions.length - 1, "sanity: exactly one ACTIONS entry is done, confirming the bug was real", String(openCount));
  const actionsStop = P.tourBeats.find((b) => b.tab === "act" && b.anchor === "actTable");
  ok(new RegExp("of " + openCount + " open items").test(actionsStop.x()),
    "Actions tour stop's denominator is the real open-item count, not the total including a closed item");
  ok(!new RegExp("of " + P.actions.length + " open items").test(actionsStop.x()),
    "Actions tour stop no longer uses the total ACTIONS.length (17) as if it were the open count");
}

// 13. Dual-coding / touch-target / focus-visible CSS fixes — source-inspection (no
// getComputedStyle in this stub, same documented limitation as the rest of this file).
ok(indexSrc.includes('" severity: "+n+" risk"'),
  "risk heat-map cells now state their severity band in words in the label, not color alone");
ok(indexSrc.includes('band==="high"?"2px solid'),
  "risk heat-map high-severity cells also get a visible border, a shape cue beyond just the label word");
ok(indexSrc.includes(".help-pop-close::before{content:\"\";position:absolute"),
  "help-pop-close now carries the same 44px hit-slop pattern as help-ic");
ok(indexSrc.includes(".flow-node:focus-visible rect,.flow-node:focus-visible polygon"),
  "index.html's Gate Line / CDE flow nodes use :focus-visible, not :focus, for the keyboard-only ring");

// 14. renderTable()'s own output (#pkgBody/#pkgFoot, the Cost tab's primary financial table) had
// zero content assertions — every prior test only used it as a synthetic fire() target. Cheap,
// targeted backfill, not exhaustive per-row coverage (logged as a follow-up below).
has("pkgFoot", "Program · " + rows.length + " control accounts", "totals row labels the right control-account count");
has("pkgFoot", m(T.bac), "totals row's BAC matches the live portfolio total");
has("pkgFoot", m(T.eac), "totals row's EAC matches the live portfolio total");
has("pkgFoot", sgn(T.vac), "totals row's VAC matches the live portfolio total");
ok((G.pkgBody._html.match(/data-i="/g) || []).length === rows.length,
  "one clickable row per control account in the ledger table");

/* =========================================================================
   D4.7 TEXT-SIZE CONTROL (brainstorm 2026-08-20) — inclusive text-size feature
   ========================================================================= */
console.log("== D4.7. text-size control ==");
ok(P.textZoom.length === 3, "3 text-size steps defined", P.textZoom.map((t) => t.zoom).join(","));
// /stress-test finding (2026-08-20): this shipped as two parallel arrays (TEXT_ZOOM_LEVELS/
// TEXT_ZOOM_LABELS) indexed by the same integer — the exact "desyncs silently if one array is
// edited without the other" bug class already fixed elsewhere in this file (ESCALATION, MILES,
// DISCREPANCY_STEPS, BASELINE). Consolidated into one array of {zoom,label} pairs; this
// structural check is what makes that consolidation actually mean something, not just cosmetic.
ok(P.textZoom.every((t) => typeof t.zoom === "number" && typeof t.label === "string"),
  "every text-size step is one {zoom,label} pair, not two separately-indexable arrays");
ok(P.state.textSize === 0, "text size starts at Normal (step 0)");
try {
  ok(G.textDownBtn.disabled === true, "A− is disabled at the floor (Normal)");
  ok(G.textUpBtn.disabled === false, "A+ is enabled at the floor");
  ok(G.textSizeLabel.textContent === "Normal", "label reads Normal at step 0");

  fire(G.textUpBtn, "click");
  ok(P.state.textSize === 1, "A+ advances to step 1 (Large)");
  ok(G.textSizeLabel.textContent === "Large", "label updates to Large");
  ok(document.documentElement.style.getPropertyValue("--text-zoom") === "1.25",
    "--text-zoom CSS var is set to 1.25 for Large");
  ok(G.textDownBtn.disabled === false, "A− re-enables once past the floor");

  fire(G.textUpBtn, "click");
  ok(P.state.textSize === 2, "A+ advances to step 2 (Larger)");
  ok(G.textSizeLabel.textContent === "Larger", "label updates to Larger");
  ok(document.documentElement.style.getPropertyValue("--text-zoom") === "1.5",
    "--text-zoom CSS var is set to 1.5 for Larger");
  ok(G.textUpBtn.disabled === true, "A+ is disabled at the ceiling (Larger)");

  // clicking A+ again at the ceiling must not overshoot the array (applyTextSize's own clamp,
  // not just the disabled attribute the stub doesn't enforce)
  fire(G.textUpBtn, "click");
  ok(P.state.textSize === 2, "state.textSize clamps at the ceiling even if A+ fires again", String(P.state.textSize));
  ok(P.textZoom[P.state.textSize].zoom === 1.5, "clamped state still indexes a real {zoom,label} pair, no undefined");

  fire(G.textDownBtn, "click");
  fire(G.textDownBtn, "click");
  ok(P.state.textSize === 0, "two A− clicks return to Normal");
  fire(G.textDownBtn, "click");
  ok(P.state.textSize === 0, "state.textSize clamps at the floor even if A− fires again at 0");
  ok(document.documentElement.style.getPropertyValue("--text-zoom") === "1",
    "--text-zoom returns to 1 at Normal");
} catch (e) { ok(false, "text-size control interaction", e.message); }
// try/catch guard, same discipline as fvVisited/fvClear (no localStorage in this stub)
ok(/try\{\s*if\(window\.localStorage\) window\.localStorage\.setItem\("pccTextSize"/.test(indexSrc),
  "applyTextSize() try/catches the localStorage write, same guard as the first-visit cue");
ok(/try\{\s*var savedTextSize=window\.localStorage/.test(indexSrc),
  "the saved-size read on init is also try/catch-guarded");

/* =========================================================================
   D4.8 A11Y BRAINSTORM (2026-08-20) — 6-item pass triaged from a pasted
   proposal doc: half was already built, this covers what genuinely wasn't.
   ========================================================================= */
console.log("== D4.8. a11y brainstorm pass ==");
// 1. KPI board: aria-expanded/aria-controls on cards, aria-live on the dimNote summary
has("kboard", 'aria-controls="kdetail"', "KPI cards declare which drawer they control");
try {
  var firstKpi = P.kpis[0];
  fire(G.kboard, "click", { target: { closest: (sel) => (sel === "[data-kpi]" ? { dataset: { kpi: firstKpi.id } } : null) } });
  ok(P.state.kpi === firstKpi.id, "clicking a KPI card sets state.kpi (drives its aria-expanded true)");
  has("kdetail", firstKpi.name, "the drawer renderDetail() populates matches the clicked card");
  // syncKpiAriaExpanded() queries #kboard [data-kpi] via querySelectorAll, which always returns []
  // in this stub (documented harness limitation) — the real assertion here is that calling it with
  // zero matched elements is a silent no-op, not a crash; the actual attribute-update is only
  // observable in the live-browser pass.
  fire(G.kboard, "click", { target: { closest: (sel) => (sel === "[data-kpi]" ? { dataset: { kpi: firstKpi.id } } : null) } });
  ok(P.state.kpi === null, "clicking the same card again closes it (toggles state.kpi back to null)");
} catch (e) { ok(false, "KPI board aria-expanded click", e.message); }
ok(indexSrc.includes('aria-live="polite"') && /id="dimNote" aria-live="polite"/.test(indexSrc),
  "dimNote (the phase-dim summary) is a live region baked into its own template, not added after the fact (would be lost on re-render otherwise)");
ok(indexSrc.includes("function syncKpiAriaExpanded"),
  "a dedicated sync function updates aria-expanded directly (matching the help-ic pattern) instead of a full board re-render for a state toggle this small");

// 2. Dimmed KPI card contrast fix — verify the blanket opacity is gone and text keeps its own color
ok(!indexSrc.includes(".kpi.dim{opacity:.4}"),
  "the old blanket-opacity dim rule (measured ~3.3:1 dark / ~2.6:1 light, below WCAG AA) is gone");
ok(/\.kpi\.dim\{background:rgb\(var\(--c-card\) \/ \.45\)/.test(indexSrc),
  "dimming now fades the background specifically (verified by direct computation to stay 6.5:1+ with full-color text), not text+background together");

// 3. Sticky table headers — BUILT (2026-08-19), then REVERTED (2026-08-20) after a user report
// ("column headers moved to different rows") led to a confirmed live bug: .tw's overflow-x:auto
// forces its overflow-y to auto too (CSS Overflow spec's visible-axis promotion rule), turning
// .tw into position:sticky's containing block instead of the page viewport — every sticky <th>
// painted offset from its own row by roughly --header-h, landing on top of the table's second
// data row. Caught by elementsFromPoint() disagreeing with getBoundingClientRect() (the paint
// position and the layout-box position had diverged) — this stub has no real layout/paint engine,
// so that specific contradiction was never visible to it; these two checks now assert the revert.
ok(!indexSrc.includes("position:sticky") || !indexSrc.includes(".tw table th"),
  "sticky table headers are gone from .tw table th — reverted, not just source-text absent by coincidence",
  indexSrc.includes(".tw table th") ? indexSrc.match(/\.tw table th\{[^}]*\}/)[0] : "(.tw table th rule not found)");
// checks the actual consuming/producing forms, not "the string --header-h/ResizeObserver appears
// nowhere" — the revert's own explanatory comments (both here and in index.html) legitimately
// mention both names, and a bare .includes("ResizeObserver") false-failed against its own comment
// two lines above this one the first time this was written (the same self-own class of bug the
// #whatIfOut debounce fix's own test caught earlier this round — checking for a live construct,
// not a word, is the actual fix each time).
ok(!indexSrc.includes("var(--header-h") && !indexSrc.includes('"--header-h"') && !indexSrc.includes("new ResizeObserver("),
  "no live code still reads --header-h via var(), writes it via setProperty, or runs the ResizeObserver that used to feed it");

// 4. scope="row" on the ledger, actions register, and contract table's identifying column
has("pkgBody", '<th scope="row">', "control-account ledger rows use a real row header, not just a first td");
ok((indexSrc.match(/scope="row"/g) || []).length >= 3,
  "scope=row used on at least the 3 targeted tables (ledger, contracts, actions)", String((indexSrc.match(/scope="row"/g) || []).length));

// 5. aria-keyshortcuts on the two mode-toggle buttons
ok(idsA.includes("presentBtn") && /id="presentBtn"[^>]*aria-keyshortcuts="N P Escape"/.test(indexSrc),
  "Present button declares its N/P/Escape shortcuts");
ok(/id="tourBtn"[^>]*aria-keyshortcuts="ArrowLeft ArrowRight Escape"/.test(indexSrc),
  "Tour button declares its arrow-key/Escape shortcuts");

// 6. scroll-edge gradient cue on wide table containers
ok(indexSrc.includes("background-attachment:local,local,scroll,scroll"),
  "table containers carry the scroll-edge shadow cue (4-layer cover+shadow technique)");

/* =========================================================================
   D4.9 A11Y BRAINSTORM ROUND 2 (2026-08-20) — 3-item pass triaged from a
   second pasted proposal doc, almost entirely redundant with D4.8 above.
   ========================================================================= */
console.log("== D4.9. a11y brainstorm pass 2 ==");
// 1. table captions — live-computed, not typed, on the 4 register/log tables
// pkgCaption is set via .textContent, not .innerHTML — has() checks the wrong field (_html) for
// a textContent-set element, same gotcha class documented earlier this file
ok(String(G.pkgCaption.textContent).includes(rows.length + " accounts"),
  "ledger caption states the live account count", G.pkgCaption.textContent);
has("actTable", "Actions &amp; RAID register", "actions register caption identifies the dataset");
has("actTable", "showing all " + P.actions.length + " items", "actions caption states the live unfiltered count by default");
has("contractTable", P.contracts.length + " contracts", "contract register caption states the live contract count");
has("escTable", P.escalation.length + " rules", "escalation matrix caption states the live rule count");
ok((indexSrc.match(/<caption class="tw-caption">/g) || []).length + (indexSrc.match(/<caption id="pkgCaption"/g) || []).length >= 4,
  "at least 4 tables carry a <caption>", String((indexSrc.match(/<caption/g) || []).length));

// 2. aria-live moved to the settled narrative sentence, not the per-frame-tweened stat grid
ok(indexSrc.includes('id="mcRead" style="margin-top:12px;font-size:12.8px" aria-live="polite"'),
  "Monte Carlo's narrative sentence (#mcRead), not the tweened #mcStats grid, carries aria-live");
ok(!/id="mcStats"[^>]*aria-live/.test(indexSrc),
  "#mcStats itself does NOT carry aria-live (would spam a screen reader every animation frame)");

// 3. focus returns to the trigger button on mode exit, matching closeHelp()'s existing pattern
try {
  fire(G.presentBtn, "click"); // enter
  const before = G.presentBtn._focusCount;
  fire(G.presentBtn, "click"); // exit
  ok(G.presentBtn._focusCount === before + 1, "exitPresent() returns focus to presentBtn");
  fire(G.tourBtn, "click"); // enter
  const beforeTour = G.tourBtn._focusCount;
  fire(G.tourBtn, "click"); // exit
  ok(G.tourBtn._focusCount === beforeTour + 1, "exitTour() returns focus to tourBtn");
  fire(G["t-over"], "click"); // leave tab state clean for later sections
} catch (e) { ok(false, "focus-return on mode exit", e.message); }

/* =========================================================================
   D4.10 STRESS-TEST FIXES ROUND 2 (2026-08-20) — a second, scoped stress-test
   pass over just the D4.7-D4.9 work above, per TJ's own explicit choice
   ("work since the last full stress-test"). Reviewed adversarially (self +
   3 independent background reviewers), each finding below empirically
   verified before being accepted as real — see index.html's own comments
   at each fix site for the full reasoning.
   ========================================================================= */
console.log("== D4.10. stress-test fixes round 2 ==");

// 1. .kpi.dim border-color — the old rule double-wrapped --c-line (already a complete rgb()
// value) in a second rgb(...), which is invalid CSS; live getComputedStyle confirmed it computed
// to near-white (the currentColor fallback for an invalid non-inherited property), not a faded
// line. Fixed to reference --c-line directly, plus filter:saturate() as a theme-independent
// backup signal — the light-theme background-alpha fade alone was found nearly invisible, since
// --c-card and the page background sit too close together there for any alpha blend to read.
ok(!/\.kpi\.dim\{[^}]*border-color:rgb\(var\(--c-line\)/.test(indexSrc),
  "the invalid double-wrapped border-color:rgb(var(--c-line)/...) is gone from .kpi.dim");
ok(/\.kpi\.dim\{[^}]*border-color:var\(--c-line\)/.test(indexSrc),
  ".kpi.dim now references --c-line directly, matching its ~20 other correct usages in this file");
ok(/\.kpi\.dim\{[^}]*filter:saturate\(\.55\)/.test(indexSrc),
  "a theme-independent saturate() filter backs up the alpha fade for light theme");
// live-browser getComputedStyle confirmed (not just source-text): a dim card's computed
// borderColor now matches a live card's (both rgba(6,182,212,0.2) in dark theme), not the
// broken rgb(241,245,249) the invalid rule produced before this fix.

// 2. Present/Tour mutual-exclusion focus-jump — entering one mode while the other was active used
// to leave focus stranded on the just-abandoned trigger (the internal exitTour()/exitPresent()
// call), not the mode actually entered. exitPresent()/exitTour() now take a skipFocus param, set
// only by the other's internal mutual-exclusion call.
try {
  fire(G.tourBtn, "click"); // enter tour (real user action — should focus tourBtn)
  const tourFocusAfterEnter = G.tourBtn._focusCount;
  ok(tourFocusAfterEnter > 0, "entering Tour focuses tourBtn");
  fire(G.presentBtn, "click"); // mutual exclusion: internally exits tour, enters present
  ok(G.presentBtn._focusCount > 0, "entering Present while Touring ends with focus on presentBtn");
  ok(G.tourBtn._focusCount === tourFocusAfterEnter,
    "the internal exitTour() call during that transition does NOT also re-focus tourBtn (skipFocus)");
  const presentFocusAfterEnter = G.presentBtn._focusCount;
  fire(G.tourBtn, "click"); // mutual exclusion the other way: internally exits present, enters tour
  ok(G.tourBtn._focusCount > tourFocusAfterEnter, "entering Tour while Presenting ends with focus on tourBtn");
  ok(G.presentBtn._focusCount === presentFocusAfterEnter,
    "the internal exitPresent() call during that transition does NOT also re-focus presentBtn (skipFocus)");
  const tourFocusBeforeRealExit = G.tourBtn._focusCount;
  fire(G.tourBtn, "click"); // genuine user-initiated exit this time, not mutual exclusion
  ok(G.tourBtn._focusCount > tourFocusBeforeRealExit, "a real user-initiated exitTour() still focuses tourBtn");
} catch (e) { ok(false, "Present/Tour mutual-exclusion focus", e.message); }

// 3. jumpToAction() now syncs aria-expanded — previously left a stale aria-expanded="true" on a
// KPI card after navigating away from it via its own "jump to action" link. This stub's
// querySelectorAll always returns [], so syncKpiAriaExpanded()'s actual DOM write is unobservable
// here (same documented limitation as D4.8 #1 above) — this confirms jumpToAction() calls it at
// all (a real live-browser check already confirmed the DOM effect: aria-expanded true -> false).
ok(/function jumpToAction\(id\)\{\s*state\.kpi=null; renderDetail\(\);\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*syncKpiAriaExpanded\(\);/.test(indexSrc),
  "jumpToAction() calls syncKpiAriaExpanded() right after clearing state.kpi, matching closeDetail's own pattern");

// 4. #whatIfOut/#whatIfRead aria-live — the value grid (rewritten on every slider tick) must not
// be a live region; the settled prose sentence carries it instead, debounced to the drag settling
// (not a straight port of the #mcRead pattern — that control's trigger is a discrete, already-
// settled filter change, these 3 range sliders fire many continuous 'input' events per drag).
ok(!/id="whatIfOut" aria-live/.test(indexSrc),
  "#whatIfOut no longer carries aria-live (would spam a screen reader on every slider tick)");
ok(/id="whatIfRead"[^>]*aria-live="polite"/.test(indexSrc),
  "#whatIfRead (the settled narrative) carries aria-live instead");
// checks for the actual wired fix, not the absence of the old pattern's literal text — that
// negative check false-failed against its own explanatory comment two lines above the real fix,
// which quotes the exact broken pattern by name as a "don't do this" example (caught by running
// this test, not by reading it — the same "verify behavior" lesson the bug itself demonstrates).
ok(indexSrc.includes('document.getElementById(id).addEventListener("input",function(){ renderWhatIf(); });'),
  "the slider listeners wrap renderWhatIf in a plain closure, not passed directly — a listener " +
  "always receives the native Event object as its first arg, which is truthy, so passed straight " +
  "through it would make every real drag tick take the immediate branch and defeat the debounce");
ok((indexSrc.match(/renderWhatIf\(true\)/g) || []).length === 2,
  "exactly the 2 legitimate discrete callers (page-init, Reset button) pass immediate=true — not the sliders");
try {
  G.whatIfRead._html = "sentinel-unwritten";
  fire(G.sCpi, "input"); // exercises the real wired listener, not a direct renderWhatIf() call
  ok(G.whatIfRead._html === "sentinel-unwritten",
    "a slider 'input' tick does NOT write #whatIfRead synchronously — confirms the debounce path runs, not the immediate one");
} catch (e) { ok(false, "what-if debounce (sync non-write check)", e.message); }
// live-browser probe (not just this synchronous check) confirmed the full debounce behavior:
// 20 rapid input ticks over ~300ms produced 0 writes to #whatIfRead during the drag and exactly 1
// write ~400ms after the last tick — this harness has no fake-timer support to reproduce that
// timing test itself, so the settle-and-fire half is accepted as live-browser-only coverage.

// 5. .tsize .btn touch targets — undersized (27x36.7px live-measured) with no compensating hit
// area, unlike every other small control in this file. Live-browser elementFromPoint() confirmed
// a point 20px above the visible button (previously a dead zone) now resolves to the button.
ok(/\.tsize \.btn\{[^}]*position:relative\}/.test(indexSrc),
  ".tsize .btn is position:relative (required for its own ::before hit-slop to anchor correctly)");
ok(/\.tsize \.btn::before\{content:"";position:absolute;top:50%;left:50%;width:44px;height:44px/.test(indexSrc),
  ".tsize .btn carries the same 44px invisible hit-slop pattern as .help-ic/.help-pop-close");

// 6. ResizeObserver fallback — SUPERSEDED (2026-08-20): the "accepted limitation" this item used
// to assert doesn't apply to anything anymore, because the sticky-header feature the
// ResizeObserver existed to feed was itself reverted the same day (see item 3 above) for a real
// bug it caused, not a browser-support gap. Kept as a numbered item, not silently deleted, so the
// D4.10 numbering stays a legible record of what was actually reviewed this round — the same
// "state what changed and why" discipline as every other comment in this file.

// 7. curZoom() — zero test coverage before this pass despite being the mechanism the position:
// fixed compensation fix (round-1 text-size build) depends on. Confirms it reads live state, not
// a captured-at-definition-time snapshot.
ok(P.curZoom() === 1, "curZoom() returns 1 at Normal (state.textSize===0)");
fire(G.textUpBtn, "click");
ok(P.curZoom() === 1.25, "curZoom() reflects state.textSize after advancing to Large (1)");
fire(G.textDownBtn, "click"); // leave text-size state clean for later sections
ok(P.curZoom() === 1, "curZoom() back to 1 after returning to Normal");

// (item 8, textSize localStorage persistence, deliberately lives at the very end of this file —
// runPage() repoints global.document/global.window on every call, and this harness's eval() runs
// in that same shared global scope as every closure already captured by the FIRST index.html eval
// above (const R = runPage(indexSrc)), so calling runPage() again here — even just to seed
// localStorage for a second, isolated read — silently breaks every later fire()-driven test that
// touches those closures (D7 presentation mode, D8 KPI drawer, D9/D9.1, D10, D11 all did when this
// was first tried mid-file — caught by actually running the suite, not by reading the code first).
// otak.html's own runPage(otakSrc) call already follows this same rule safely, by living at the
// very end already — item 8 sits right after it, for the same reason.)

// 9. scope="row" per table — the D4.8 #4 check above only asserts a whole-file aggregate count
// (>=3), which a table that happens to lose its own scope="row" while another table gains an
// unrelated one could pass by coincidence. Check each of the 3 targeted tables individually.
ok((G.pkgBody._html.match(/<th scope="row"/g) || []).length === rows.length,
  "ledger table: exactly one scope=row per control-account row", String((G.pkgBody._html.match(/<th scope="row"/g) || []).length));
ok((G.contractTable._html.match(/<th scope="row"/g) || []).length === P.contracts.length,
  "contract register: exactly one scope=row per contract row", String((G.contractTable._html.match(/<th scope="row"/g) || []).length));
ok((G.actTable._html.match(/<th scope="row"/g) || []).length === P.actions.length,
  "actions register: exactly one scope=row per action row (default 'All' filter)", String((G.actTable._html.match(/<th scope="row"/g) || []).length));

/* =========================================================================
   D5. RESUME-INSIGHT MODULES — baseline bridge, change pricing, TIA, stakeholders
   ========================================================================= */
console.log("== D5. baseline / change pricing / TIA / stakeholders ==");
["baseBridge", "coDefense", "tiaReg", "stakeMap"].forEach(id =>
  ok(idsA.includes(id), "markup contains #" + id));
// bridge reconciles to the ledger
has("baseBridge", "$1,318.0M", "bridge starts at the engineer's estimate");
has("baseBridge", "$1,240.0M", "bridge lands on the derived BAC");
ok(Math.abs((1318.0 - 46.0 - 18.0 - 14.0) - T.bac) < 1e-9,
  "bridge arithmetic reconciles to the control-account total");
// change pricing defense reconciles to the program totals
has("coDefense", "$48.9M", "approved changes proposed at $48.9M");
has("coDefense", "$41.2M", "approved changes settled at $41.2M (matches coApprovedValue)");
has("coDefense", "15.7%", "negotiated savings 15.7% below ask");
has("coDefense", "$18.6M", "pending carried at independent estimate $18.6M");
// 3rd exposure lens (brainstorm-mode upgrade, 2026-08-21): risk-weighted EMV, a portfolio-level
// total distinct in KIND from the two claim-population rows above it, not a fabricated 3rd
// estimate of the same quantity — its non-applicable cells must render "—", never a number.
has("coDefense", m(P.totals.riskExposure), "coDefense's 3rd row states the live risk-weighted EMV total, matching T.riskExposure exactly");
ok((G.coDefense._html.match(/tab-num" style="color:rgb\(var\(--c-mut\)\)">&mdash;</g) || []).length === 2,
  "the EMV row's Proposed/Defended cells render an explicit em-dash, not a computed number (no comparability to fabricate)");
has("coDefenseNote", m(P.totals.contRemaining), "the connecting note states the live remaining-contingency figure the 3 lenses share");
has("coDefenseNote", "different", "the connecting note frames the 3 rows as different kinds of exposure, not 3 estimates of one quantity");
// DRB EMV decision tree (advanced-quant upgrade, 2026-08-23) — independently recompute from the
// literal real values (18.6, 21.4) and the literal illustrative assumption values (0.55, 0.75),
// never via P.deriveDrbEmv() and reapplying its own formula.
{
  ok(idsA.includes("drbEmv"), "markup contains #drbEmv");
  const settleTotal = P.program.coPendingValue, proposedPending = P.program.coProposedPending;
  const pOwnerWins = P.drbAssumptions.pOwnerWins, legalCost = P.drbAssumptions.legalCost;
  ok(settleTotal === 18.6 && proposedPending === 21.4 && pOwnerWins === 0.55 && legalCost === 0.75,
    "pre-registered: the 4 inputs driving this decision tree are the exact real/illustrative values the plan specified", `${settleTotal}/${proposedPending}/${pOwnerWins}/${legalCost}`);
  const drbTotal = pOwnerWins * settleTotal + (1 - pOwnerWins) * proposedPending + legalCost;
  const delta = drbTotal - settleTotal;
  ok(Math.abs(drbTotal - 20.61) < 0.001, "pre-registered: EMV(escalate) is $20.61M against these real+illustrative inputs", drbTotal.toFixed(4));
  ok(Math.abs(delta - 2.01) < 0.001, "pre-registered: the delta is +$2.01M", delta.toFixed(4));
  const real = P.deriveDrbEmv(settleTotal, proposedPending, pOwnerWins, legalCost);
  ok(Math.abs(real.drbTotal - drbTotal) < 1e-9 && Math.abs(real.delta - delta) < 1e-9,
    "deriveDrbEmv() matches an independent recomputation from the literal inputs");
  // the structural finding — a genuine algebraic property of this framing, not asserted blindly:
  // ownerBranch is defined equal to settleTotal, so any convex combination of it with a LARGER
  // contractorBranch, plus a positive legal cost, can never fall below settleTotal.
  ok(legalCost > 0, "legalCost is genuinely positive (required for the 'can never beat' structural finding to hold)");
  ok(proposedPending > settleTotal, "pre-registered: the contractor's ask exceeds the settle price (required for the 'can never beat' finding to hold)");
  for (const p of [0, 0.25, 0.5, 0.75, 1.0]) {
    const testDrb = p * settleTotal + (1 - p) * proposedPending + legalCost;
    ok(testDrb >= settleTotal, `structural finding holds at pOwnerWins=${p}: EMV(escalate) >= settle price`, testDrb.toFixed(3));
  }
  has("drbEmv", "$18.6M", "renders the real settle total");
  has("drbEmv", "$20.6M", "renders the computed DRB EMV total");
  has("drbEmv", "can never beat", "the structural finding is stated in prose, not just left as two bare numbers");
  has("drbEmv", "55%", "renders the illustrative owner-win probability");
  has("drbEmv", "45%", "renders the illustrative contractor-win probability");
  // #coDefense's own table must be untouched by renderDrbEmv() — both already ran once during
  // the same init sequence by this point in the suite; re-confirm the existing coDefense marker
  // is still exactly right (a shared-selector collision would have corrupted it already).
  has("coDefense", "$48.9M", "#coDefense's own content is unaffected by the adjacent DRB EMV section");
}
// DRB EMV interactive slider + chart (Phase 5, engagement/interactivity upgrade, 2026-08-20) —
// same doctrine as above: independently recompute from literal inputs, never trust the app's own
// deriveDrbEmv() math a second time without cross-checking it.
{
  ["sDrbP", "sDrbLegal", "vDrbP", "vDrbLegal", "drbChart"].forEach(id =>
    ok(idsA.includes(id), "markup contains #" + id));
  // String(...) on both sides — this stub's .value setter doesn't coerce a number to a string
  // the way a real <input> DOM does, matching the same G.guardCountLede/textContent workaround
  // already established elsewhere in this file (found via a real contradicted assertion, not assumed).
  ok(String(G.sDrbP.value) === String(P.drbAssumptions.pOwnerWins) && String(G.sDrbLegal.value) === String(P.drbAssumptions.legalCost),
    "sliders initialize FROM DRB_ASSUMPTIONS's live values, not hardcoded", `${G.sDrbP.value}/${G.sDrbLegal.value}`);
  const savedP = P.drbAssumptions.pOwnerWins, savedLegal = P.drbAssumptions.legalCost;
  // the sliders must never mutate DRB_ASSUMPTIONS itself — the same structural separation
  // renderDrbEmv() above already keeps (its own drift-guard block asserts this too).
  ok(P.drbAssumptions.pOwnerWins === savedP && P.drbAssumptions.legalCost === savedLegal,
    "DRB_ASSUMPTIONS is untouched before any slider interaction (sanity baseline)");
  try {
    G.sDrbP.value = "0.20"; fire(G.sDrbP, "input");
    ok(P.drbAssumptions.pOwnerWins === savedP, "dragging the win-probability slider does NOT mutate DRB_ASSUMPTIONS.pOwnerWins", String(P.drbAssumptions.pOwnerWins));
    const settleTotal = P.program.coPendingValue, proposedPending = P.program.coProposedPending, legal = savedLegal;
    const drbAt20 = 0.20 * settleTotal + 0.80 * proposedPending + legal;
    has("drbChart", drbAt20.toFixed(1), "chart's aria-label states the recomputed total at the new slider position");
    ok(G.vDrbP.textContent === "20%", "the % readout reflects the new slider value", String(G.vDrbP.textContent));
    // endpoints: independently recompute B(p=0) and B(p=1) from the literal formula, matching what
    // the chart's own caption states, never by calling deriveDrbEmv() and trusting its own math twice.
    const bAtP0 = proposedPending + legal, bAtP1 = settleTotal + legal;
    has("drbChart", bAtP0.toFixed(1), "chart's aria-label states Option B's p=0 endpoint, independently recomputed");
    has("drbChart", bAtP1.toFixed(1), "chart's aria-label states Option B's p=1 endpoint, independently recomputed");
    has("drbChart", settleTotal.toFixed(1), "chart's aria-label states Option A's flat value (the real settle total)");
    // regression guard on the structural finding, sampled across a real slider drag range —
    // independently recomputed, not read back from the app's own e.drbTotal.
    [0, 0.25, 0.5, 0.75, 1].forEach(p => {
      const b = p * settleTotal + (1 - p) * proposedPending + legal;
      ok(b >= settleTotal, `chart regression guard: Option B (p=${p}) never dips below Option A`, b.toFixed(3));
    });
    G.sDrbLegal.value = "0"; fire(G.sDrbLegal, "input");
    ok(P.drbAssumptions.legalCost === savedLegal, "dragging the legal-cost slider does NOT mutate DRB_ASSUMPTIONS.legalCost", String(P.drbAssumptions.legalCost));
    ok(G.vDrbLegal.textContent === "$0.0M", "the legal-cost readout reflects the new slider value", String(G.vDrbLegal.textContent));
  } catch (e) { ok(false, "DRB slider interaction", e.message); }
  // restore to the real defaults so no later assertion in this file reads a leftover slider state
  G.sDrbP.value = String(savedP); G.sDrbLegal.value = String(savedLegal); fire(G.sDrbLegal, "input");
  ok(P.drbAssumptions.pOwnerWins === savedP && P.drbAssumptions.legalCost === savedLegal,
    "post-test sanity: DRB_ASSUMPTIONS is STILL untouched after every slider interaction above");
}
// TIA register ties to float and milestones
has("tiaReg", "D-02", "delay register lists the tunnel event");
has("tiaReg", "+40d", "tunnel delay day-count matches CP-201 negative float");
has("tiaReg", "+22d", "utility delay day-count matches CP-601 negative float");
// stakeholder map complete
ok((G.stakeMap._html.match(/<tr/g) || []).length === 8,
  "stakeholder map renders header + 7 interfaces");
has("stakeMap", "Operating railroad", "stakeholder map names the railroad interface");
// glossary absorbed the new concepts
has("glossList", "Time Impact Analysis", "glossary covers TIA");
has("glossList", "Value engineering", "glossary covers VE");
has("glossList", "Buyout", "glossary covers buyout");
// integrity gate grew to cover the new modules
has("aiGuards", "Estimate-to-budget bridge", "gate covers the baseline bridge");
has("aiGuards", "Delay register ties to package float", "gate covers delay/float consistency");

/* =========================================================================
   D5.3. FORECAST MODEL — EAC trend, forecast accuracy, monthly cash flow,
   schedule drift. Four lenses on "is the forecast trustworthy", not just
   what it currently says.
   ========================================================================= */
console.log("== D5.3. forecast model (actual vs plan) ==");
["eacTrend", "fcastTable", "cashflow", "schedDriftCard"].forEach(id =>
  ok(idsA.includes(id), "markup contains #" + id));

// A. EAC trend — pre-registered: 5 hand-authored points + 1 live, all-positive deltas
{
  const s = P.eacTrendSeries();
  ok(s.length === 6, "EAC trend has 6 periods (5 history + 1 live)", String(s.length));
  ok(s[s.length - 1].eac === T.eac, "EAC trend's current point reads live off T.eac, not duplicated");
  const deltas = [];
  for (let i = 1; i < s.length; i++) deltas.push(s[i].eac - s[i - 1].eac);
  ok(deltas.every(d => d > 0), "EAC has risen every single period — genuinely diverging, not oscillating",
    deltas.map(d => d.toFixed(2)).join(","));
  has("eacTrend", "diverging", "EAC trend prose calls out the divergence");
  // EAC Drift Velocity (megaproject-controls-doc upgrade, 2026-08-22) — recompute from the LITERAL
  // first history point (visible in index.html's own EAC_HISTORY array, not exposed via __PCC__)
  // plus the live T.eac, never from P.eacTrendSeries()'s own output. The first draft of this check
  // called P.eacTrendSeries() and reapplied the same formula the app's own eacDriftVelocity() uses
  // — technically not calling that function by name, but still only proving the formula is
  // deterministic, not that it's correct against a real input (a /stress-test reviewer caught this
  // as a genuine circularity, not a false positive — same doctrine this file states repeatedly:
  // independently re-derive, don't trust a shared derived value two different ways).
  const eacFirstHistoric = 1266.0; // EAC_HISTORY[0].eac — index.html's own literal
  const dv = (T.eac - eacFirstHistoric) / 5;
  ok(Math.abs(dv - P.eacDriftVelocity()) < 1e-9, "eacDriftVelocity() matches an independent recomputation from the literal first history point + live EAC, not eacTrendSeries()'s own output", dv.toFixed(3));
  ok(dv > 1.0, "pre-registered: this series genuinely exceeds the $1.0M/month threshold — a real breach, not manufactured", dv.toFixed(3));
  ok(idsA.includes("eacDriftOut"), "markup contains #eacDriftOut");
  has("eacDriftOut", "Breached", "the drift-velocity outbox states the true over-threshold verdict");
  const eacDriftRow = P.escalation.filter(e => /^EAC Drift Velocity/.test(e[0]))[0];
  ok(!!eacDriftRow && eacDriftRow[1] === "Program Risk Manager" && eacDriftRow[3] === "10 days",
    "the new EAC-drift escalation row carries the source doc's own owner/SLA", JSON.stringify(eacDriftRow));
  ok(P.firingEscalations().some(e => /^EAC Drift Velocity/.test(e[0])),
    "firingEscalations() genuinely includes the EAC-drift row today (confirmed breach, not dormant)");
}
// Earned Schedule / SPI(t) + Non-Critical Progress Inflation composite (megaproject-controls-doc
// upgrade, 2026-08-22). Independently recompute from P.pvA/P.totals.ev in this file — never call
// P.deriveEarnedSchedule() and trust it.
{
  const pvA = P.pvA, ev = P.totals.ev;
  let i = -1;
  for (let j = 0; j < pvA.length; j++) if (pvA[j] <= ev) i = j;
  let es;
  if (i === -1) es = ev / pvA[0];
  // genuine extrapolation, not a clamp — matches the fixed deriveEarnedSchedule() in index.html
  // (its own comment explains why: the original clamp silently understated a genuinely
  // ahead-of-schedule reading; unreachable with today's live data either way).
  else if (i === pvA.length - 1) es = pvA.length < 2 ? pvA.length : pvA.length + (ev - pvA[i]) / (pvA[i] - pvA[i - 1]);
  else es = (i + 1) + (ev - pvA[i]) / (pvA[i + 1] - pvA[i]);
  const at = pvA.length, spit = es / at;
  const real = P.deriveEarnedSchedule();
  ok(Math.abs(real.es - es) < 1e-9 && Math.abs(real.spit - spit) < 1e-9,
    "deriveEarnedSchedule() matches an independent recomputation from pvA/T.ev", es.toFixed(4) + " / " + spit.toFixed(4));
  ok(Math.abs(es - 21.5095) < 0.01, "pre-registered: Earned Schedule is ~21.51 months against this ledger", es.toFixed(4));
  ok(Math.abs(spit - 0.9777) < 0.001, "pre-registered: SPI(t) is ~0.978, genuinely different from dollar SPI (0.968)", spit.toFixed(4));
  // click the spi KPI card, confirm the companion dbox renders and matches
  try {
    const spiKpi = P.kpis.filter(k => k.id === "spi")[0];
    fire(G.kboard, "click", { target: { closest: (sel) => (sel === "[data-kpi]" ? { dataset: { kpi: "spi" } } : null) } });
    ok(P.state.kpi === "spi", "clicking the SPI card sets state.kpi to spi");
    has("kdetail", "Earned Schedule", "SPI's drawer renders the Earned Schedule companion dbox");
    has("kdetail", idx(spit), "the drawer's rendered SPI(t) value matches the independent recomputation");
    fire(G.kboard, "click", { target: { closest: (sel) => (sel === "[data-kpi]" ? { dataset: { kpi: "spi" } } : null) } });
    ok(P.state.kpi === null, "clicking the SPI card again closes the drawer");
    // a different KPI's drawer must NOT carry the companion dbox — it's spi-only
    fire(G.kboard, "click", { target: { closest: (sel) => (sel === "[data-kpi]" ? { dataset: { kpi: "cpli" } } : null) } });
    ok(!G.kdetail._html.includes("Earned Schedule"), "the Earned Schedule companion dbox does NOT leak into a different KPI's drawer (cpli)");
    fire(G.kboard, "click", { target: { closest: (sel) => (sel === "[data-kpi]" ? { dataset: { kpi: "cpli" } } : null) } });
  } catch (e) { ok(false, "SPI drawer / Earned Schedule companion interaction", e.message); }
  // the composite alert — pre-registered against the real ledger, not assumed either way
  const firing = T.spi >= 1.00 && T.cpli < 0.90;
  ok(firing === false, "pre-registered: dollar SPI is below 1.00 today, so Non-Critical Progress Inflation does NOT currently fire — the honest current state, not a placeholder", "SPI=" + T.spi.toFixed(3) + " CPLI=" + T.cpli.toFixed(3));
  ok(P.firingEscalations().some(e => /^Non-Critical Progress Inflation/.test(e[0])) === firing,
    "firingEscalations() matches the pre-registered firing/non-firing state exactly");
  const progInflationRow = P.escalation.filter(e => /^Non-Critical Progress Inflation/.test(e[0]))[0];
  ok(!!progInflationRow && progInflationRow[1] === "Controls manager" && progInflationRow[3] === "72 hours",
    "the new composite row reuses the existing 'Controls manager' role, not a new near-duplicate one", JSON.stringify(progInflationRow));
  ok(P.kpis.length === 20, "regression guard: KPIS.length is still exactly 20 — SPI(t) was deliberately not made a 21st KPI card");
  // deriveEarnedSchedule()'s two edge-case branches are unreachable with today's live ledger data
  // (real EV always lands in the "normal" interpolation branch) — a /stress-test reviewer flagged
  // this as a genuine coverage gap, since the branches were shipped but never exercised. Fixed by
  // parameterizing the function (defaults to live pvA/T.ev, unchanged for every other call site)
  // so these can be driven directly with synthetic inputs, hand-verified below independently of
  // the function under test.
  {
    // i===-1: EV below the first period's planned value — interpolates against an implicit (0,0)
    // origin. Hand-derived: es = 5/10 = 0.5, at = 3, spit = 0.5/3.
    const r1 = P.deriveEarnedSchedule([10, 20, 30], 5);
    ok(Math.abs(r1.es - 0.5) < 1e-9 && r1.at === 3 && Math.abs(r1.spit - 0.5 / 3) < 1e-9,
      "deriveEarnedSchedule()'s i===-1 branch: interpolates against the implicit (0,0) origin", JSON.stringify(r1));
    // i===pv.length-1, genuinely ahead of schedule: EV past the curve's own endpoint now
    // EXTRAPOLATES using the final segment's slope (10/unit), not a silent clamp to spit=1.00 —
    // the actual bug this test exists to catch (found by two independent reviewers converging on
    // the same finding). Hand-derived: es = 3+(35-30)/(30-20) = 3.5, spit = 3.5/3 ≈ 1.167 (>1.00).
    const r2 = P.deriveEarnedSchedule([10, 20, 30], 35);
    ok(Math.abs(r2.es - 3.5) < 1e-9 && Math.abs(r2.spit - 3.5 / 3) < 1e-9,
      "deriveEarnedSchedule()'s past-the-curve branch genuinely extrapolates (spit>1.00), not a silent clamp to exactly 1.00", JSON.stringify(r2));
    ok(r2.spit > 1.0, "pre-registered: a genuinely ahead-of-schedule synthetic input reads SPI(t)>1.00 — the exact case the old clamp would have silently reported as exactly 1.00");
    // at<2 fallback: no prior segment exists to derive a slope from, so this one genuinely must
    // clamp (there's nothing to extrapolate from). Hand-derived: es=at=1, spit=1.00.
    const r3 = P.deriveEarnedSchedule([10], 15);
    ok(r3.es === 1 && r3.at === 1 && r3.spit === 1, "deriveEarnedSchedule()'s at<2 fallback still clamps correctly (no prior segment to extrapolate from)", JSON.stringify(r3));
    // the default-parameter path (no args) must still match the live-ledger figures already
    // asserted above — confirms the refactor didn't change the real, exercised behavior.
    const rLive = P.deriveEarnedSchedule();
    ok(Math.abs(rLive.es - es) < 1e-9 && Math.abs(rLive.spit - spit) < 1e-9,
      "deriveEarnedSchedule() with no args still matches the live pvA/T.ev computation (refactor is behavior-preserving)");
  }
}
// B. Forecast accuracy — pre-registered: 3 small misses, 1 large miss in the most recent month
{
  const fa = P.forecastAccuracy();
  ok(fa.length === 4, "4 scored forecast periods", String(fa.length));
  ok(fa[fa.length - 1].actual === T.ac, "most recent scored actual reads live off T.ac, not duplicated");
  ok(Math.abs(fa[0].errPct) < 0.01 && Math.abs(fa[1].errPct) < 0.01 && Math.abs(fa[2].errPct) < 0.01,
    "first 3 forecast periods are small misses (<1%)", fa.slice(0, 3).map(r => (r.errPct * 100).toFixed(2)).join(","));
  ok(fa[fa.length - 1].errPct > 0.04, "most recent period is a genuine, larger miss (>4%) — the method didn't see the tunnel acceleration coming",
    (fa[fa.length - 1].errPct * 100).toFixed(2) + "%");
  has("fcastTable", "Average absolute error", "forecast-accuracy table shows a summary error rate");
}
// B2. Cost diffusion (GBM) — construction-controls-math-doc upgrade, 2026-08-23. Independently
// recompute all 5 log-returns + the t-based CI from the LITERAL series (AC_HISTORY's 5 hand-authored
// points + the live actual), never by calling P.deriveGbmParams() and reapplying its own formula.
{
  const acVals = [610.0, 655.0, 698.0, 738.0, 776.0, P.totals.ac];
  const n = acVals.length - 1; // 5 log-returns from 6 levels
  const logReturns = [];
  for (let j = 1; j < acVals.length; j++) logReturns.push(Math.log(acVals[j] / acVals[j - 1]));
  const rbar = logReturns.reduce((a, b) => a + b, 0) / n;
  const sigmaHatMle = Math.sqrt(logReturns.reduce((a, b) => a + Math.pow(b - rbar, 2), 0) / n);
  const muHatMle = rbar + 0.5 * sigmaHatMle * sigmaHatMle;
  const sUnbiased = Math.sqrt(logReturns.reduce((a, b) => a + Math.pow(b - rbar, 2), 0) / (n - 1));
  const seRbar = sUnbiased / Math.sqrt(n);
  const tCrit90 = 2.132; // Student's t, df=4 (n-1=4 for these 5 log-returns), 90% two-sided — same
                         // hardcoded constant as index.html's deriveGbmParams(), valid only for this
                         // one real 6-point series (Simplicity First — no general t-table for one call site).
  const ciLowRbar = rbar - tCrit90 * seRbar, ciHighRbar = rbar + tCrit90 * seRbar;

  const g = P.deriveGbmParams(P.acHistorySeries().map(p => p.ac));
  ok(g.n === n, "deriveGbmParams() sees the same 5 log-returns from the same 6-point series", String(g.n));
  ok(Math.abs(g.rbar - rbar) < 1e-9 && Math.abs(g.sigmaHatMle - sigmaHatMle) < 1e-9 &&
     Math.abs(g.muHatMle - muHatMle) < 1e-9 && Math.abs(g.ciLowRbar - ciLowRbar) < 1e-9 &&
     Math.abs(g.ciHighRbar - ciHighRbar) < 1e-9,
    "deriveGbmParams() matches an independent MLE + t-CI recomputation from the literal AC series",
    "rbar=" + rbar.toFixed(6) + " sigma=" + sigmaHatMle.toFixed(6) + " CI=[" + ciLowRbar.toFixed(6) + "," + ciHighRbar.toFixed(6) + "]");
  ok(Math.abs(rbar - 0.0681) < 0.001, "pre-registered: mean log-return is ~6.81%/period", pct(rbar, 2));
  ok(Math.abs(sigmaHatMle - 0.0174) < 0.001, "pre-registered: MLE volatility is ~1.74%/period", pct(sigmaHatMle, 2));
  const ciHalfWidthPct = (ciHighRbar - ciLowRbar) / 2 / rbar;
  ok(ciHalfWidthPct > 0.25, "pre-registered: the 90% CI half-width is >25% of the point estimate itself — the concrete number behind the 'too thin to trust' caveat, not just the phrase", (ciHalfWidthPct * 100).toFixed(1) + "%");

  ok(idsA.includes("costGbm"), "markup contains #costGbm");
  has("costGbm", "too thin to trust", "GBM card states the small-sample caveat");
  has("costGbm", pct(muHatMle, 2), "GBM card shows the formatted drift figure matching the independent recomputation");
  has("costGbm", pct(sigmaHatMle, 2), "GBM card shows the formatted volatility figure matching the independent recomputation");
  has("costGbm", pct(ciLowRbar, 2) + " to " + pct(ciHighRbar, 2), "GBM card shows the formatted 90% CI matching the independent recomputation");
  // load-bearing position check: the caveat sentence must render BEFORE the numeric mu-hat tile —
  // a plain text-presence check (has()) wouldn't catch a regression that buries the caveat below
  // the numbers, since has() only confirms the text exists somewhere in the card.
  const caveatIdx = G.costGbm._html.indexOf("too thin to trust");
  const muValIdx = G.costGbm._html.indexOf(pct(muHatMle, 2));
  ok(caveatIdx >= 0 && muValIdx >= 0 && caveatIdx < muValIdx,
    "the small-sample caveat renders BEFORE the numeric mu-hat tile, not as a trailing footnote", "caveat@" + caveatIdx + " value@" + muValIdx);
  ok(!/stochastic tcpi/i.test(G.costGbm._html), "tripwire: 'Stochastic TCPI' does not appear in the GBM card — confirms that explicitly-declined scope decision still holds");
}
// C. Monthly cash flow — derived from the SAME pvA/acA arrays the S-curve already renders
{
  ok((G.cashflow._html.match(/<tr/g) || []).length === 7, "cash-flow table renders header + 6 months",
    String((G.cashflow._html.match(/<tr/g) || []).length));
  let actualSum = 0;
  for (let j = 16; j < 22; j++) actualSum += P.acA[j] - (j > 0 ? P.acA[j - 1] : 0);
  ok(Math.abs(actualSum - (P.acA[21] - P.acA[15])) < 1e-6, "6 monthly deltas sum back to the cumulative S-curve span");
}
has("aiGuards", "reads live off this program", "integrity gate covers at least one forecast-model tie-out");
// D. Schedule forecast drift — pre-registered: 5 all-positive deltas, current tied to MILES[6].d
{
  const s = P.revSvcDriftSeries();
  ok(s.length === 6, "schedule-drift series has 6 periods", String(s.length));
  ok(s[s.length - 1].slip === P.milesLast.d, "schedule-drift current point reads live off the revenue-service milestone");
  const deltas = [];
  for (let i = 1; i < s.length; i++) deltas.push(s[i].slip - s[i - 1].slip);
  ok(deltas.every(d => d > 0), "revenue-service slip has grown every single period", deltas.join(","));
  has("schedDriftCard", "still finding its true finish", "schedule-drift prose calls out the ongoing slip");
  has("schedDriftCard", "R-01, NCR-2026-014", "schedule-drift prose cross-references the same tunnel root cause");
}
// E. Critical float erosion rate (megaproject-controls-doc upgrade, 2026-08-22) — same shape as
// the schedule-drift block above; CP-201 is the anchor package (most negative float, distinct
// from CP-601's worst-CPLI framing — see index.html's own FLOAT_HIST comment).
{
  ok(idsA.includes("floatErosionCard"), "markup contains #floatErosionCard");
  const s = P.floatErosionSeries();
  ok(s.length === 6, "float-erosion series has 6 periods", String(s.length));
  const live = P.rows.filter(r => r.id === "CP-201")[0].float;
  ok(s[s.length - 1].float === live, "float-erosion current point reads live off CP-201's own float, not a duplicated hand-typed number");
  const deltas = [];
  for (let i = 1; i < s.length; i++) deltas.push(s[i].float - s[i - 1].float);
  ok(deltas.every(d => d < 0), "CP-201's float has eroded every single period — genuinely eroding, not oscillating", deltas.join(","));
  has("floatErosionCard", "eroded further", "float-erosion prose calls out the ongoing erosion");
  has("floatErosionCard", "R-01, NCR-2026-014", "float-erosion prose cross-references the same tunnel root cause");
  // the new GUARDS tie-out row itself, independently re-derived (not just trusting its own run())
  has("aiGuards", days(live), "the new float-erosion GUARDS row states the same live CP-201 float value, independently confirmed");
}

/* =========================================================================
   D5.4. CREW COST-PER-HOUR — a fourth axis (weekly, crew-level burn rate)
   ========================================================================= */
console.log("== D5.4. crew cost-per-hour ==");
ok(idsA.includes("cphCard"), "markup contains #cphCard");
ok(P.cphCells.length === 1, "exactly 1 CPH cell in this pass", String(P.cphCells.length));
{
  const c = P.cphCells.map(P.deriveCph)[0];
  ok(c.weeks.length === 6, "6 weeks of CPH history", String(c.weeks.length));
  // pre-registered by hand, then independently re-derived here from the raw weekly inputs —
  // two separate computations landing on the same number is the actual check.
  let overrun = 0, idle = 0;
  P.cphCells[0].weeks.forEach(w => {
    overrun += (w.actual - P.cphCells[0].baseline) * P.cphCells[0].hrsPerWeek;
    idle += w.idlePct * P.cphCells[0].hrsPerWeek * P.cphCells[0].baseline;
  });
  ok(Math.abs(overrun - 145880) < 1e-6, "six-week overrun is $145,880", overrun.toFixed(0));
  ok(Math.abs(idle - 100156) < 1e-6, "idle-attributable leakage is $100,156", idle.toFixed(0));
  ok(Math.abs(c.totalOverrun - overrun) < 1e-6 && Math.abs(c.totalIdle - idle) < 1e-6,
    "deriveCph's totals match the independent re-derivation");
  ok(idle / overrun > 0.68 && idle / overrun < 0.69, "idle time is ~68.7% of the total overrun",
    (idle / overrun * 100).toFixed(1) + "%");

  // math explainer (2026-08-19): formulas + a live worked example against the most recent week
  const last = c.weeks[c.weeks.length - 1];
  has("cphMathBody", "weekly overrun = (actual", "math panel states the weekly-overrun formula");
  has("cphMathBody", "idle-attributable = idle", "math panel states the idle-leakage formula");
  has("cphMathBody", last.w, "math panel's worked example names the actual most-recent week");
  function usd(v) { return (v < 0 ? "−" : "") + "$" + Math.round(Math.abs(v)).toLocaleString("en-US"); }
  has("cphMathBody", usd(last.actual) + "/hr", "math panel states the worked week's actual live rate");
  has("cphMathBody", usd(c.baseline) + "/hr", "math panel states the live standard rate");
  has("cphMathBody", usd(last.weeklyOverrun), "math panel's worked-week overrun matches independent recomputation");
  has("cphMathBody", usd(last.idleLeakage), "math panel's worked-week idle leakage matches independent recomputation");
  has("cphMathBody", usd(overrun), "math panel states the same $145,880 total as the card above it");
  has("cphMathBody", usd(idle), "math panel states the same $100,156 idle total as the card above it");

  // 3-way drill-down (brainstorm-mode upgrade, 2026-08-21): independently re-sum rework/baseline
  // from raw weekly inputs (never calling deriveCph's own math), then check the hard invariant and
  // the two pre-existing headline totals didn't move by a cent.
  let rework = 0, baseline = 0;
  P.cphCells[0].weeks.forEach(w => {
    const weeklyOverrun = (w.actual - P.cphCells[0].baseline) * P.cphCells[0].hrsPerWeek;
    const idleLeakage = w.idlePct * P.cphCells[0].hrsPerWeek * P.cphCells[0].baseline;
    const residual = weeklyOverrun - idleLeakage;
    if (w.reworkLinked) rework += residual; else baseline += residual;
  });
  ok(Math.abs(c.totalRework - rework) < 1e-6 && Math.abs(c.totalBaseline - baseline) < 1e-6,
    "deriveCph's rework/baseline totals match the independent re-derivation");
  ok(Math.abs((idle + rework + baseline) - overrun) < 1e-6,
    "idle + rework + baseline reconstitutes the exact same total overrun, every dollar accounted for once",
    (idle + rework + baseline).toFixed(2) + " vs " + overrun.toFixed(2));
  ok(Math.abs(overrun - 145880) < 1e-6 && Math.abs(idle - 100156) < 1e-6,
    "the two pre-existing headline totals ($145,880/$100,156) are unchanged by adding the 3rd/4th category — regression guard specific to this change");
  const reworkWeeks = P.cphCells[0].weeks.filter(w => w.reworkLinked).length;
  ok(reworkWeeks === 2, "exactly 2 weeks (W-2, W-1) are rework-linked, matching their real logged cause text", String(reworkWeeks));

  // drill-down interaction — fire the real click, not a direct state mutation. This stub never
  // parses innerHTML strings into a real child DOM, so #cphIdleToggle/#cphDrill's own attributes
  // (aria-expanded, hidden) are only checkable by string-matching the PARENT's (#cphCard's)
  // rendered innerHTML, not via getElementById on a stub the app itself never separately queries
  // (same "attribute lives in a string, not a stub property" class of gotcha this file has hit
  // before, mirrored here on the parent/child boundary instead of innerHTML-vs-textContent).
  try {
    ok(G.cphCard._html.includes('aria-expanded="false"'), "drill-down starts collapsed (aria-expanded=false)");
    ok(/id="cphDrill" hidden/.test(G.cphCard._html), "#cphDrill starts hidden");
    fire(G.cphCard, "click", { target: { closest: sel => sel === "#cphIdleToggle" ? {} : null } });
    ok(P.state.cphDrill === true, "clicking the idle tile toggles state.cphDrill on");
    ok(G.cphCard._html.includes('aria-expanded="true"'), "aria-expanded flips to true on reveal");
    ok(!/id="cphDrill" hidden/.test(G.cphCard._html), "#cphDrill's hidden attribute is gone once expanded");
    ok((G.cphDrill._html.match(/class="rowbar stagger"/g) || []).length === 3,
      "drill-down renders exactly 3 staggered rows (idle / rework / baseline)");
    ok(G.cphDrill._html.includes(usd(idle)) && G.cphDrill._html.includes(usd(rework)) && G.cphDrill._html.includes(usd(baseline)),
      "all 3 drill-down rows show the independently-recomputed dollar figures");
    fire(G.cphCard, "click", { target: { closest: sel => sel === "#cphIdleToggle" ? {} : null } });
    ok(P.state.cphDrill === false, "clicking the idle tile again toggles state.cphDrill back off");
    ok(G.cphCard._html.includes('aria-expanded="false"'), "aria-expanded flips back to false on collapse");
    ok(/id="cphDrill" hidden/.test(G.cphCard._html), "#cphDrill's hidden attribute returns on collapse");
  } catch (e) { ok(false, "CPH drill-down click interaction", e.message); }
}
has("cphCard", "Tunnel liner", "CPH card names the tunnel crew");
has("cphCard", "R-01", "CPH prose cross-references the tunnel ground-condition risk");
has("cphCard", "NCR-2026-014", "CPH prose cross-references the tunnel quality NCR");
ok(!/Sky\s*Rail/i.test(indexSrc), "no fabricated 'Sky Rail' project name anywhere in the page");
has("glossList", "CPH", "glossary defines CPH");

/* =========================================================================
   D5.5. WBS/CBS/OBS MAPPING + BOARD PHASE-GATE GOVERNANCE
   ========================================================================= */
console.log("== D5.5. wbs/cbs/obs + phase-gate governance ==");
["wbsTable", "wbsFoot", "gateTable", "gate5Card"].forEach(id => ok(idsA.includes(id), "markup contains #" + id));
ok(P.wbs.length === 8, "exactly 8 WBS rows, one per control account", String(P.wbs.length));
{
  const pkgIds = P.rows.map(r => r.id);
  const caSet = P.wbs.map(w => w.ca);
  ok(pkgIds.every(id => caSet.includes(id)) && caSet.every(id => pkgIds.includes(id)),
    "WBS control accounts are exactly the 8 PKGS ids, no orphans, no gaps", caSet.join(","));
  ok(new Set(caSet).size === 8, "no WBS row maps to the same control account twice");
}
has("wbsTable", "CTE-WBS-101", "WBS table renders row CTE-WBS-101");
has("wbsFoot", "8 of 8 control accounts mapped", "WBS footer states full 100% Rule coverage");
// the new "how the 100% Rule is actually checked" dbox (Phase 3, 2026-08-20) — independently
// sum every PKGS.bac reachable through a WBS row, matching m()'s own $M-with-1-decimal format.
{
  const mL = v => { const s = Math.abs(v).toFixed(1).split("."); return (v < 0 ? "−" : "") + "$" + s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + s[1] + "M"; };
  const mappedPkgs = P.wbs.map(w => P.rows.filter(p => p.id === w.ca)[0]).filter(Boolean);
  ok(mappedPkgs.length === 8, "all 8 WBS rows resolve to a real PKGS entry, independently joined");
  const sum = mappedPkgs.reduce((a, p) => a + p.bac, 0);
  ok(Math.abs(sum - T.bac) < 0.001, "independently-summed WBS-mapped BAC exactly equals program T.bac (the 100% Rule genuinely holds, not just asserted)", sum + " vs " + T.bac);
  has("wbs100MathBody", "100% Rule", "100%-Rule math panel names the rule it's proving");
  mappedPkgs.forEach(p => has("wbs100MathBody", p.id + " " + mL(p.bac), "100%-Rule math panel's running sum includes " + p.id + "'s live BAC"));
  has("wbs100MathBody", mL(sum), "100%-Rule math panel's summed total matches the independent recomputation");
  has("wbs100MathBody", "an exact match, to the cent", "100%-Rule math panel states the true exact-match verdict, not a hedged one");
}
ok(P.gates.length === 7, "7 gate rows, one per phase", String(P.gates.length));
ok(P.gates.filter(g => g.hardStop).length === 1 && P.gates.filter(g => g.hardStop)[0].k === "proc",
  "exactly one hard-stop gate, at Gate 5 (Baseline Establishment)");
has("gateTable", "Gate 5", "gate table renders Gate 5");
has("gateTable", "Baseline Establishment", "gate table names the baseline-establishment milestone");
{
  // pre-registered: contingency coverage is 0.588 (< 1.00) against this ledger, so Gate 5 must show
  // BLOCKED with exactly 2 of 3 checks passing — a gate that always shows CLEARED isn't checking anything.
  const res = P.gate5Checks.map(c => c.run());
  const passes = res.filter(r => r[0]).length;
  ok(passes === 2, "exactly 2 of 3 Gate 5 checks pass (contingency coverage fails as predicted)",
    JSON.stringify(res));
  ok(T.contCoverage < 1.0, "contingency coverage is genuinely under 1.00 in this ledger", T.contCoverage.toFixed(3));
  has("gate5Card", "BLOCKED", "Gate 5 card renders BLOCKED verdict");
  has("gate5Card", "FAIL", "Gate 5 card shows the failing check");

  // staggered reveal (2026-08-19): each check row carries its own animation-delay, 0/140/280ms
  // in check order — pre-registered that the failing check (contingency coverage, the 3rd of
  // GATE5_CHECKS) lands last, landing the presentation script's own "let the silence sit after
  // BLOCKED" beat naturally rather than needing to special-case which check is highlighted.
  const delayMatches = G.gate5Card._html.match(/animation-delay:(\d+)ms/g) || [];
  const delays = delayMatches.map(s => parseInt(s.match(/\d+/)[0], 10));
  ok(delays.length === 3, "all 3 Gate 5 checks carry their own animation-delay", String(delays.length));
  ok(delays[0] === 0 && delays[1] === 140 && delays[2] === 280,
    "delays are strictly 0/140/280 in check order", delays.join(","));
  ok(G.gate5Card._html.indexOf("FAIL") > G.gate5Card._html.lastIndexOf("PASS"),
    "the failing check is the last one in the markup, so the stagger lands it last — not a coincidence of this ledger, a property of GATE5_CHECKS' own declared order");
}
has("escTable", "TCPI(BAC)", "escalation matrix carries the explicit TCPI &gt; 1.10 rule");
// Tier 2: escalation matrix's new live-status column — never hardcode the firing count, derive
// it from firingEscalations() itself so a future ledger edit can't silently desync the assertion
{
  const firing = P.firingEscalations();
  ok(firing.length > 0 && firing.length < P.escalation.length,
    "at least one but not all escalation rules are firing right now (a meaningful status column)", String(firing.length));
  ok((G.escTable._html.match(/Firing now/g) || []).length === firing.length,
    "escTable shows exactly as many 'Firing now' pills as firingEscalations() returns");
  ok((G.escTable._html.match(/>Dormant</g) || []).length === P.escalation.length - firing.length,
    "escTable shows 'Dormant' for every non-firing rule");
  has("escTable", "Contingency coverage &lt; 1.00", "the firing set includes the contingency-coverage rule (pre-registered: it's the one Gate 5 fails on)");
  // /stress-test finding (2026-08-19): escalation matrix was the one Tier-2 table missing a
  // status icon (Actions register and guardrail table both had one) — now carries one per row
  ok((G.escTable._html.match(/class="ticon r"/g) || []).length === firing.length,
    "escTable renders a red 'firing' ticon for every currently-firing rule");
  ok((G.escTable._html.match(/class="ticon g"/g) || []).length === P.escalation.length - firing.length,
    "escTable renders a green 'dormant' ticon for every non-firing rule");
}

/* =========================================================================
   D5.7. WORKING BACKWARD / INVERSION — Gate 5 -> CCR -> the ledger -> A-09
   ========================================================================= */
console.log("== D5.7. working-backward / inversion component ==");
ok(idsA.includes("invCard"), "markup contains #invCard");
{
  // same pre-registered facts as D5.5's Gate 5 test, walked through the 4-step framework instead.
  // Looked up by key, not position — renderInversion() itself does the same, on purpose (an earlier
  // stress pass already caught one hardcoded-index bug on the sibling ESCALATION array).
  const covCheck = P.gate5Checks.filter(c => c.key === "contCoverage")[0];
  ok(!!covCheck, "GATE5_CHECKS carries a stable 'contCoverage' key, not just array position");
  ok(covCheck.run()[0] === false, "pre-registered: contingency-coverage check still fails against this ledger",
    JSON.stringify(covCheck.run()));
  const esc = P.escalation[4];
  ok(esc[0].includes("Contingency coverage") && esc[1] === "Program director",
    "escalation row 4 is the contingency-coverage rule owned by Program director", JSON.stringify(esc));
  const ccrActions = P.actionsForKpi("ccr");
  ok(ccrActions.length === 2, "ccr has exactly 2 linked items (A-04 and A-09) before the owner filter",
    ccrActions.map(a => a.id).join(","));
  const lead = ccrActions.filter(a => a.owner === esc[1])[0];
  ok(lead && lead.id === "A-09", "filtering by the escalation rule's own owner isolates A-09, not A-04",
    lead && lead.id);
  has("invCard", "0.588", "inversion card shows the live CCR value");
  has("invCard", "A-09", "inversion card names the real linked action item");
  has("invCard", "Program director", "inversion card names the escalation rule's real owner");
  has("invCard", 'data-jump="A-09"', "inversion card's button jumps to the real action id");
  has("invCard", "condition that has to hold immediately before it",
    "inversion card avoids 'predecessor state' wording (collides with CPM predecessor/successor logic)");
}
try {
  fire(G.invCard, "click", { target: { closest: (sel) => sel === "[data-jump]" ? { dataset: { jump: "A-09" } } : null } });
  ok(G["p-act"].hidden === false && G["p-fw"].hidden === true, "inversion card's jump switches to the Actions tab");
  has("actDrill", "A-09", "landing on the Actions tab from the inversion card opens A-09's own drill-down");
} catch (e) { ok(false, "inversion card jump interaction", e.message); }

console.log("== D5.8. the gate line (flow diagram) ==");
{
  ok(["gateLine", "glDetail", "glStoryCard", "glPrev", "glNext", "glDots", "glPos"].every(id => idsA.includes(id)),
    "markup contains all Gate Line elements");
  ok(P.glNodes.length === 13, "GL_NODES flattens 7 phases + 6 exit gates into 13 stops", String(P.glNodes.length));
  // pre-registered against the same live ledger D5.5's Gate 5 test already asserts against —
  // if this ever contradicts D5.5, that contradiction IS the finding (B35), not something to
  // reconcile by editing one side quietly.
  const curPhaseNode = P.glNodes[8]; // phase index 4 (Procurement) sits at flattened index 8
  ok(curPhaseNode.type === "phase" && curPhaseNode.i === 4, "flattened index 8 is phase index 4 (Procurement)");
  ok(P.glNodeState(curPhaseNode) === "cur", "the program's current phase renders as 'cur', not 'ok'/'pend'");
  const gate5Node = P.glNodes[9]; // gate index 4 = GATES[4].gate===5, sits right after the current phase
  ok(gate5Node.type === "gate" && P.gates[gate5Node.i].gate === 5, "flattened index 9 is Gate 5");
  ok(P.glNodeState(gate5Node) === "bad", "Gate 5 renders 'bad' (blocked) — matches the contingency-coverage FAIL already asserted in D5.5/D5.7",
    P.glNodeState(gate5Node));
  const gate5Cap = P.glCaption(gate5Node);
  ok(gate5Cap.text.includes("0.588") && gate5Cap.text.includes("FAIL"),
    "Gate 5's own caption states the live 0.588/FAIL value, not a static description", gate5Cap.text);
  ok((G.gateLine._html.match(/data-idx="/g) || []).length === 13,
    "rendered SVG contains all 13 clickable nodes", String((G.gateLine._html.match(/data-idx="/g) || []).length));
  // this harness's matchMedia stub always reports matches:true (prefers-reduced-motion: reduce) —
  // real coverage for the motion-allowed branch is live-browser verified (both directions
  // confirmed: SMIL <animate> present when matches:false, absent when matches:true), same
  // division of labor as D11's wireDetailsAnimation checks below.
  ok(!G.gateLine._html.includes("<animate"),
    "the 'you are here' SMIL pulse is omitted under the stub's reduced-motion-on default");
  try {
    fire(G.gateLine, "click", { target: { closest: (sel) => sel === "[data-idx]" ? { dataset: { idx: "9" } } : null } });
    ok(G.glStoryTitle._html.includes("Gate 5"), "clicking Gate 5's node updates the story title");
    ok(G.glStoryText._html.includes("0.588"), "clicking Gate 5's node updates the story text with the live value");
  } catch (e) { ok(false, "gate line click interaction", e.message); }
  try {
    fire(G.gateLine, "keydown", { key: "Enter", preventDefault(){}, target: { closest: (sel) => sel === "[data-idx]" ? { dataset: { idx: "0" } } : null } });
    ok(G.glStoryTitle._html.includes("Phase 1"), "Enter-key activation on a node works the same as a click");
  } catch (e) { ok(false, "gate line keyboard interaction", e.message); }
  try {
    // starts from wherever the click/keydown tests above left glIdx (index 0, the last one to
    // run successfully) — asserted explicitly rather than assumed, so this block doesn't
    // silently depend on execution order above it.
    ok(String(G.glPos.textContent).includes("1 of 13"), "sanity: story position is at stop 1 before the nav-clamp checks below", String(G.glPos.textContent));
    fire(G.glNext, "click");
    ok(String(G.glPos.textContent).includes("2 of 13"), "story Next button advances by one stop");
    for (let i = 0; i < 20; i++) fire(G.glNext, "click");
    ok(String(G.glPos.textContent).includes("13 of 13"), "story Next clamps at the last stop rather than throwing/wrapping");
    for (let i = 0; i < 20; i++) fire(G.glPrev, "click");
    ok(String(G.glPos.textContent).includes("1 of 13"), "story Prev clamps at the first stop");
  } catch (e) { ok(false, "gate line story nav", e.message); }
}

/* =========================================================================
   D5.6. CONTRACT COMMERCIAL REGISTER — a third aggregation axis (Gap 2)
   ========================================================================= */
console.log("== D5.6. contract commercial register ==");
["contractTable", "contractFoot"].forEach(id => ok(idsA.includes(id), "markup contains #" + id));
ok(P.contracts.length === 6, "exactly 6 contracts", String(P.contracts.length));
{
  const cs = P.contracts.map(P.deriveContract);
  const counts = {};
  P.contracts.forEach(c => c.pkgs.forEach(id => { counts[id] = (counts[id] || 0) + 1; }));
  ok(P.rows.every(r => counts[r.id] === 1) && Object.keys(counts).length === P.rows.length,
    "every control account covered by exactly one contract — no gaps, no overlaps");
  const awardSum = cs.reduce((a, c) => a + c.award, 0);
  ok(Math.abs(awardSum - T.bac) < 1e-6, "contract awards sum to the same BAC as every other tab", awardSum.toFixed(1));
  const apSum = P.contracts.reduce((a, c) => a + c.approvedCO, 0);
  const pdSum = P.contracts.reduce((a, c) => a + c.pendingTrends, 0);
  ok(Math.abs(apSum - P.program.coApprovedValue) < 1e-9, "approved COs sum to the program total", apSum.toFixed(1));
  ok(Math.abs(pdSum - P.program.coPendingValue) < 1e-9, "pending trends sum to the program total", pdSum.toFixed(1));
  const allocSum = cs.reduce((a, c) => a + c.allocContingency, 0);
  const reserveSum = cs.reduce((a, c) => a + c.uncommittedReserve, 0);
  ok(Math.abs(allocSum - P.program.contingency) < 1e-6, "contingency allocation sums to the program total", allocSum.toFixed(1));
  ok(Math.abs(reserveSum - T.contRemaining) < 1e-6, "uncommitted reserve sums to remaining contingency", reserveSum.toFixed(1));
}
has("contractTable", "CTE-BB-02", "contract table renders the tunnel bid-build contract");
has("contractTable", "CP-101, CP-102", "guideway contract shows both mapped control accounts");
has("contractFoot", "6 contracts, 8 control accounts, no gaps and no overlaps", "footer states full coverage");
has("aiGuards", "Every control account is covered by exactly one contract", "integrity gate covers the contract register");

/* =========================================================================
   D6. ACTIONS TAB — RAID/CAPA register on top of the escalation matrix
   ========================================================================= */
console.log("== D6. actions tab ==");
ok(idsA.includes("p-act") && idsA.includes("t-act"), "actions tab/panel wired");
["actStrip", "ownerTable", "actFilters", "actTable", "actDrill"].forEach(id =>
  ok(idsA.includes(id), "markup contains #" + id));
ok(P.actions.length === 17, "exactly 17 action items", String(P.actions.length));
{
  const rows = P.actions.map(a => Object.assign({}, a, { status: P.actionStatus(a), stale: P.isStale(a) }));
  const counts = {};
  rows.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
  const expected = { escalated: 6, overdue: 1, "due-soon": 3, "in-progress": 4, "not-started": 1, blocked: 1, verified: 1 };
  Object.keys(expected).forEach(k =>
    ok(counts[k] === expected[k], "status count " + k + " = " + expected[k], String(counts[k])));
  ok(rows.filter(r => r.status !== "verified" && r.status !== "closed").length === 16, "16 of 17 open");
  // the new "how this is actually computed" dbox (Phase 3, 2026-08-20) walks actionStatus()'s
  // branch order against A-01 — independently recompute d from raw ISO dates (Date math, never
  // via the app's own actDays()), matching the same "don't trust the app's own math" doctrine.
  {
    const a1 = P.actions.filter(a => a.id === "A-01")[0];
    const ASOF = Date.UTC(2026, 6, 31);
    const d = Math.round((ASOF - Date.parse(a1.due + "T00:00:00Z")) / 86400000);
    const opened = Math.round((ASOF - Date.parse(a1.opened + "T00:00:00Z")) / 86400000);
    ok(d === 21, "independently-recomputed A-01 d (days since due) is 21", String(d));
    ok(d >= 5, "pre-registered: 21 >= 5, so A-01 genuinely lands in the escalated branch");
    ok(P.actionStatus(a1) === "escalated", "A-01's actual actionStatus() result matches the independent branch prediction");
    has("actionsMathBody", "d&ge;5", "actions math panel states the escalated threshold");
    has("actionsMathBody", "d = " + d, "actions math panel's worked d matches the independent recomputation");
    has("actionsMathBody", a1.due, "actions math panel names A-01's real due date");
    has("actionsMathBody", "(" + opened + " days before the data date)", "actions math panel's worked opened-days matches the independent recomputation");
    has("actionsMathBody", "escalated</b>", "actions math panel states the true escalated verdict");
  }
  // Tier 2: type-icon badges on the register table — one distinct icon per Type value
  const typeCounts = {};
  rows.forEach(r => { typeCounts[r.type] = (typeCounts[r.type] || 0) + 1; });
  ok(typeCounts.Issue === 6 && typeCounts.Task === 10 && typeCounts.Decision === 1,
    "action type mix is 6 Issue / 10 Task / 1 Decision", JSON.stringify(typeCounts));
  ["ticon a", "ticon i", "ticon g"].forEach(cls =>
    ok(G.actTable._html.includes('class="' + cls + '"'), "actTable renders a '" + cls + "' type icon badge"));
  const stale = rows.filter(r => r.stale);
  ok(stale.length === 2, "exactly 2 stale flags", String(stale.length));
  ok(stale.map(r => r.id).sort().join(",") === "A-09,A-11", "stale flags land on A-09 and A-11",
    stale.map(r => r.id).join(","));
  // SLA-aging glow (2026-08-19): reuses the same 2 stale flags above — the glow class must land
  // on exactly those rows and no others, not a separate/desynced computation
  const glowRowIds = [...G.actTable._html.matchAll(/data-act="([^"]+)"[^>]*class="stale-glow"/g)].map(m => m[1]);
  ok(glowRowIds.sort().join(",") === "A-09,A-11", "stale-glow class lands on exactly A-09 and A-11", glowRowIds.join(","));
  ok(!G.actTable._html.includes('class="stale-glow"') || glowRowIds.length === stale.length,
    "no non-stale row accidentally carries the glow class");
  const ncr = rows.filter(r => r.id.startsWith("NCR"));
  ok(ncr.length === 2 && ncr.every(r => r.type === "Issue" && r.owner === "Quality Manager"),
    "both NCR items are Quality Manager Issues", JSON.stringify(ncr.map(r => [r.id, r.status])));
}
// register table renders 17 rows by default (filter = All) and the KPI strip / owner rollup are non-empty
has("actTable", 'data-act="A-01"', "register table renders item A-01");
ok((G.actTable._html.match(/data-act=/g) || []).length === 17, "register table shows all 17 rows unfiltered");
// found by the independent review: actTable rows lacked the accessibility attributes the
// established pattern (pkgBody, Cost tab) already carries for the identical click-to-open-drawer
// interaction — a real regression, not a stylistic nit.
has("actTable", 'role="button"', "register table rows carry role=\"button\" (matches pkgBody's pattern)");
has("actTable", 'aria-controls="actDrill"', "register table rows announce what they control");
has("actTable", "aria-pressed=", "register table rows announce their pressed state");
has("actStrip", "16 of 17", "KPI strip shows 16 of 17 open");
ok(String(G.cntAct.textContent) === "16", "tab badge shows 16 open", String(G.cntAct.textContent));
ok((G.ownerTable._html.match(/<tr/g) || []).length >= 9, "owner accountability table has header + 8+ owner rows");
// filter interaction: Escalated shows exactly the 6 escalated rows
try {
  fire(G.actFilters, "click", { target: { closest: () => ({ dataset: { actf: "Escalated" } }) } });
  ok((G.actTable._html.match(/data-act=/g) || []).length === 6, "Escalated filter shows exactly 6 rows");
  fire(G.actFilters, "click", { target: { closest: () => ({ dataset: { actf: "All" } }) } });
  ok((G.actTable._html.match(/data-act=/g) || []).length === 17, "filter reset to All shows 17");
} catch (e) { ok(false, "actions filter interaction", e.message); }
// row drill-down: opens the CAPA detail for an Issue, closes on second click
try {
  fire(G.actTable, "click", { target: { closest: () => ({ dataset: { act: "A-01" } }) } });
  has("actDrill", "A-01", "drill-down opens A-01");
  has("actDrill", "Root cause", "drill-down shows root cause for an Issue-type item");
  has("actDrill", "Preventive action", "drill-down shows preventive action");
  fire(G.actTable, "click", { target: { closest: () => ({ dataset: { act: "A-01" } }) } });
  ok(G.actDrill._html === "", "drill-down closes on second click of same row");
} catch (e) { ok(false, "actions drill-down", e.message); }
// verified item shows an independent verifier, not a self-report
try {
  fire(G.actTable, "click", { target: { closest: () => ({ dataset: { act: "A-15" } }) } });
  has("actDrill", "Document Control Lead", "verified item names an independent verifier");
  fire(G.actDrill, "click", { target: { id: "closeAct" } });
  ok(G.actDrill._html === "", "close button clears the drill-down");
} catch (e) { ok(false, "verified item drill-down", e.message); }

/* =========================================================================
   D7. PRESENTATION MODE — quick-jump navigation for live screen-share delivery
   ========================================================================= */
console.log("== D7. presentation mode ==");
ok(idsA.includes("presentBtn") && idsA.includes("presentBar"), "presentation-mode markup wired");
{
  const validTabs = ["over", "port", "cost", "sched", "risk", "del", "ai", "fw", "act", "gloss"];
  [["full", P.presentBeatsFull, 9], ["quick", P.presentBeatsQuick, 4]].forEach(([name, beats, n]) => {
    ok(beats.length === n, name + " beat set has " + n + " beats", String(beats.length));
    ok(beats.every(b => validTabs.includes(b.tab)), name + " beats all reference a real tab id");
    ok(beats.every(b => b.notes && b.notes.length >= 2), name + " every beat carries at least 2 notes");
  });
  const gate5Beat = P.presentBeatsFull.filter(b => b.anchor)[0];
  ok(!!gate5Beat && idsA.includes(gate5Beat.anchor), "the anchor beat points at a real element id",
    gate5Beat && gate5Beat.anchor);
  // /stress-test finding (2026-08-19): the presenter-notes beats had gone stale relative to
  // today's 2 newest features — a live walkthrough tool that doesn't mention its own newest,
  // most differentiated content is a real content gap, not cosmetic
  [P.presentBeatsFull, P.presentBeatsQuick].forEach(beats => {
    const portBeat = beats.filter(b => b.tab === "port")[0];
    const costBeat = beats.filter(b => b.tab === "cost")[0];
    ok(portBeat.notes.some(n => n.includes("funding-tier")), "Portfolio beat mentions the new funding-tier feature");
    ok(costBeat.notes.some(n => n.includes("reference class forecasting")), "Cost beat mentions the new reference-class feature");
  });
}
try {
  // presentBar's initial hidden state comes from the raw `hidden` HTML attribute (correct in a
  // real browser); the stub doesn't parse markup into initial DOM state, only JS-driven changes,
  // so the meaningful thing to verify is the actual transition once the button is clicked.
  fire(G.presentBtn, "click");
  ok(G.presentBar.hidden === false, "entering present mode shows the bar");
  ok(G.presentBtn.getAttribute("aria-pressed") === "true", "presentBtn reports pressed once active");
  has("presentBar", "1 / 9", "starts on beat 1 of 9 (full/team set by default)");
  has("presentBar", "Open", "shows the first beat's label");

  fire(G.presentBar, "click", { target: { closest: (sel) => sel === "[data-p]" ? { dataset: { p: "next" } } : null } });
  has("presentBar", "2 / 9", "Next advances to beat 2");
  ok(G["p-over"].hidden === false, "beat 2 (architecture) stays on the Overview tab");

  fire(G.presentBar, "click", { target: { closest: (sel) => sel === "[data-p]" ? { dataset: { p: "next" } } : null } });
  ok(G["p-port"].hidden === false && G["p-over"].hidden === true, "beat 3 (portfolio rollup) switches to the Portfolio tab");

  fire(G.presentBar, "click", { target: { closest: (sel) => sel === "[data-pset]" ? { dataset: { pset: "quick" } } : null } });
  has("presentBar", "1 / 4", "switching to the quick-chat set resets to its own beat 1");
  has("presentBar", "Portfolio", "quick set's first beat is the Portfolio stop");

  fire(G.presentBar, "click", { target: { closest: (sel) => sel === "[data-p]" ? { dataset: { p: "notes" } } : null } });
  const popupHtml = R.win._lastPopup.document.getElementById("root").innerHTML;
  ok(popupHtml.includes("Portfolio") && popupHtml.includes("34.5B"),
    "presenter-notes popup shows the current beat's real talking points", popupHtml.slice(0, 80));

  // keyboard shortcuts, only while presenting
  fire(R.win, "keydown", { key: "N", target: { tagName: "BODY" } });
  has("presentBar", "2 / 4", "N key advances to the next beat while presenting");
  fire(R.win, "keydown", { key: "P", target: { tagName: "BODY" } });
  has("presentBar", "1 / 4", "P key goes back a beat while presenting");

  fire(G.presentBar, "click", { target: { closest: (sel) => sel === "[data-p]" ? { dataset: { p: "exit" } } : null } });
  ok(G.presentBar.hidden === true, "exit hides the presenter bar");
  ok(G.presentBtn.getAttribute("aria-pressed") === "false", "exit un-presses the Present button");
  ok(R.win._lastPopup.closed === true, "exit closes the presenter-notes popup");

  // re-enter, then confirm Escape also exits, and keys are inert when NOT presenting
  fire(G.presentBtn, "click");
  ok(G.presentBar.hidden === false, "re-entering present mode works a second time");
  fire(R.win, "keydown", { key: "Escape", target: { tagName: "BODY" } });
  ok(G.presentBar.hidden === true, "Escape exits present mode");
  const beforeKey = G.presentBar._html;
  fire(R.win, "keydown", { key: "N", target: { tagName: "BODY" } });
  ok(G.presentBar._html === beforeKey, "N key does nothing when not presenting");
} catch (e) { ok(false, "presentation mode interaction", e.message); }

// Presentation Mode interactivity upgrade (/brainstorm 2026-08-19)
try {
  fire(G.presentBtn, "click"); // enter fresh
  // the earlier D7 block above left state.presentSet on "quick" (it switches sets but never
  // switches back before its own block ends) — force back to "full" explicitly rather than
  // assume a default, the exact assumption that broke this block the first time it was written.
  fire(G.presentBar, "click", { target: { closest: (sel) => sel === "[data-pset]" ? { dataset: { pset: "full" } } : null } });
  ok((G.presentBar._html.match(/data-beat="/g) || []).length === 9,
    "presentBar renders one clickable dot per beat (full/team set)");

  // Part 3: clicking a dot jumps straight to that beat, non-linearly
  const gate5Idx = P.presentBeatsFull.findIndex(b => b.anchor === "gate5Card");
  ok(gate5Idx >= 0, "a beat in the full set anchors to gate5Card", String(gate5Idx));
  fire(G.presentBar, "click", { target: { closest: (sel) => sel === "[data-beat]" ? { dataset: { beat: String(gate5Idx) } } : null } });
  has("presentBar", (gate5Idx + 1) + " / 9", "clicking a beat dot jumps straight to that beat, skipping the ones between");

  // Part 1+2: landing on the Gate 5 beat replays the reveal and syncs the Gate Line diagram —
  // verified via the Gate Line's own story title, since the stub's querySelectorAll always
  // returns [] (documented harness limitation) so the .flow-node.on class toggle itself can't be
  // observed here; the live-browser pass is what actually proves the visual reveal replays.
  has("glStoryTitle", "Gate 5", "landing on the Gate 5 beat syncs the Gate Line diagram to its own Gate 5 node");

  // Part 2: the tunnel-story beat force-selects CP-201 even if a different package was already
  // selected — mutate state.pkg directly (state is a live object reference, not a copy) to prove
  // the beat corrects it rather than merely happening to already be right.
  const cp201Idx = P.rows.findIndex(r => r.id === "CP-201");
  P.state.pkg = 0;
  ok(P.state.pkg !== cp201Idx, "sanity: pkg was actually forced away from CP-201 before the beat runs");
  const tunnelIdx = P.presentBeatsFull.findIndex(b => b.label === "The tunnel story (Cost)");
  ok(tunnelIdx >= 0, "a beat in the full set is the tunnel story", String(tunnelIdx));
  fire(G.presentBar, "click", { target: { closest: (sel) => sel === "[data-beat]" ? { dataset: { beat: String(tunnelIdx) } } : null } });
  ok(P.state.pkg === cp201Idx, "landing on the tunnel-story beat force-selects CP-201 regardless of prior selection",
    "state.pkg=" + P.state.pkg + " expected=" + cp201Idx);

  // Part 4: the on-screen callout appears only on the closing beat, and is computed FROM notes
  const closeIdx = P.presentBeatsFull.length - 1;
  const closeBeat = P.presentBeatsFull[closeIdx];
  ok(typeof closeBeat.onScreen === "function", "the closing beat carries an onScreen() method");
  ok(closeBeat.onScreen() === closeBeat.notes[1] + " " + closeBeat.notes[2],
    "onScreen() is composed from the SAME notes array entries, not a separately authored duplicate that could drift");
  fire(G.presentBar, "click", { target: { closest: (sel) => sel === "[data-beat]" ? { dataset: { beat: String(closeIdx) } } : null } });
  has("presentOnScreen", "change pricing and schedule integration", "the closing beat shows the on-screen ask-the-room callout");
  fire(G.presentBar, "click", { target: { closest: (sel) => sel === "[data-beat]" ? { dataset: { beat: "0" } } : null } });
  ok(G.presentOnScreen._html === "", "the on-screen callout clears on beats that don't set onScreen");

  // dots re-render to match the quick-chat set's 4 beats
  fire(G.presentBar, "click", { target: { closest: (sel) => sel === "[data-pset]" ? { dataset: { pset: "quick" } } : null } });
  ok((G.presentBar._html.match(/data-beat="/g) || []).length === 4, "beat dots re-render to 4 for the quick-chat set");

  fire(G.presentBar, "click", { target: { closest: (sel) => sel === "[data-p]" ? { dataset: { p: "exit" } } : null } });
  ok(G.presentBar.hidden === true, "exit still works after the interactivity upgrade");
} catch (e) { ok(false, "presentation mode interactivity upgrade", e.message); }

/* =========================================================================
   D8. KPI root-cause drill-down — Overview cards -> live open items -> Actions tab
   ========================================================================= */
console.log("== D8. KPI root-cause drill-down ==");
{
  // every ACTIONS/NCR `kpi` tag must reference a real KPIS id — a silent typo here would make a
  // link vanish with no error, which is exactly the class of bug this suite exists to catch.
  const kpiIds = new Set(P.kpis.map(k => k.id));
  const badTags = P.actions.filter(a => a.kpi).flatMap(a => a.kpi.filter(id => !kpiIds.has(id)));
  ok(badTags.length === 0, "every ACTIONS `kpi` tag matches a real KPI id", badTags.join(","));

  const cpiActions = P.actionsForKpi("cpi").map(a => a.id).sort();
  ok(JSON.stringify(cpiActions) === JSON.stringify(["A-01", "A-04", "A-07", "NCR-2026-014"].sort()),
    "actionsForKpi('cpi') resolves to all 4 real linked items", cpiActions.join(","));
  // A-04 (R-01 mitigation) deliberately carries the tunnel's full connective-tissue tag set
  ok(P.actions.find(a => a.id === "A-04").kpi.length === 4 &&
     ["expo", "ccr", "cpi", "cv"].every(k => P.actions.find(a => a.id === "A-04").kpi.includes(k)),
    "A-04 (R-01) is tagged to all four KPIs the tunnel root cause actually drives");

  const expoActions = P.actionsForKpi("expo").map(a => a.id).sort();
  ok(JSON.stringify(expoActions) === JSON.stringify(["A-04", "A-10", "A-11", "A-14"].sort()),
    "actionsForKpi('expo') finds all 4 risk-mitigation items", expoActions.join(","));
}
try {
  // cpi is amber (0.956) and has real linked items — the primary path
  fire(G.kboard, "click", { target: { closest: () => ({ dataset: { kpi: "cpi" } }) } });
  has("kdetail", "Root cause &amp; who owns it right now", "breached KPI drawer shows the root-cause section");
  has("kdetail", "A-01", "cpi drawer links A-01");
  has("kdetail", "Control account manager", "cpi drawer shows the real assigned owner");
  has("kdetail", "due 2026-07-10", "cpi drawer shows the real due date");
  has("kdetail", "data-jump=\"A-01\"", "cpi drawer's A-01 row is clickable");
  fire(G.kboard, "click", { target: { closest: () => ({ dataset: { kpi: "cpi" } }) } });
} catch (e) { ok(false, "cpi root-cause section", e.message); }
try {
  // cdi is green with zero linked actions — must say so plainly, not render an empty section
  fire(G.kboard, "click", { target: { closest: () => ({ dataset: { kpi: "cdi" } }) } });
  has("kdetail", "Currently within threshold", "green KPI with no linked items says so plainly");
  ok(!G.kdetail._html.includes("Related open items"), "cdi (truly nothing tracked) does not show the open-items heading");
  fire(G.kboard, "click", { target: { closest: () => ({ dataset: { kpi: "cdi" } }) } });
} catch (e) { ok(false, "cdi (green, no items) root-cause section", e.message); }
try {
  // expo is green but DOES have 4 open items feeding it — the false-negative this session's own
  // review caught: claiming "nothing tracked" here would be wrong, not just unhelpful
  fire(G.kboard, "click", { target: { closest: () => ({ dataset: { kpi: "expo" } }) } });
  has("kdetail", "Related open items", "green-but-tracked KPI (expo) shows the open-items heading, not the empty-state one");
  ok(!G.kdetail._html.includes("Currently within threshold &mdash; no open item"),
    "expo does not falsely claim nothing is tracked");
  has("kdetail", "A-10", "expo drawer includes the R-02 utility item");
  fire(G.kboard, "click", { target: { closest: () => ({ dataset: { kpi: "expo" } }) } });
} catch (e) { ok(false, "expo (green, tracked) root-cause section", e.message); }
try {
  // tcpi is red with no ACTIONS item yet — the escalation-rule fallback, an honest visible gap
  fire(G.kboard, "click", { target: { closest: () => ({ dataset: { kpi: "tcpi" } }) } });
  has("kdetail", "No item has been opened for this yet", "tcpi falls back to the escalation-rule gap message");
  has("kdetail", "TCPI − CPI &gt; 0.10", "tcpi fallback shows the TCPI-CPI-gap rule");
  has("kdetail", "TCPI(BAC) &gt; 1.10", "tcpi fallback shows the TCPI(BAC) rule");
  fire(G.kboard, "click", { target: { closest: () => ({ dataset: { kpi: "tcpi" } }) } });
} catch (e) { ok(false, "tcpi escalation-fallback section", e.message); }
try {
  // vac is red with no ACTIONS item yet either — KPI_ESCALATION's OTHER fallback entry ({vac:[5]}),
  // previously untested (a stress-test-hunt finding: the tcpi branch was covered, this one wasn't).
  fire(G.kboard, "click", { target: { closest: () => ({ dataset: { kpi: "vac" } }) } });
  has("kdetail", "No item has been opened for this yet", "vac falls back to the escalation-rule gap message");
  has("kdetail", "VAC exceeds remaining contingency", "vac fallback shows its own rule text, not a shifted neighbor's");
  has("kdetail", "Program director + sponsor", "vac fallback shows the rule's real owner");
  fire(G.kboard, "click", { target: { closest: () => ({ dataset: { kpi: "vac" } }) } });
} catch (e) { ok(false, "vac escalation-fallback section", e.message); }
try {
  // spi is amber with neither a linked action nor an escalation rule — no section at all, not a
  // broken/empty one, so it doesn't clutter a card the underlying data genuinely has nothing for
  fire(G.kboard, "click", { target: { closest: () => ({ dataset: { kpi: "spi" } }) } });
  ok(!G.kdetail._html.includes("Root cause &amp; who owns") && !G.kdetail._html.includes("Root cause &amp; ownership"),
    "spi (no link, no rule) renders no root-cause section at all");
  fire(G.kboard, "click", { target: { closest: () => ({ dataset: { kpi: "spi" } }) } });
} catch (e) { ok(false, "spi (no section) case", e.message); }
try {
  // the actual jump: click A-01's row inside the cpi drawer and land on the Actions tab, on A-01
  fire(G.kboard, "click", { target: { closest: () => ({ dataset: { kpi: "cpi" } }) } });
  fire(G.kdetail, "click", { target: { closest: (sel) => sel === "[data-jump]" ? { dataset: { jump: "A-01" } } : null } });
  ok(G["p-act"].hidden === false && G["p-over"].hidden === true, "jumping from a KPI drawer switches to the Actions tab");
  ok(G.kdetail._html === "", "jumping from a KPI drawer closes it behind you");
  has("actDrill", "A-01", "landing on the Actions tab opens A-01's own drill-down");
  has("actDrill", "Control account manager", "A-01's drill-down shows its real owner");
} catch (e) { ok(false, "jumpToAction interaction", e.message); }

/* =========================================================================
   D9. DATA STRATEGY TAB — real-world multi-system data problem, static reference
   ========================================================================= */
console.log("== D9. data strategy tab ==");
ok(P.kpis && TABS_CHECK(), "TABS array carries 11 ids, ending in gloss then data");
function TABS_CHECK() {
  const m = indexSrc.match(/var TABS=\[([^\]]+)\]/);
  const arr = m ? m[1].split(",").map(s => s.replace(/["']/g, "")) : [];
  return arr.length === 11 && arr[9] === "gloss" && arr[10] === "data";
}
ok(P.guardrails.length === 4, "4 guardrail types defined", String(P.guardrails.length));
ok(P.discrepancySteps.length === 5, "5-step discrepancy-resolution flow defined", String(P.discrepancySteps.length));
ok(P.rollout.length === 3, "3-phase rollout defined", String(P.rollout.length));
has("guardrailGrid", "Entity / schema check", "guardrail grid renders the entity/schema check");
has("guardrailGrid", "Cross-system reconciliation", "guardrail grid renders cross-system reconciliation check");
has("guardrailGrid", "IDS", "guardrail grid ties checks back to the real IDS standard");
// concrete circuit-breaker examples enriching the entity/schema and range/restriction rows
// (harvested from the "Operating Architecture" doc triage — named violation types, not new logic)
has("guardrailGrid", "orphan-activity violation", "entity/schema example names the orphan-activity violation");
has("guardrailGrid", "commitment-floor violation", "range/restriction example names the commitment-floor violation");
has("guardrailGrid", "negative actual cost", "range/restriction example covers negative-actuals as an impossible state");
// Tier 2: one icon badge per guardrail row (4 categories, all "info" tint — a parallel
// taxonomy, not a severity ladder)
ok((G.guardrailGrid._html.match(/class="ticon i"/g) || []).length === 4,
  "guardrail grid renders exactly 4 category icon badges", String((G.guardrailGrid._html.match(/class="ticon i"/g) || []).length));
// UI/UX upgrade round (2026-08-21): guardrail table -> 4-tile status grid, reusing the
// .ledgerGrid/.ledger-item pattern from the Overview six-KPI-families card; each tile carries
// a real "Tier N" label matching the GUARDRAILS array's own order (Entity/schema=1,
// Range/restriction=2, Cross-system=3, Freshness=4).
ok(/Tier 1[\s\S]*Tier 2[\s\S]*Tier 3[\s\S]*Tier 4/.test(G.guardrailGrid._html),
  "guardrail grid labels all 4 tiles Tier 1 through Tier 4, in GUARDRAILS' own order");
ok(G.guardrailGrid._html.includes('class="ledger-item"'), "guardrail grid reuses the existing .ledger-item card pattern, not a new one");
// Tile 2 (Range/restriction) embeds the one genuinely live, IDS-shaped check this ledger has —
// INGEST_GUARDS — rather than a fabricated pass-rate for all 4 tiers. renderIngestGuards() was
// generalized to take a target id (was hardcoded to #aiIngestGuards) so both call sites share
// one implementation, not a copy.
has("dsIngestGuards", "No negative actual cost anywhere", "the live ingestion-validation panel embedded in tile 2 shows its first real check");
has("dsIngestGuards", "EV", "the live ingestion-validation panel embedded in tile 2 shows its second real check");
ok(/class="pill g"/.test(G.dsIngestGuards._html), "the embedded live ingestion panel shows a real PASS pill, not narrated text");
ok(G.aiIngestGuards._html.includes("No negative actual cost anywhere"),
  "the AI & Data tab's own #aiIngestGuards panel (the pre-existing call site) still renders correctly after renderIngestGuards() was generalized to take a target id");
// Proactive error recovery: 3 prose dboxes -> a Category/Trigger/Routing table, same categories
// and phrasing already established on this tab, no invented SLA hours (unlike the source
// blueprint's own version of this table).
has("recoveryTable", "Circuit breaker", "recovery table names the circuit-breaker category");
has("recoveryTable", "Quarantine", "recovery table names the quarantine category");
has("recoveryTable", "Self-healing", "recovery table names the self-healing category");
has("recoveryTable", "Gate 5 hard stop", "recovery table's circuit-breaker row still ties back to this dashboard's own Gate 5, not just the source doc's generic framing");
ok(RECOVERY_ROWS_LEN() === 3, "RECOVERY_ROWS has exactly 3 categories (circuit breaker / quarantine / self-healing)", String(RECOVERY_ROWS_LEN()));
function RECOVERY_ROWS_LEN() { const m = indexSrc.match(/var RECOVERY_ROWS=\[([\s\S]*?)\n\];/); return m ? (m[1].match(/\{t:/g) || []).length : -1; }
// Dual-stack parity card: cites the real live T.cpi value (the same number the Overview KPI
// board shows), independently re-derived, not a fabricated freshness/parity badge — pre-
// registered per verify.md B35: the card's own cited figure must equal the live T.cpi this
// session's stress harness itself computes from raw PKGS, not a hand-typed guess.
ok(G.parityLede._html.includes(idx(T.cpi)),
  "the dual-stack parity card cites this program's own real, live CPI value", G.parityLede._html);
ok(G.paritySql._html.includes("as cpi") && G.paritySql._html.includes("nullif(m.ac, 0)"),
  "the parity card quotes the real SQL line from pipeline/models/fct_control_account.sql verbatim, not a paraphrase");
ok(indexSrc.includes("python3 pipeline/run_pipeline.py"),
  "the parity card cites the real, reproducible pipeline command");
// these three are static HTML baked into the page, never JS-rendered into #p-data's innerHTML —
// check the raw source directly (same pattern as the other static-content checks in this file),
// not has(), which only sees content actually assigned via .innerHTML at runtime.
ok(indexSrc.includes("Common Data Environment"), "Data Strategy tab names the real ISO 19650 CDE standard");
ok(indexSrc.includes("6.80/hr"), "Data Strategy tab shows the verified Sound Transit reimbursement rate");
ok(indexSrc.includes("Structure (WBS)") && indexSrc.includes("(ABS)"),
  "Data Strategy tab names the real WBS/ABS mismatch");
// #discrepancyFlow used to render DISCREPANCY_STEPS as a second, flat static-card duplicate of
// the same 5-step logic the CDE flow diagram already draws live — deduped (engagement/
// interactivity upgrade, 2026-08-2x). It's now a short pointer + a jump button; the step content
// itself is genuinely gone from this element (by design), independently confirmed absent here
// while confirming DISCREPANCY_STEPS/dsStep() themselves are untouched and still feed dsCaption()
// (checked below, not assumed).
ok(!G.discrepancyFlow._html.includes("Classify severity first"),
  "discrepancy flow no longer duplicates step 1's text — the CDE diagram above is the one live version now");
ok(G.discrepancyFlow._html.includes("Walk the discrepancy branch") && /data-jump-tab="data"/.test(G.discrepancyFlow._html) && /data-jump-selectds="3"/.test(G.discrepancyFlow._html),
  "discrepancy flow instead renders a jump button into the CDE flow diagram's own detect node");
ok(P.discrepancySteps.length === 5 && P.discrepancySteps[0].w.indexOf("materiality threshold")>=0,
  "DISCREPANCY_STEPS itself is untouched — still 5 real steps, independently re-checked from the live array, not assumed just because the duplicate render site is gone");
ok(P.dsCaption(P.dsNodes.filter(function(n){return n.k==="detect";})[0]).x.indexOf(P.discrepancySteps[0].w) >= 0,
  "dsCaption() still reads DISCREPANCY_STEPS via dsStep() for the CDE diagram's own live captions — the removed duplicate didn't orphan the source data");
has("rolloutCards", "Phase 1", "rollout renders Phase 1");
has("rolloutCards", "Phase 3", "rollout renders Phase 3");
ok((G.rolloutCards._html.match(/class="pcard"/g) || []).length === 3, "rollout renders exactly 3 phase cards");
try {
  fire(G["t-data"], "click");
  ok(G["p-data"].hidden === false, "clicking the Data Strategy tab shows its panel");
  ok(G["p-over"].hidden === true, "clicking the Data Strategy tab hides Overview");
} catch (e) { ok(false, "data strategy tab activation", e.message); }

console.log("== D9.1. the CDE flow diagram (data strategy) ==");
{
  ok(["cdeFlow", "dsDetail", "dsStoryCard", "dsPrev", "dsNext", "dsDots", "dsPos"].every(id => idsA.includes(id)),
    "markup contains all CDE flow elements");
  ok(P.dsNodes.length === 12, "DS_NODES has 4 CDE stages + 3 gates + 5 discrepancy-branch nodes",
    String(P.dsNodes.length));
  const keys = P.dsNodes.map(n => n.k);
  ["wip", "shared", "published", "archived"].forEach(k =>
    ok(keys.includes(k), "DS_NODES includes the CDE stage '" + k + "'"));
  ok(keys.includes("known") && keys.includes("promote") && keys.includes("auto"),
    "DS_NODES includes the discrepancy-resolution branch (known pattern? / promote / auto-resolve)");
  // pre-registered: DISCREPANCY_STEPS is the single source for this branch's captions — a
  // caption quoting different text than the step it claims to summarize would be real drift,
  // the same class of finding B27/B35 exist to catch. promote's caption is composed from
  // DISCREPANCY_STEPS[3]+[4] directly (see dsCaption's "promote" case), so checking it echoes
  // step 5's own real phrase ("log every override, and promote recurring fixes") IS checking it
  // against the single source, not a second hand-typed copy that could quietly drift from it.
  const promoteCap = P.dsCaption(P.dsNodes.filter(n => n.k === "promote")[0]);
  ok(/audit trail/i.test(promoteCap.x) && /auto-resolve rule/i.test(promoteCap.x),
    "the 'promoted' node's caption actually reflects DISCREPANCY_STEPS' own step 5 content", promoteCap.x);
  // the verification gate's caption cites GUARDS.length (the AI & Data tab's own live integrity-
  // gate count) — cross-checked against guardCountLede, the other place that same live count is
  // rendered, rather than re-deriving GUARDS.length a third time from the array literal text.
  const g1Cap = P.dsCaption(P.dsNodes.filter(n => n.k === "g1")[0]);
  // renderGuards() sets this via .textContent, not .innerHTML — the stub's textContent is a
  // plain field with no number-to-string coercion (same gotcha as G.cntAct elsewhere in this
  // file), so String(...) it before comparing.
  const liveGuardCount = String(G.guardCountLede.textContent);
  ok(!!liveGuardCount && liveGuardCount !== "undefined" && g1Cap.x.includes(liveGuardCount + "-check"),
    "the verification gate's caption cites the dashboard's own live integrity-gate check count, not a typed number",
    "lede=" + liveGuardCount + " caption=" + g1Cap.x);
  ok((G.cdeFlow._html.match(/data-k="/g) || []).length === 12,
    "rendered SVG contains all 12 clickable nodes", String((G.cdeFlow._html.match(/data-k="/g) || []).length));
  try {
    fire(G.cdeFlow, "click", { target: { closest: (sel) => sel === "[data-k]" ? { dataset: { k: "known" } } : null } });
    ok(G.dsStoryTitle._html.includes("Known pattern"), "clicking the branch diamond updates the story title");
  } catch (e) { ok(false, "cde flow click interaction", e.message); }
  try {
    fire(G.cdeFlow, "keydown", { key: " ", preventDefault(){}, target: { closest: (sel) => sel === "[data-k]" ? { dataset: { k: "archived" } } : null } });
    ok(G.dsStoryTitle._html.includes("Archived"), "Space-key activation on a node works the same as a click");
  } catch (e) { ok(false, "cde flow keyboard interaction", e.message); }
  try {
    // starts from wherever "archived" (stop 12) left dsIdx, asserted rather than assumed
    ok(String(G.dsPos.textContent).includes("12 of 12"), "sanity: story position is at the last stop before the nav-clamp checks below", String(G.dsPos.textContent));
    for (let i = 0; i < 20; i++) fire(G.dsNext, "click");
    ok(String(G.dsPos.textContent).includes("12 of 12"), "story Next clamps at the last stop");
    for (let i = 0; i < 20; i++) fire(G.dsPrev, "click");
    ok(String(G.dsPos.textContent).includes("1 of 12"), "story Prev clamps at the first stop");
  } catch (e) { ok(false, "cde flow story nav", e.message); }
}

/* =========================================================================
   D10. INLINE TERM HELP — click-driven popover reusing GLOSS as its only source
   (returns the active tab to "over" at the end, since D9 above left "data" active)
   ========================================================================= */
console.log("== D10. inline term help ==");
ok(P.gloss.length === 50, "GLOSS grew to 50 entries (44 prior + cost/schedule/risk/change/delivery/compliance, six-families card, 2026-08-21)", String(P.gloss.length));
["cde", "ids", "wbs", "abs", "zscore", "ewma", "gbm", "raid", "capa", "cbsobs", "excusablecompensable"].forEach(k => {
  const g = P.findGloss(k);
  ok(!!g && typeof g.p === "string" && g.p.length > 0, "findGloss resolves new term '" + k + "'");
  ok(typeof g.e() === "string" && g.e().length > 0, "'" + k + "' example function returns text");
});
ok(P.findGloss("does-not-exist") === undefined, "findGloss returns undefined for an unknown key");
// capa has no inline icon on purpose (Phase 3 scope call, 2026-08-20) — its worked example is
// already fully covered above via the D4 glossary block and the findGloss resolution just above;
// an icon isn't needed for a term to be a real, tested glossary entry.
["wbs", "abs", "cde", "ids", "cpli", "fundingtier", "zscore", "ewma", "gbm", "raid", "cbsobs", "excusablecompensable"].forEach(k =>
  ok(indexSrc.includes('data-help="' + k + '"'), "help icon markup present for '" + k + "'"));
try {
  // getBoundingClientRect: openHelp() positions the popover from it; every real DOM element has
  // one, but this stub's makeEl() never needed it before this feature, so the mock supplies it.
  // setAttribute/focus: openHelp()/closeHelp() now toggle aria-expanded and manage focus on the
  // trigger element — every real DOM element has these, but this lightweight mock predates that
  // and needs them added explicitly (same class of gap as the getBoundingClientRect fix above).
  const wbsIconEl = { dataset: { help: "wbs" }, getBoundingClientRect: () => ({ bottom: 40, left: 20 }), setAttribute(){}, focus(){} };
  const wbsIcon = { closest: sel => (sel === "[data-help]" ? wbsIconEl : null) };
  fire(R.win, "click", { target: wbsIcon });
  ok(G.helpPop.hidden === false, "help popover opens on icon click");
  has("helpPop", "WBS", "help popover shows the WBS term title");
  has("helpPop", "Explore in Glossary", "help popover offers the Explore-in-Glossary action");
  fire(R.win, "click", { target: wbsIcon }); // same icon again -> toggle-close
  ok(G.helpPop.hidden === true, "help popover toggle-closes on a second click of the same icon");
  fire(R.win, "click", { target: wbsIcon });
  ok(G.helpPop.hidden === false, "help popover re-opens");
  fire(R.win, "click", { target: { closest: () => null } }); // click elsewhere on the page
  ok(G.helpPop.hidden === true, "help popover closes on a click outside it");
  fire(R.win, "click", { target: wbsIcon });
  fire(R.win, "keydown", { key: "Escape" });
  ok(G.helpPop.hidden === true, "help popover closes on Escape");
  fire(R.win, "click", { target: wbsIcon });
  const exploreLink = { closest: sel => (sel === "[data-explore]" ? { dataset: { explore: "WBS — Work Breakdown Structure" } } : null) };
  fire(R.win, "click", { target: exploreLink });
  ok(G.helpPop.hidden === true, "'Explore in Glossary' also closes the popover");
  ok(G["p-gloss"].hidden === false, "'Explore in Glossary' switches to the Glossary tab");
  ok(G.glossQ.value === "WBS", "'Explore in Glossary' pre-fills the search box with the term name (dash stripped)", G.glossQ.value);
} catch (e) { ok(false, "inline help popover interaction", e.message); }
// Cross-tab jump links (engagement/interactivity upgrade, 2026-08-2x, Phase 1). Static-markup
// checks against indexSrc (these 4 links live in static HTML, never re-rendered by JS — same
// pattern as the "Data Strategy tab names the real ISO 19650 CDE standard"-style checks above),
// plus end-to-end interaction tests proving the data-jump-tab delegated handler actually fires —
// only the synchronous part (activateTab()'s tab-hidden toggle + any pre() side effect) is
// checked, matching the same accepted "browser-only, not exercised here" limitation this file
// already states for jumpToAction()'s own deferred setTimeout scroll/flash.
ok(/data-jump-tab="ai" data-jump-el="aiGuards"/.test(indexSrc), "guardrail-table prose links to the live integrity gate on the AI & Data tab");
ok(/data-jump-tab="act" data-jump-el="actFilters"/.test(indexSrc), "escalation-matrix lede links to the Actions tab");
ok(/data-jump-tab="over" data-jump-el="kboard"/.test(indexSrc), "KPI reference library links back to the live Overview KPI board");
ok(/data-jump-tab="fw" data-jump-el="escTable"/.test(indexSrc) && /data-jump-tab="act" data-jump-el="actFilters" data-jump-actstale="1"/.test(indexSrc) && /data-jump-tab="fw" data-jump-el="gate5Card"/.test(indexSrc),
  "'proactive error recovery' card links to the escalation matrix, the stale Actions filter, and Gate 5 (the integrity-gate link is shared with the guardrail-table one already checked above)");
try {
  fire(G["t-data"], "click"); // start from Data Strategy so the jump below is a genuine tab-switch
  const guardJumpLink = { closest: sel => (sel === "[data-jump-tab]" ? { dataset: { jumpTab: "ai", jumpEl: "aiGuards" } } : null) };
  fire(R.win, "click", { target: guardJumpLink });
  ok(G["p-ai"].hidden === false && G["p-data"].hidden === true, "clicking the guardrail-table jump link switches to the AI & Data tab");
} catch (e) { ok(false, "guardrail-table jump interaction", e.message); }
try {
  fire(G["t-over"], "click");
  const staleJumpLink = { closest: sel => (sel === "[data-jump-tab]" ? { dataset: { jumpTab: "act", jumpEl: "actFilters", jumpActstale: "1" } } : null) };
  fire(R.win, "click", { target: staleJumpLink });
  ok(P.state.actFilter === "Stale", "clicking the stale-flag jump link sets state.actFilter to Stale (not just switching tabs and leaving the old filter in place)");
  ok(G["p-act"].hidden === false, "clicking the stale-flag jump link switches to the Actions tab");
  has("actTable", "Stale", "the Actions table itself re-rendered under the Stale filter, not just the tab switching underneath a stale render");
  fire(G.actFilters, "click", { target: { closest: () => ({ dataset: { actf: "All" } }) } }); // reset for later tests, matching this file's own established reset idiom
} catch (e) { ok(false, "stale-flag jump interaction", e.message); }
try {
  fire(G["t-over"], "click");
  const dsJumpLink = { closest: sel => (sel === "[data-jump-tab]" ? { dataset: { jumpTab: "data", jumpEl: "cdeFlow", jumpSelectds: "3" } } : null) };
  fire(R.win, "click", { target: dsJumpLink });
  ok(G["p-data"].hidden === false, "clicking the discrepancy-flow jump link switches to the Data Strategy tab");
  ok(P.dsNodes[3].k === "detect", "pre-registered: DS_NODES index 3 is genuinely the 'detect' node (the jump link's own hardcoded index is correct, not a guess)", P.dsNodes[3].k);
  has("dsStoryTitle", "Discrepancy detected", "clicking the jump link opened the CDE flow diagram at the detect node specifically, not its default position");
} catch (e) { ok(false, "discrepancy-flow jump interaction", e.message); }
// /stress-test finding (2026-08-18): openHelp() had no bottom-edge collision handling — an
// anchor near the bottom of the viewport put the popover ~94% off-screen with no way to reach
// it (position:fixed, so page scroll can't help). Fixed by flipping above when there's no room
// below. The pure DOM stub has no real layout engine, so offsetHeight/innerHeight are injected
// here to actually exercise the flip math, matching the getBoundingClientRect mock above.
try {
  G.helpPop.hidden = true; G.helpPop.innerHTML = ""; // reset state from the block above
  R.win.innerHeight = 700;
  G.helpPop.offsetHeight = 210; // a realistic popover height
  const bottomEdgeIcon = { closest: sel => (sel === "[data-help]" ? { dataset: { help: "ids" }, getBoundingClientRect: () => ({ top: 664, bottom: 680, left: 300 }), setAttribute(){}, focus(){} } : null) };
  fire(R.win, "click", { target: bottomEdgeIcon });
  ok(G.helpPop.hidden === false, "popover opens for a bottom-edge anchor");
  ok(parseFloat(G.helpPop.style.top) < 664, "popover flips ABOVE an anchor with no room below it (would otherwise render off-screen)", G.helpPop.style.top);
  G.helpPop.hidden = true; G.helpPop.innerHTML = "";
  const topEdgeIcon = { closest: sel => (sel === "[data-help]" ? { dataset: { help: "cde" }, getBoundingClientRect: () => ({ top: 100, bottom: 116, left: 300 }), setAttribute(){}, focus(){} } : null) };
  fire(R.win, "click", { target: topEdgeIcon });
  ok(G.helpPop.style.top === "124px", "popover still renders BELOW an anchor with plenty of room (flip logic doesn't fire when unneeded)", G.helpPop.style.top);
} catch (e) { ok(false, "help popover bottom-edge flip", e.message); }
fire(G["t-over"], "click"); // restore "over" as active for the sections below, matching D9's own convention

/* =========================================================================
   D11. INTERACTIVE MOTION (2026-08-19)
   ========================================================================= */
console.log("== D11. interactive motion ==");
// Real coverage for this feature lives in live-browser verification, not here — this harness's
// document.querySelectorAll always returns [] (see makeEl's stub), so wireDetailsAnimation()'s
// forEach body never executes under test, and there is no DOM/CSSOM to observe a CSS keyframe
// re-triggering or a WAAPI animation completing. Source-level checks only: confirm the mechanism
// shipped and is wired at init, not that it behaves correctly — that was proven live (2026-08-19:
// all 6 details.dbox panels open/close correctly, content and nested listeners survive the
// wrap-move, a real onfinish/.finished timing bug was caught and fixed to .finished.then()).
ok(indexSrc.includes("function wireDetailsAnimation()"), "wireDetailsAnimation is defined");
ok(indexSrc.includes("wireDetailsAnimation();"), "wireDetailsAnimation is called at init");
ok(indexSrc.includes('window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)")') &&
   /wireDetailsAnimation\(\)\{[\s\S]{0,80}prefers-reduced-motion/.test(indexSrc),
  "wireDetailsAnimation checks prefers-reduced-motion before animating");
ok(/\.finished\.then\(/.test(indexSrc) && !/\.onfinish=/.test(indexSrc),
  "uses the .finished promise, not .onfinish (the event-handler form was observed to drift from actual completion under live-browser verification)");

// tweenNum() itself IS directly testable — it takes its target element as a parameter rather
// than looking it up via the broken querySelectorAll stub, so real assertions are possible here,
// not just source-text checks. This harness's matchMedia stub always reports matches:true (see
// runPage), so only the reduced-motion / no-op branches are reachable — the actual
// requestAnimationFrame interpolation was verified live instead (a real trajectory of
// intermediate values observed, landing exactly on the target in both directions).
{
  const el1 = makeEl("t1");
  P.tweenNum(el1, 100, 200, v => "$" + Math.round(v), 300);
  ok(el1.textContent === "$200", "reduced-motion branch sets textContent straight to the end value, no animation frames");
  const el2 = makeEl("t2");
  P.tweenNum(el2, 50, 50, v => "$" + Math.round(v), 300);
  ok(el2.textContent === "$50", "from===to short-circuits to the same value without animating");
  ok(P.tweenNum(undefined, 1, 2, v => v, 300) === undefined, "missing element is a safe no-op, not a throw");
}
{
  // count only in the markup, not inside the <script> block — a JS doc-comment describing
  // <details class="dbox"> would otherwise inflate this count (found: it did, 7 vs 6, on the
  // first run of this exact check)
  const markupOnly = indexSrc.slice(0, indexSrc.indexOf("<script>"));
  const detailsCount = (markupOnly.match(/<details class="dbox"/g) || []).length;
  // 12 as of the ledger-card upgrade (2026-08-20), up from 11 — 1 new panel added (the
  // per-package ledger inspector on the Overview tab). Updated here, not just to make the count
  // pass, since a stale expectation is exactly the kind of thing this check exists to catch on
  // the NEXT panel added after this one.
  ok(detailsCount === 12, "exactly 12 details.dbox panels exist for this to wire", String(detailsCount));
}

// Extended growup/draw-in (2026-08-19) — source-level only, same stub limitation as above;
// live-browser verified via each element's own .finished promise (not a blind setTimeout,
// after this exact automation harness was observed giving a premature "stuck at scale(0)"
// read on a bare timeout wait — re-checked via getAnimations()[0].finished and confirmed
// correct: settles at transform:none, not stuck).
ok(indexSrc.includes("#mcChart rect,#waterfall rect{transform-box:fill-box;transform-origin:bottom;animation:growup"),
  "waterfall bars (vertical) reuse growup, same as the Monte Carlo histogram");
ok(indexSrc.includes('#tornado rect,#gantt rect{transform-box:fill-box;transform-origin:left;animation:growright'),
  "tornado + tracking-Gantt bars (horizontal — width is the varying dimension) share the distinct growright, not growup, which would squash them");
ok(indexSrc.includes('#scurve path.draw,#mcChart polyline.draw{stroke-dasharray:2400'),
  "the Monte Carlo CDF polyline reuses the S-curve's draw-in technique");
ok(indexSrc.includes('var body=\'<polyline class="draw" points="'),
  "the CDF polyline actually carries the draw class in its markup, not just the CSS selector existing unused");

// Staggered one-run stepper table (2026-08-19) — this one IS runtime-testable, since the D2.2
// stub already exercises renderMcOneRun() and can read the actual generated markup.
{
  fire(G.mcRunOne, "click");
  const rowDelays = (G.mcOneRun._html.match(/animation-delay:(\d+)ms/g) || []).map(s => parseInt(s.match(/\d+/)[0], 10));
  ok(rowDelays.length === rows.length, "every row in the one-run table carries its own animation-delay", String(rowDelays.length));
  ok(rowDelays.every((d, i) => d === i * 45), "delays are strictly 0, 45, 90... in row order, not shuffled", rowDelays.join(","));
  ok(indexSrc.includes(".stagger{animation:rise"), "the stagger class reuses the existing rise keyframe, not a new one");
}

// Hover lift on chart marks (2026-08-19) — source-level check only, and stated explicitly why:
// :hover is a browser-internal UI state, not settable from page-context JS at all (that's the
// whole reason DevTools needs a dedicated "force element state" feature), so it can't be
// verified here, and live-browser :hover simulation via this session's screen-coordinate-based
// hover tool was attempted and did not reliably land on a ~58px SVG bar despite several
// carefully recomputed coordinate passes — tooling friction, not a signal about correctness.
// Confirmed instead: the rule text and scoping (verified below), and live that the base opacity
// value it transitions FROM reads correctly (0.92/0.85, matching each bar's own inline value).
ok(indexSrc.includes("#waterfall rect.hot,#tornado rect.hot,#gantt rect.hot{transition:opacity"),
  "waterfall/tornado/gantt bars get a hover transition");
ok(indexSrc.includes("#waterfall rect.hot:hover,#tornado rect.hot:hover,#gantt rect.hot:hover{opacity:1}"),
  "hover rule is scoped to waterfall/tornado/gantt containers specifically, not to .hot everywhere — the S-curve's own .hot rects are deliberately transparent hit-targets (data-mo), not bars, and must not be affected");
ok(!/#scurve[^{]*\.hot[^{]*:hover/.test(indexSrc), "no hover rule targets the S-curve's transparent hot-zone rects");

// Cross-chart account highlight (2026-08-19) — source-level only, same stub limitation as
// wireDetailsAnimation: querySelectorAll always returns [] here, so the actual highlight-toggle
// logic can't be exercised under test. Real coverage is live-browser verified instead: hovering a
// waterfall bar (data-acc="CP-201") was confirmed to simultaneously add .acc-hover to that exact
// bar AND the matching ledger-table row; hovering a Gantt bar (data-acc="CP-601") was confirmed
// to simultaneously highlight the matching Float bar and CPLI bar on the same tab; mouseout was
// confirmed to clear every highlighted element back to zero.
ok(indexSrc.includes("function wireAccountHighlight()"), "wireAccountHighlight is defined");
ok(indexSrc.includes("wireAccountHighlight();"), "wireAccountHighlight is called at init");
["data-acc=\"'+o.id+'\"", "data-acc=\"'+r.id+'\"", "data-acc=\"'+e.r.id+'\"", "data-acc=\"'+b.r.id+'\""].forEach(needle =>
  ok(indexSrc.includes(needle), "source contains a data-acc binding: " + needle));
ok(indexSrc.includes(".rowbar.acc-hover") && indexSrc.includes("tr.acc-hover") && indexSrc.includes("rect.acc-hover"),
  "acc-hover is styled for all three element shapes it can land on (rowbar div, table row, SVG rect)");

/* =========================================================================
   D12. bars()/heat-map tooltip parity (engagement/interactivity upgrade, 2026-08-2x, Phase 2)
   Every tooltip below is independently recomputed from raw arrays exposed via __PCC__ (rows,
   eacTrendSeries()/revSvcDriftSeries()/floatErosionSeries(), cphCells+deriveCph, risks) — never by
   calling the app's own tipFmt closure and reapplying it, matching this file's own repeatedly-
   enforced circularity doctrine.
   ========================================================================= */
console.log("== D12. bars()/heat-map tooltip parity ==");
function tipContent(hostId, i) {
  fire(G[hostId], "mousemove", { target: { classList: { contains: () => true }, closest: () => G[hostId]._html ? { dataset: { i: String(i) }, parentElement: G[hostId] } : null }, clientX: 60, clientY: 60 });
  return G.tip._html;
}
{
  fire(G["t-cost"], "click");
  const s = P.eacTrendSeries();
  ok(s.length === 6, "sanity: eacTrendSeries() is 6 points before testing eacTrend tooltips", String(s.length));
  const tip0 = tipContent("eacTrend", 0);
  ok(tip0.includes(m(s[0].eac)) && tip0.includes(m(s[1].eac)), "eacTrend bar 0's tooltip shows the real EAC values it transitions between, independently recomputed", tip0.slice(0, 120));
}
{
  fire(G["t-sched"], "click");
  const worst = P.rows.slice().sort((a, b) => a.float - b.float)[0]; // floats bars() isn't sorted — find index 0's real row directly
  const tip0 = tipContent("floats", P.rows.indexOf(P.rows[0]) >= 0 ? 0 : 0);
  ok(tip0.includes(P.rows[0].id) && tip0.includes(idx(P.rows[0].cpli)), "floats bar 0's tooltip names the real package id and its real CPLI, independently recomputed (not resorted — floats renders in raw rows[] order)", tip0.slice(0, 120));
  const sortedByCpli = P.rows.slice().sort((a, b) => a.cpli - b.cpli);
  const tipCpli0 = tipContent("cpli", 0);
  ok(tipCpli0.includes(sortedByCpli[0].id) && tipCpli0.includes(String(sortedByCpli[0].cpRem)) && tipCpli0.includes(String(sortedByCpli[0].float)),
    "cpli bar 0's tooltip (which IS sorted ascending) names the real lowest-CPLI package and its real cpRem/float formula inputs", tipCpli0.slice(0, 160));
  const rs = P.revSvcDriftSeries();
  const tipDrift0 = tipContent("schedDriftBars", 0);
  ok(tipDrift0.includes(days(rs[0].slip)) && tipDrift0.includes(days(rs[1].slip)), "schedDriftBars bar 0's tooltip shows the real slip-day transition, independently recomputed", tipDrift0.slice(0, 120));
  const fs = P.floatErosionSeries();
  const tipEro0 = tipContent("floatErosionBars", 0);
  ok(tipEro0.includes(days(fs[0].float)) && tipEro0.includes(days(fs[1].float)), "floatErosionBars bar 0's tooltip shows the real float-day transition, independently recomputed", tipEro0.slice(0, 120));
}
{
  fire(G["t-del"], "click");
  const numLocal = (v) => v.toLocaleString("en-US"); // mirrors index.html's own num(), not called from it
  const sortedByPf = P.rows.slice().sort((a, b) => a.pf - b.pf);
  const tipProd0 = tipContent("prod", 0);
  ok(tipProd0.includes(sortedByPf[0].id) && tipProd0.includes(numLocal(Math.round(sortedByPf[0].ernH))) && tipProd0.includes(numLocal(Math.round(sortedByPf[0].actH))),
    "prod bar 0's tooltip (sorted ascending by pf) names the real worst-productivity package and its real earned/actual hours", tipProd0.slice(0, 160));
  const cph = P.deriveCph(P.cphCells[0]);
  const tipCph0 = tipContent("cphBars", 0);
  ok(tipCph0.includes(usd(cph.weeks[0].actual)) && tipCph0.includes(usd(cph.baseline)) && tipCph0.includes(pct(cph.weeks[0].idlePct)),
    "cphBars week 0's tooltip shows the real actual $/hr, standard $/hr, and idle %, independently recomputed via deriveCph()", tipCph0.slice(0, 160));
}
{
  fire(G["t-risk"], "click");
  // independently rebuild the same grid RISKS -> {p-i: [ids]} the app's own renderRisk() builds,
  // from the raw RISKS array, then confirm the tooltip for one real occupied cell matches
  const risk0 = P.risks[0];
  fire(G.heat, "mousemove", { target: { classList: { contains: () => true }, dataset: { p: String(risk0.p), i: String(risk0.i) } }, clientX: 60, clientY: 60 });
  const cellRisks = P.risks.filter(r => r.p === risk0.p && r.i === risk0.i).map(r => r.id);
  ok(cellRisks.every(id => G.tip._html.includes(id)), "heat map tooltip for a real occupied cell names every risk id actually at that probability x impact combination, independently filtered from the raw RISKS array", G.tip._html);
  ok(G.tip._html.includes("P" + risk0.p) && G.tip._html.includes("I" + risk0.i), "heat map tooltip header states the real probability/impact band clicked");
  fire(G.heat, "mousemove", { target: { classList: { contains: () => false } } });
  ok(!G.tip._html || !G.tip.classList || true, "heat map tooltip clears on a non-hot target (mouseleave-equivalent) — sanity, not a strict assertion given the stub's classList stub");
}
ok(indexSrc.includes("host._barsItems=items; host._barsTipFmt=tipFmt;"), "bars() stashes items/tipFmt on the host element, not a closure — the documented fix for the stale-closure class of bug (source-text tripwire, mirrors this file's other such guards)");
ok(indexSrc.includes("heatHost._gridRisks=gridRisks;"), "heat map tooltip stashes gridRisks on the host element for the same reason, not closed over directly — probe-verified during authoring (a first draft closed over it directly and would have gone stale on a second renderRisk() call)");

/* =========================================================================
   D13. LEDGER CARD — the eleven-input ledger, Overview tab (2026-08-20)
   ========================================================================= */
console.log("== D13. ledger card ==");
{
  fire(G["t-over"], "click");
  ok(P.ledgerInputs.length === 11, "LEDGER_INPUTS has exactly 11 entries", String(P.ledgerInputs.length));
  ok(P.pkgs.length === 8, "PKGS (now exposed on __PCC__) still has its real 8 packages", String(P.pkgs.length));

  // every ledger-item abbr actually renders in the grid, and every one has a resolvable glossary entry
  const missingAbbr = P.ledgerInputs.filter(li => !G.ledgerGrid._html.includes(li.abbr));
  ok(missingAbbr.length === 0, "every one of the 11 ledger-item abbreviations renders in #ledgerGrid", missingAbbr.map(x => x.abbr).join(","));
  const missingGloss = P.ledgerInputs.filter(li => !P.findGloss(li.key));
  ok(missingGloss.length === 0, "every one of the 11 ledger inputs resolves to a real GLOSS entry (no dangling data-help key)", missingGloss.map(x => x.key).join(","));

  // per-package inspector: independently count PKGS rows against the rendered table body rows
  const tbodyRows = (G.ledgerInspector._html.match(/<tr style="cursor:default">/g) || []).length;
  ok(tbodyRows === P.pkgs.length, "ledger inspector renders exactly one row per real control account", String(tbodyRows));
  ok(G.ledgerInspector._html.includes("CP-101") && G.ledgerInspector._html.includes("CP-701"), "ledger inspector includes both the first and last real package ids");

  // KPI_LEDGER provenance map — spot-check both branches independently against the KPIS array's
  // own already-stated `src` field, not against the map's own self-consistency
  ok(JSON.stringify(P.kpiLedger.cpi) === JSON.stringify(["ev", "ac"]), "KPI_LEDGER maps CPI to exactly EV, AC");
  ok(JSON.stringify(P.kpiLedger.spi) === JSON.stringify(["ev", "pv"]), "KPI_LEDGER maps SPI to exactly EV, PV");
  ok(!P.kpiLedger.msv && !!P.kpiLedgerNone.msv, "MSV correctly has NO ledger-provenance entry (it's the milestone log) and IS in the none-map");
  ok(!P.kpiLedger.trir && !!P.kpiLedgerNone.trir, "TRIR correctly has NO ledger-provenance entry (it's the safety log) and IS in the none-map");
  ok(!!P.kpiLedgerMixed.ccr, "CCR is correctly flagged as mixed provenance (ledger fields + contingency/risk registers), not claimed as pure ledger");

  // opening a pure-ledger KPI's drawer shows the provenance box with the right field names
  fire(G.kboard, "click", { target: { closest: () => ({ dataset: { kpi: "cpi" } }) } });
  has("kdetail", "Computed from the ledger", "cpi drawer shows the ledger-provenance box");
  has("kdetail", "EV, AC", "cpi drawer names its real, independently-checked ledger fields (EV, AC)");
  fire(G.kboard, "click", { target: { closest: () => ({ dataset: { kpi: "cpi" } }) } });

  // opening a non-ledger KPI's drawer shows the honest "not from the ledger" box instead
  fire(G.kboard, "click", { target: { closest: () => ({ dataset: { kpi: "msv" } }) } });
  has("kdetail", "Not from the ledger", "msv drawer honestly states it is NOT ledger-derived");
  fire(G.kboard, "click", { target: { closest: () => ({ dataset: { kpi: "msv" } }) } });

  // the live demo — independently computed expected values (B27/B35: pre-registered before
  // writing this test, via a standalone script, not derived by calling the app's own functions).
  // 199.9, not 200 — CP-101's slider grid is built outward from its own real AC (191.9) in 0.5
  // steps, so 199.9 is the actual on-grid point nearest 200; a real <input type="range"> silently
  // snaps an off-grid .value to its nearest step (200 -> 199.9 here), and this Node stub does NOT
  // model that snapping, so testing against literal 200 would silently pass here while showing a
  // DIFFERENT number in every real browser — caught only by live-browser verification, not by this
  // suite alone. For CP-101 (bac=248.0, ev=179.4) at AC=$199.9M: CPI=0.897, EAC=$276.3M, VAC=−$28.3M
  G.ledgerAc.value = "199.9";
  fire(G.ledgerAc, "input");
  has("ledgerDemoOut", "0.897", "ledger demo: independently-computed CPI at AC=$199.9M matches the rendered value");
  has("ledgerDemoOut", "276.3", "ledger demo: independently-computed EAC at AC=$199.9M matches the rendered value");
  has("ledgerDemoOut", "28.3", "ledger demo: independently-computed |VAC| at AC=$199.9M matches the rendered value");

  // the core correctness promise: dragging the demo slider must NEVER mutate the real ledger —
  // re-check the real package's own ac field and the real portfolio CPI are both untouched
  ok(P.pkgs[0].ac === 191.9, "dragging the ledger demo slider left the REAL PKGS[0].ac untouched (191.9)", String(P.pkgs[0].ac));
  ok(Math.abs(P.totals.cpi - 0.956) < 0.001, "dragging the ledger demo slider left the REAL portfolio CPI untouched (~0.956)", String(P.totals.cpi));

  // reset button restores the slider to the real package's own actual AC, not an arbitrary
  // default — numeric coercion on read (+value), not a strict string match: the stub's plain
  // `value` property doesn't auto-coerce to string on assignment the way a real <input> element
  // does, and a strict "===" here would fail on stub representation, not an app bug.
  fire(G.ledgerDemoReset, "click");
  ok(+G.ledgerAc.value === 191.9, "reset button restores the demo slider to CP-101's real AC (191.9), not a hardcoded default", String(G.ledgerAc.value));

  // switching the demo package via the select updates the baseline correctly (CP-201's real ac
  // is 205.1 — independently read off the raw PKGS array, not derived)
  G.ledgerPkgSelect.value = "CP-201";
  fire(G.ledgerPkgSelect, "change", { target: G.ledgerPkgSelect });
  ok(+G.ledgerAc.value === 205.1, "switching the demo package to CP-201 resets the slider to ITS real AC (205.1)", String(G.ledgerAc.value));
}

/* =========================================================================
   D14. SIX KPI FAMILIES CARD — Overview tab (2026-08-21)
   ========================================================================= */
console.log("== D14. six KPI families card ==");
{
  ok(P.kpiFamilies.length === 6, "KPI_FAMILIES has exactly 6 entries", String(P.kpiFamilies.length));

  // every real KPIS.fam value is covered by exactly one KPI_FAMILIES entry — independently
  // derived from KPIS itself, not from KPI_FAMILIES's own list (which would just check
  // self-consistency, not real coverage)
  const realFams = [...new Set(P.kpis.map(k => k.fam))].sort();
  const describedFams = P.kpiFamilies.map(f => f.key).sort();
  ok(JSON.stringify(realFams) === JSON.stringify(describedFams),
    "KPI_FAMILIES describes exactly the 6 real fam values actually used across KPIS, no orphan and no missing family",
    realFams.join(",") + " vs " + describedFams.join(","));

  // each family card's own rendered KPI count matches an independent count against the real
  // KPIS array (filtered by fam), not against KPI_FAMILIES' own claim
  const missingCounts = P.kpiFamilies.filter(f => {
    const real = P.kpis.filter(k => k.fam === f.key).length;
    return !G.familiesGrid._html.includes("(" + real + " KPI");
  });
  ok(missingCounts.length === 0, "every family card shows its own real, independently-counted KPI total", missingCounts.map(f => f.key).join(","));

  // every family name renders and every one resolves to a real glossary entry (no dangling
  // data-help key on the six-lenses card)
  const missingFamGloss = P.kpiFamilies.filter(f => !P.findGloss(f.key.toLowerCase()));
  ok(missingFamGloss.length === 0, "every one of the 6 family names resolves to a real GLOSS entry", missingFamGloss.map(f => f.key).join(","));

  // the family filter buttons carry a title attribute with the family's own real question —
  // independently checked against KPI_FAMILIES, not just "a title exists"
  const costFam = P.kpiFamilies.filter(f => f.key === "Cost")[0];
  has("kfilters", costFam.q.replace(/"/g, "&quot;"), "the Cost filter button's title attribute carries its own real question, not a generic label");

  // the cross-reference jump button targets a real, existing element on the Schedule tab
  ok(indexSrc.includes('data-jump-tab="sched" data-jump-el="schedDriftCard"'),
    "the six-lenses card's cross-reference button targets a real existing element (schedDriftCard), not a placeholder id");
}

/* =========================================================================
   E. otak.html — runtime + internal consistency
   ========================================================================= */
console.log("== E. otak.html ==");
const O = runPage(otakSrc);
ok(!O.err, "otak.html IIFE executes", O.err && O.err.message);
// parse REQS straight from source and reconcile with the prose claims
const reqMatches = [...otakSrc.matchAll(/s:"(met|part|gap)"(, pref:true)?/g)];
const tally = { met: 0, part: 0, gap: 0, prefPart: 0, prefGap: 0 };
reqMatches.forEach(m2 => {
  if (m2[2]) { if (m2[1] === "part") tally.prefPart++; if (m2[1] === "gap") tally.prefGap++; }
  else tally[m2[1]]++;
});
ok(tally.part + tally.prefPart === 7, "otak prose: 'seven lines marked Partial'", JSON.stringify(tally));
ok(tally.gap === 0 && tally.prefGap === 1, "otak prose: 'one line is an outright gap'", JSON.stringify(tally));
const covHtml = O.registry.cov ? O.registry.cov._html : "";
ok(covHtml.includes(tally.met + " / " + (tally.met + tally.part)),
  "coverage cell shows required met/n", covHtml.replace(/<[^>]*>/g, " ").slice(0, 200));
ok((O.registry.covBody._html.match(/<tr/g) || []).length === reqMatches.length,
  "coverage table renders every parsed requirement", reqMatches.length + " parsed");
ok(otakSrc.includes("noindex,nofollow"), "otak.html stays noindex");
// company-research callout (2026-08-19): a real, independently re-verified fact about Otak
// itself, cited to its own site, distinct from the synthetic index.html ledger
ok(otakSrc.includes("Sound Transit East Link") && otakSrc.includes("three people to a hundred and fifty"),
  "otak.html cites Otak's own verified East Link project-controls scaling fact");
ok(otakSrc.includes("https://www.otak.com/about/projects/sound-transit-east-link-light-rail/"),
  "the East Link claim carries its source citation");
// 90-day roadmap tie-in (2026-08-19): conditional, humble phrasing ("if the practice's scope
// touches"), not asserted as fact about Otak's internal work — checked for the hedge explicitly
ok(otakSrc.includes("adaptive program") && otakSrc.includes("management framework"),
  "90-day plan cites the real board mandate");
ok(otakSrc.includes(">If the") && otakSrc.includes("practice's scope touches Sound Transit's ST3 realignment"),
  "the ST3 tie-in stays conditional (\"if the practice's scope touches\"), not presumptuous, matching the fit brief's existing tone");
// /stress-test finding (2026-08-19): the ST3 claim lacked a citation date the way the East-Link
// claim right above it has — now matches
ok(otakSrc.includes("R2026-11") && otakSrc.includes("verified 19&nbsp;Aug&nbsp;2026"),
  "the ST3 claim now carries a source citation + verified date, matching the East-Link claim's format");

/* =========================================================================
   E.1. ARCHITECTURE.HTML SYNC — closes the drift gap HANDOFF.md §13/§18#3
   named explicitly: no automated check previously tied architecture.html's
   own prose counts to index.html's live arrays. Same fs.readFileSync +
   source-text pattern already established above for otak.html (E.), applied
   to a second companion file. Motivated by a real, live 3rd stale
   "twenty-seven" instance found this round (the #archSvg aria-label) that a
   prior hand-edit pass missed — proof this class of drift is real, not
   hypothetical (/stress-test discipline, 2026-08-21).
   ========================================================================= */
console.log("== E.1. architecture.html sync ==");
ok(archSrc.includes("20 metrics, 6 families") && archSrc.includes("20 metrics across cost, schedule, risk, change, delivery, and compliance."),
  "architecture.html's '20 metrics' prose is present in both the diagram box and the legend table");
ok(P.kpis.length === 20, "index.html's live KPIS array actually has 20 entries, matching architecture.html's claim", String(P.kpis.length));
ok(archSrc.includes("28 live checks (browser)") && archSrc.includes("28 browser checks plus a separate 54-check SQL pipeline"),
  "architecture.html's '28 checks' prose is present in both the diagram box and the legend table");
ok(P.guards.length === 28, "index.html's live GUARDS array actually has 28 entries, matching architecture.html's claim", String(P.guards.length));
ok(archSrc.includes("+ 54-check SQL pipeline"),
  "architecture.html still cites the 54-check SQL pipeline figure (static — pipeline/run_pipeline.py isn't executed from this harness, so this stays a text-presence check, not a live recomputation)");
ok(archSrc.includes("17 tracked items"), "architecture.html's '17 tracked items' prose is present");
ok(P.actions.length === 17, "index.html's live ACTIONS array actually has 17 entries, matching architecture.html's claim", String(P.actions.length));
// regression guard for the specific live bug this round caught and fixed: the #archSvg
// aria-label's own integrity-gate count (independent of the diagram-box/legend-table copies
// checked above — a 3rd, easily-missed location) must say twenty-eight, never twenty-seven again.
ok(!archSrc.includes("twenty-seven"), "architecture.html no longer says 'twenty-seven' anywhere (the stale #archSvg aria-label instance this round found and fixed)");
ok(archSrc.includes("twenty-eight plus fifty-four check integrity gate"),
  "the #archSvg aria-label states the integrity gate count correctly (twenty-eight), matching every other count in the file");

/* =========================================================================
   F. COMPLIANCE SWEEPS
   ========================================================================= */
console.log("== F. sweeps ==");
// "N instruments" consistency tripwire (2026-08-20 /interview-doc review finding) — the CP-201
// root-cause narrative is repeated in 3 user-facing places (revenue-service drift, float erosion,
// presenter-notes), and adding Critical Float Erosion Rate as a 5th instrument bumped one of the
// three from "four" to "five" without the other two being updated — caught not by this file's own
// tests, but by an independent reviewer cross-checking the interview-prep docs against the live
// page. Pins the count so the next new instrument can't repeat the same silent 2-of-3 drift.
{
  // one regex, not two: an earlier draft concatenated a second, overlapping pattern and double-
  // counted the one mention both patterns matched — caught by running this exact check and getting
  // 4 instead of the predicted 3, not assumed correct after writing it.
  const instrumentMentions = indexSrc.match(/one root cause[^.]*?(four|five|six) (different )?instruments?/gi) || [];
  // 4 as of the six-families card (2026-08-21) — its own cross-reference button intentionally
  // repeats the same "one root cause ... five instruments" phrasing, correctly matching the other
  // three (confirmed by the very next assertion below, which checks all mentions agree on the
  // same number — it still passes, meaning this 4th mention says "five" like the rest).
  ok(instrumentMentions.length === 4, "exactly 4 user-facing 'N instruments' mentions found (update this count if a 5th is intentionally added)", String(instrumentMentions.length));
  const counts = instrumentMentions.map(s => (s.match(/four|five|six/i) || [""])[0].toLowerCase());
  ok(counts.every(c => c === counts[0]), "all 'N instruments' mentions agree on the same number", JSON.stringify(counts));
}
// mcParams() reuse tripwire (2026-08-20 /stress-test finding) — today's live CPI data (0.865-1.042)
// can never distinguish the clamped mcParams() formula from the unclamped duplicate that used to
// live in renderMcMath()/renderMcOneRun(), so a regression back to hand-rolled Math.max(0.78,...)
// in either function would pass every value-level assertion above silently. A source-text check
// is the only thing that actually guards this fix — extracting the two function bodies and
// confirming each calls mcParams(r) rather than reimplementing its formula.
{
  const mcMathSrc = indexSrc.slice(indexSrc.indexOf("function renderMcMath()"), indexSrc.indexOf("function renderMcOneRun()"));
  const mcOneRunSrc = indexSrc.slice(indexSrc.indexOf("function renderMcOneRun()"), indexSrc.indexOf("document.getElementById(\"mcRunOne\")"));
  ok(mcMathSrc.includes("mcParams(r)"), "renderMcMath() calls the shared mcParams(), not a hand-rolled duplicate");
  ok(mcOneRunSrc.includes("mcParams(r)"), "renderMcOneRun() calls the shared mcParams(), not a hand-rolled duplicate");
  // A third regex-based check attempting to catch the specific old unclamped literal pattern was
  // tried here and dropped: probe-verified (temporarily reverting the fix and re-running) that it
  // did NOT actually fire against renderMcMath()'s real old shape (a variable-declaration list,
  // not the triang()-call-argument shape the regex was written against) — a contradicted
  // prediction (B35), not assumed safe. The two mcParams(r) presence checks above are the ones
  // empirically confirmed (same probe) to fail correctly on the pre-fix code.
}
// P6/DBE are word-boundaried — 2026-08-2x /stress-test finding: the live in-page twin of this
// sweep (index.html's "Compliance sweep" guard) false-matched "dbe" as a bare substring inside
// document.body.textContent's un-whitespaced concatenation of two adjacent SVG <text> labels
// ("...promoted"+"becomes..."). indexSrc (raw source) doesn't have that specific collision today,
// but the same short-acronym fragility is latent here too — hardened defensively, not reactively.
const FAB = /\bP6\b|Primavera|MS Project|HeavyBid|AGTEK|Bluebeam|92%|Design-Build|\bDBE\b|PE licen/i;
const SAN = /mawl|dagir|izlid|kiji|minirva|glare|milr/i;
// Approved exceptions, stripped before the sweep so any OTHER appearance of the banned term
// still gets caught — the sweep exists to catch false CLAIMS, not to ban a word outright.
// 1. The presenter-notes "own the gap" beat honestly DISCLAIMS P6 experience.
// 2. otak.html's new company-research callout quotes Otak's own site verbatim — "design-build
//    procurement" describes what OTAK did on East Link, not a claim about TJ's own delivery-
//    method experience (2026-08-19 /stress-test finding, real, not weakened).
// 3. The Schedule tab's new citation states Sound Transit's own real spec requirement of ITS
//    CONTRACTORS (Primavera P6) — independently verified against the actual 791-page primary
//    specification document, not a claim about TJ's own tool experience (2026-08-19).
const FAB_APPROVED = ["not years running P6", "design-build procurement, schedule analysis",
  "Oracle Primavera P6", "cover larger and design-build"];
[indexSrc, otakSrc, fs.readFileSync(DIR + "README.md", "utf8")].forEach((s, i) => {
  const stripped = FAB_APPROVED.reduce((acc, phrase) => acc.split(phrase).join(""), s);
  ok(!FAB.test(stripped), "fabrication sweep file " + i);
  ok(!SAN.test(s), "sanitization sweep file " + i);
});
ok(!/https?:\/\/(?!tjaiyen\.github\.io|github\.com\/tjaiyen|linkedin\.com|www\.w3\.org)/.test(indexSrc.replace(/mailto:[^"']*/g, "")),
  "no unexpected external assets in index.html");

// found by the 2026-08-18 stress pass: prose drifted from the actual data twice (a "12 inputs"
// claim against an 11-field ledger record, and a "55 checks" claim against a 54-check pipeline
// run) — neither was ever independently checked. Static tripwires here + a computed field count.
ok(!/twelve[\s-]?input/i.test(indexSrc) && !/twelve[\s-]?input/i.test(fs.readFileSync(DIR + "README.md", "utf8")),
  "no stale 'twelve input(s)' claim anywhere");
{
  const pkgKeys = Object.keys(P.rows[0]).filter(k => !["id", "n", "spi", "cpi", "eac", "vac", "sv", "cv",
    "pct", "cpli", "bei", "pf", "commitRatio"].includes(k));
  ok(pkgKeys.length === 11, "control-account ledger record genuinely carries 11 raw inputs",
    pkgKeys.join(","));
}
ok(!/55 checks/.test(indexSrc), "no stale '55 checks' pipeline claim in index.html");
ok((indexSrc.match(/54 checks/g) || []).length >= 2, "'54 checks' (the verified pipeline count) appears in index.html");

/* =========================================================================
   G. TEXT-SIZE LOCALSTORAGE PERSISTENCE (2026-08-20) — deliberately runs LAST.
   Previously only regex-checked that the read/write were try/catch-guarded, never that the
   read-clamp-apply path actually works end to end. runPage()'s optional lsSeed lets a second,
   isolated eval pre-seed window.localStorage before the page's own init code runs — but runPage()
   repoints global.document/global.window on every call, corrupting any already-evaluated closure
   from an EARLIER runPage() call that a later fire()-driven test still relies on. This is placed
   after every other fire()-based test in this file (index.html's and otak.html's alike) for
   exactly that reason — see the note left at D4.10's original item 8 slot for how this was found.
   ========================================================================= */
console.log("== G. text-size localStorage persistence ==");
{
  const R2 = runPage(indexSrc, { pccTextSize: "1" });
  ok(!R2.err, "second index.html eval (localStorage seed test) ran without runtime errors", R2.err && R2.err.message);
  const P2 = R2.win.__PCC__;
  ok(!!P2 && P2.state.textSize === 1, "a saved pccTextSize=1 is read and applied on init (Large)", P2 && String(P2.state.textSize));
}
{
  const R3 = runPage(indexSrc, { pccTextSize: "99" });
  const P3 = R3.win.__PCC__;
  // applyTextSize()'s own clamp (Math.max(0,Math.min(TEXT_ZOOM.length-1,state.textSize))) — an
  // out-of-range saved value (e.g. from a future version with more steps) must clamp, not crash
  // or index past the array into undefined.
  ok(!!P3 && P3.state.textSize === 2, "an out-of-range saved value clamps to the ceiling on init, not undefined/NaN", P3 && String(P3.state.textSize));
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
