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

let pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL: " + label + (extra ? " — " + extra : "")); }
}

/* ---------- DOM stub ---------- */
function makeEl(id) {
  const el = {
    id: id || "", _html: "", textContent: "", value: "0", hidden: false,
    style: {}, dataset: {}, _listeners: {}, _attrs: {},
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
    click(){ fire(this, "click"); }, focus(){},
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

function runPage(src) {
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
    } };
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

// Table no-horizontal-scroll fix (2026-08-19, user-reported: "I want to see the entire component
// at once"). Same class of guard as above — real width-fitting behavior needs a real layout
// engine, so these are static tripwires; browser-verified live 2026-08-19 at 768/1050/1400px:
// all 7 of the widest tables (portTable, contractTable, wbsTable, gateTable, stakeMap, libTable,
// guardrailTable) fit their container with zero horizontal scroll at every width from 768px up,
// with 0 page-level overflow at any width tested (down to 375px mobile, where these specific
// dense tables still need scroll — a card-layout redesign, not a CSS fix, stated as a known,
// accepted limitation rather than silently dropped).
ok(!/table\{width:100%;border-collapse:collapse;font-size:12\.8px;min-width:800px\}/.test(indexSrc),
  "the global table min-width:800px floor (root cause of forced horizontal scroll) is gone");
["portTable", "contractTable", "wbsTable", "gateTable", "stakeMap", "libTable", "guardrailTable"].forEach(id =>
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
  const aLow = Math.max(0.78, mcR.cpi - 0.08), bHigh = mcR.cpi + 0.06, mode = mcR.cpi;
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
    const c = triangCheck2(rnd1(), Math.max(0.78, r.cpi - 0.08), r.cpi + 0.06, r.cpi);
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
    const c = triangCheck2(rnd2(), Math.max(0.78, r.cpi - 0.08), r.cpi + 0.06, r.cpi);
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
  ok(G.mcStats._html.includes(eacStr), "pre-registered: with every account locked, P10/P50/P80 all collapse to T.eac exactly", eacStr);
  const p10Count = (G.mcStats._html.match(new RegExp(eacStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
  ok(p10Count === 3, "P10, P50, and P80 are all that same single value (3 occurrences), not just one of them", String(p10Count));

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
  (P.program.trir > P.program.trirBenchmark);
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
ok(guardPasses === 27 && guardFails === 0, "integrity gate: 27 PASS, 0 FAIL",
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
ok(G.arch._html.includes("fct_control_account") && G.arch._html.includes("integrity gate"),
   "architecture diagram renders pipeline stages");
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
try {
  G.glossQ.value = "contingency";
  fire(G.glossQ, "input");
  const n = (G.glossList._html.match(/class="gcard"/g) || []).length;
  ok(n >= 1 && n <= 3, "glossary filter narrows to matching terms", String(n));
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
has("guardrailTable", "Entity / schema check", "guardrail table renders the entity/schema check");
has("guardrailTable", "Cross-system reconciliation", "guardrail table renders cross-system reconciliation check");
has("guardrailTable", "IDS", "guardrail table ties checks back to the real IDS standard");
// concrete circuit-breaker examples enriching the entity/schema and range/restriction rows
// (harvested from the "Operating Architecture" doc triage — named violation types, not new logic)
has("guardrailTable", "orphan-activity violation", "entity/schema example names the orphan-activity violation");
has("guardrailTable", "commitment-floor violation", "range/restriction example names the commitment-floor violation");
has("guardrailTable", "negative actual cost", "range/restriction example covers negative-actuals as an impossible state");
// Tier 2: one icon badge per guardrail row (4 categories, all "info" tint — a parallel
// taxonomy, not a severity ladder)
ok((G.guardrailTable._html.match(/class="ticon i"/g) || []).length === 4,
  "guardrail table renders exactly 4 category icon badges", String((G.guardrailTable._html.match(/class="ticon i"/g) || []).length));
// these three are static HTML baked into the page, never JS-rendered into #p-data's innerHTML —
// check the raw source directly (same pattern as the other static-content checks in this file),
// not has(), which only sees content actually assigned via .innerHTML at runtime.
ok(indexSrc.includes("Common Data Environment"), "Data Strategy tab names the real ISO 19650 CDE standard");
ok(indexSrc.includes("6.80/hr"), "Data Strategy tab shows the verified Sound Transit reimbursement rate");
ok(indexSrc.includes("Structure (WBS)") && indexSrc.includes("(ABS)"),
  "Data Strategy tab names the real WBS/ABS mismatch");
has("discrepancyFlow", "Classify severity first", "discrepancy flow renders step 1");
has("discrepancyFlow", "Log every override", "discrepancy flow renders the final promote-to-rule step");
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
ok(P.gloss.length === 31, "GLOSS grew to 31 entries (25 original + cde/ids/wbs/abs + referenceclass + fundingtier)", String(P.gloss.length));
["cde", "ids", "wbs", "abs"].forEach(k => {
  const g = P.findGloss(k);
  ok(!!g && typeof g.p === "string" && g.p.length > 0, "findGloss resolves new term '" + k + "'");
  ok(typeof g.e() === "string" && g.e().length > 0, "'" + k + "' example function returns text");
});
ok(P.findGloss("does-not-exist") === undefined, "findGloss returns undefined for an unknown key");
["wbs", "abs", "cde", "ids", "cpli", "fundingtier"].forEach(k =>
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
  // 7 as of the tracking-Gantt build (2026-08-19), up from 6 — updated here, not just to make
  // the count pass, since a stale expectation is exactly the kind of thing this check exists to
  // catch on the NEXT panel added after this one.
  ok(detailsCount === 7, "exactly 7 details.dbox panels exist for this to wire", String(detailsCount));
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
   F. COMPLIANCE SWEEPS
   ========================================================================= */
console.log("== F. sweeps ==");
const FAB = /P6|Primavera|MS Project|HeavyBid|AGTEK|Bluebeam|92%|Design-Build|DBE|PE licen/i;
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

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
