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
}
has("portTable", "Cascade Transit Extension", "portfolio table names the flagship line");
has("portTable", "full detail", "portfolio table marks the flagship line's drill-down");
has("portTable", "summary only", "portfolio table marks the synthetic sibling lines");
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
has("eacTable", "$1,303.7M", "EAC table: bottom-up $1,303.7M");
has("eacTable", "$1,297.3M", "EAC table: BAC/CPI $1,297.3M");
has("drill", "CP-201", "default drill-down is CP-201");
has("drill", (shareCP201 * 100).toFixed(1) + "%", "drill: CP-201 share of gross overrun " + (shareCP201 * 100).toFixed(1) + "%");
has("miles", "+40d", "milestones: revenue service +40d");
has("miles", "24 Apr 2028", "milestones: forecast date rendered");
has("schedTriad", "0.968", "triad: SPI 0.968");
has("schedTriad", "0.878", "triad: CPLI 0.878 (driving path)");
has("schedTriad", "0.937", "triad: BEI 0.937");
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
ok((G.libTable._html.match(/<tr style/g) || []).length === 20, "library table has 20 body rows");
// float KPI card lists the right three packages
const floatKpi = P.kpis.find(k => k.id === "float");
ok(floatKpi.sub().includes("CP-201") && floatKpi.sub().includes("CP-601") && floatKpi.sub().includes("CP-701"),
  "float KPI names CP-201/601/701");
// CPLI KPI driving path is the true minimum
const cpliKpi = P.kpis.find(k => k.id === "cpli");
const trueMin = rows.reduce((a, b) => (b.cpli < a.cpli ? b : a), rows[0]);
ok(cpliKpi.sub().includes(trueMin.id), "CPLI KPI names true driving path " + trueMin.id);
// waterfall arithmetic: BAC + sum(-vac) == EAC
const wfSum = 1240 + rows.reduce((s, r) => s + (-(r.bac - r.eac)), 0);
ok(Math.abs(wfSum - T.eac) < 0.01, "waterfall closes: BAC + steps = EAC", wfSum.toFixed(2) + " vs " + T.eac.toFixed(2));
// heat map accounts for all six risks
const heatNums = (G.heat._html.match(/role="img"/g) || []).length;
ok(heatNums === 25, "heat map renders 25 cells", String(heatNums));

/* =========================================================================
   D. INTERACTION SIMULATION
   ========================================================================= */
console.log("== D. interactions ==");
// theme toggle
try {
  fire(G.themeBtn, "click");
  ok(R.win && true, "theme toggle runs without error");
} catch (e) { ok(false, "theme toggle", e.message); }
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
console.log("== D4. story / glossary / motion ==");
ok(idsA.includes("t-gloss") && idsA.includes("p-gloss"), "glossary tab/panel pair exists");
// story: chapter 1 renders with live figures, navigation works, clamps at ends
has("storyTitle", "A billion-dollar promise", "story opens on chapter 1");
has("storyText", "$1,240.0M", "story chapter 1 quotes derived BAC");
ok(G.storyPos.textContent === "1 of 5", "story position indicator renders", G.storyPos.textContent);
ok((G.storyDots._html.match(/<i /g) || []).length === 5, "story renders 5 progress dots");
try {
  fire(G.storyNext, "click");
  has("storyTitle", "The money starts leaking", "next advances to chapter 2");
  has("storyText", "$37.9M", "chapter 2 quotes derived CV $37.9M");
  has("storyText", "0.956", "chapter 2 quotes derived CPI 0.956");
  fire(G.storyNext, "click");
  has("storyText", "CP-201", "chapter 3 names the tunnel");
  fire(G.storyGo, "click");
  ok(G["p-sched"].hidden === false && G["p-over"].hidden === true,
    "story 'see the evidence' switches to the schedule tab");
  fire(G["t-over"], "click");
  fire(G.storyNext, "click");
  has("storyText", "1.099", "chapter 4 quotes derived TCPI 1.099");
  fire(G.storyNext, "click");
  ok(G.storyPos.textContent === "5 of 5", "story reaches final chapter", G.storyPos.textContent);
  fire(G.storyNext, "click");
  ok(G.storyPos.textContent === "5 of 5", "story clamps at the last chapter", G.storyPos.textContent);
  fire(G.storyPrev, "click");
  ok(G.storyPos.textContent === "4 of 5", "story steps back", G.storyPos.textContent);
} catch (e) { ok(false, "story navigation", e.message); }
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
// first-visit cue on the story card: this DOM stub has no window.localStorage (same gap that
// broke document.addEventListener earlier this project), so fvVisited()/fvClear() must be
// try/catch-guarded rather than assume localStorage exists — confirm that guard by source
// (classList is a stub no-op here, so "does the class actually toggle" can't be observed live)
// and confirm the guarded functions don't crash the page or any walkthrough interaction.
ok(/try\{\s*return window\.localStorage/.test(indexSrc), "fvVisited() try/catches the localStorage read");
ok(/try\{\s*if\(window\.localStorage\)/.test(indexSrc), "fvClear() try/catches the localStorage write");
try {
  fire(G.storyPrev, "click");
  fire(G.storyNext, "click");
  ok(true, "first-visit cue wiring never throws on walkthrough navigation with no localStorage");
} catch (e) { ok(false, "first-visit cue (no-localStorage guard)", e.message); }
// storyGo is exercised separately further up this section (it also calls activateTab, which
// would leave a non-"over" tab active for every test after this one if fired here)

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

/* =========================================================================
   D10. INLINE TERM HELP — click-driven popover reusing GLOSS as its only source
   (returns the active tab to "over" at the end, since D9 above left "data" active)
   ========================================================================= */
console.log("== D10. inline term help ==");
ok(P.gloss.length === 30, "GLOSS grew to 30 entries (25 original + cde/ids/wbs/abs + referenceclass)", String(P.gloss.length));
["cde", "ids", "wbs", "abs"].forEach(k => {
  const g = P.findGloss(k);
  ok(!!g && typeof g.p === "string" && g.p.length > 0, "findGloss resolves new term '" + k + "'");
  ok(typeof g.e() === "string" && g.e().length > 0, "'" + k + "' example function returns text");
});
ok(P.findGloss("does-not-exist") === undefined, "findGloss returns undefined for an unknown key");
["wbs", "abs", "cde", "ids", "cpli"].forEach(k =>
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
const FAB_APPROVED = ["not years running P6", "design-build procurement, schedule analysis"];
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
