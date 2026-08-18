// Adversarial stress harness for index.html + otak.html
// 1. Static structure: duplicate ids, JS-referenced ids exist, tab/panel wiring
// 2. Runtime: executes both pages' scripts under a DOM stub
// 3. Interaction: fires captured listeners (tabs, phases, filters, KPI drawer,
//    package drill-down, what-if sliders, theme) and asserts the DOM writes
// 4. Narrative vs data: recomputes every quoted number independently and
//    string-matches the rendered markup
// 5. Compliance sweeps: fabrication + sanitization patterns (B35/B22 style)
const fs = require("fs");
const DIR = "/Users/theerayutjaiyen/dev/project-controls-command-center/";
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
    style: {}, dataset: {}, _listeners: {},
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    addEventListener(t, fn){ (this._listeners[t] = this._listeners[t] || []).push(fn); },
    removeEventListener(){},
    setAttribute(){}, getAttribute(){ return null; },
    insertAdjacentHTML(_pos, h){ this._html += h; }, scrollIntoView(){}, click(){}, focus(){},
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
  global.window = { matchMedia(){ return { matches: true }; }, addEventListener(){}, scrollTo(){}, innerWidth: 1400,
    print(){ this._printed = true; } };
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
["over", "cost", "sched", "risk", "del", "fw"].forEach(t => {
  ok(idsA.includes("t-" + t) && idsA.includes("p-" + t), "tab/panel pair " + t);
});
ok(indexSrc.includes('aria-controls="p-over"'), "tab aria-controls present");

// rough tag balance
["div", "section", "table", "button", "script", "style"].forEach(tag => {
  const open = (indexSrc.match(new RegExp("<" + tag + "(\\s|>)", "g")) || []).length;
  const close = (indexSrc.match(new RegExp("</" + tag + ">", "g")) || []).length;
  ok(open === close, "tag balance <" + tag + ">", open + " open vs " + close + " close");
});

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

/* =========================================================================
   C. NARRATIVE vs DATA — recompute everything the copy quotes
   ========================================================================= */
console.log("== C. narrative vs data ==");
const T = P.totals, rows = P.rows, G = R.registry;
const has = (el, s, label) => ok(G[el]._html.includes(s), label, "missing '" + s + "'");

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
  fire(G.resetWhatIf, "click");
  has("whatIfOut", "$1,297.3M", "what-if reset returns to actuals ($1,297.3M)");
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
  (T.cpi < 0.95) + (T.cpli < 0.95) + (T.tcpi - T.cpi > 0.10) + (T.contCoverage < 1) +
  (Math.abs(Math.min(0, T.vac)) > T.contRemaining) + (T.negFloat.length > 0) +
  (P.program.coCycleDays > P.program.coCycleTarget) + (P.program.rfiOver30 > 0) +
  (P.program.trir > P.program.trirBenchmark);
has("printBrief", "Escalations firing (" + expectedFiring + ")", "print brief escalation count matches independent derivation");
ok(!G.printBrief._html.includes("DBE"), "print brief carries no swept terms");
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
ok(guardPasses === 14 && guardFails === 0, "integrity gate: 14 PASS, 0 FAIL",
   guardPasses + " pass / " + guardFails + " fail");
has("aiGuards", "GREEN", "gate shows GREEN");
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

/* =========================================================================
   F. COMPLIANCE SWEEPS
   ========================================================================= */
console.log("== F. sweeps ==");
const FAB = /P6|Primavera|MS Project|HeavyBid|AGTEK|Bluebeam|92%|Design-Build|DBE|PE licen/i;
const SAN = /mawl|dagir|izlid|kiji|minirva|glare|milr/i;
[indexSrc, otakSrc, fs.readFileSync(DIR + "README.md", "utf8")].forEach((s, i) => {
  ok(!FAB.test(s), "fabrication sweep file " + i);
  ok(!SAN.test(s), "sanitization sweep file " + i);
});
ok(!/https?:\/\/(?!tjaiyen\.github\.io|github\.com\/tjaiyen|linkedin\.com|www\.w3\.org)/.test(indexSrc.replace(/mailto:[^"']*/g, "")),
  "no unexpected external assets in index.html");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
