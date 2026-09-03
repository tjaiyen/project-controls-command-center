/* Tie-out harness for facade.html.
 *
 * Same discipline as verify.cjs: stub the DOM, execute the page's own script, then
 * RE-DERIVE every headline figure from the raw ledger literals rather than reading the
 * computed values back. Reading a value back only proves it was stored.
 *
 *   node verify-facade.cjs
 */
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, 'facade.html'), 'utf8');
const script = src.match(/<script>([\s\S]*?)<\/script>/)[1];

let fail = 0;
const ok = (c, label, extra) => {
  console.log((c ? '  ok   ' : '  FAIL ') + label + (extra ? '  [' + extra + ']' : ''));
  if (!c) fail++;
};
const near = (a, b, tol) => Math.abs(a - b) < (tol === undefined ? 1e-6 : tol);

/* ---- DOM stub ---------------------------------------------------------------------- */
function makeEl(id){
  return {
    id, innerHTML:'', hidden:false, dataset:{}, attrs:{}, className:'', style:{}, textContent:'',
    setAttribute(k,v){ this.attrs[k]=v; }, getAttribute(k){ return this.attrs[k]; },
    addEventListener(){}, querySelectorAll(){ return []; }, querySelector(){ return null; },
    closest(){ return null; }, focus(){}
  };
}
const els = {};
const get = id => (els[id] = els[id] || makeEl(id));
global.document = {
  documentElement: makeEl('html'),
  getElementById: get,
  querySelector: sel => get(sel),
  querySelectorAll: () => [],
  addEventListener(){}
};
global.window = { matchMedia: () => ({ matches:true }) };
// Feature #18 (deep-link hash routing) reads/writes location.hash and calls history.replaceState --
// neither exists in plain Node, so this stub (not a real browser) needs its own minimal Location/
// History, same reasoning as the document/window stubs above.
global.location = { hash: '', pathname: '/facade.html', search: '' };
global.history = { replaceState(_s, _t, url){ var h = String(url).indexOf('#'); global.location.hash = h === -1 ? '' : String(url).slice(h); } };

eval(script);
const F = global.window.__FACADE__;
const MC_LEN = 10000;
const { PROGRAM, ZONES, WEEKS, R, T, EACS, GATES, SHOP_LADDER, FIELD_LADDER } = F;

console.log('\n== A. Ledger integrity ==');
ok(ZONES.reduce((a,z)=>a+z.panels,0) === PROGRAM.panels,
   'elevation panel counts sum to the program total', PROGRAM.panels);
ok(ZONES.reduce((a,z)=>a+z.bidQty,0) === PROGRAM.gsf,
   'bid square footage sums to the program gsf', PROGRAM.gsf);
const nonMono = ZONES.filter(z =>
  !(z.panels >= z.rel && z.rel >= z.fra && z.fra >= z.gla && z.gla >= z.cra
    && z.cra >= z.set && z.set >= z.sea));
ok(nonMono.length === 0,
   'panel states are monotonic in every elevation (a set panel was also crated)',
   nonMono.map(z=>z.id).join(',') || 'all 6 ok');
ok(WEEKS.crated.length === WEEKS.set.length && WEEKS.set.length === WEEKS.plan.length,
   'the three weekly series are the same length', WEEKS.crated.length + ' weeks');
const backwards = ['crated','set','plan'].filter(kk =>
  WEEKS[kk].some((v,i) => i>0 && v < WEEKS[kk][i-1]));
ok(backwards.length === 0, 'no weekly cumulative series ever decreases', backwards.join(',') || 'all monotonic');
ok(WEEKS.crated.every((v,i) => v >= WEEKS.set[i]),
   'panels crated never trails panels set (buffer cannot go negative)');

console.log('\n== B. Earned value, re-derived from raw fields ==');
const earned = (z, ladder) => ladder.reduce((t, s, i) => {
  const next = i + 1 < ladder.length ? z[ladder[i+1].k] : 0;
  return t + (z[s.k] - next) * s.w;
}, 0);
let xBac=0, xEv=0, xAc=0, xPv=0, xEacBu=0, xEvShop=0, xEvField=0;
for (const z of ZONES){
  const bac = z.bacShop + z.bacField, ac = z.acShop + z.acField;
  const evS = z.bacShop  * earned(z, SHOP_LADDER)  / z.panels;
  const evF = z.bacField * earned(z, FIELD_LADDER) / z.panels;
  const ev = evS + evF;
  xBac += bac; xAc += ac; xEv += ev; xPv += z.pv; xEvShop += evS; xEvField += evF;
  xEacBu += bac / (ev / ac);
}
ok(near(xBac, T.bac), 'package BAC', '$' + xBac.toLocaleString());
ok(near(xEv, T.ev, 1e-6), 'package EV re-derived independently', '$' + Math.round(xEv).toLocaleString());
ok(near(xAc, T.ac), 'package AC', '$' + xAc.toLocaleString());
ok(near(xPv, T.pv), 'package PV', '$' + xPv.toLocaleString());
ok(near(xEv/xAc, T.cpi, 1e-9), 'CPI = EV/AC', T.cpi.toFixed(4));
ok(near(xEv/xPv, T.spi, 1e-9), 'SPI = EV/PV', T.spi.toFixed(4));
ok(near(xEacBu, T.eacBottomUp, 1e-6), 'bottom-up EAC = sum of elevation EACs',
   '$' + Math.round(xEacBu).toLocaleString());
ok(!near(T.eacBottomUp, T.eacBlended, 1),
   'bottom-up and blended EAC legitimately differ (the spread a single index hides)',
   '$' + Math.round(Math.abs(T.eacBottomUp - T.eacBlended)).toLocaleString());
ok(T.ev <= T.bac, 'earned value never exceeds budget at completion');
ok(EACS.length === 4 && EACS.every(e => isFinite(e.v) && e.v > 0), 'four finite EAC methods');

console.log('\n== C. The two identities this method could be silently wrong about ==');
const xQty   = ZONES.reduce((a,z)=>a+(z.actQty-z.bidQty)*z.bidRate, 0);
const xPrice = ZONES.reduce((a,z)=>a+(z.actRate-z.bidRate)*z.actQty, 0);
const xTot   = ZONES.reduce((a,z)=>a+(z.actQty*z.actRate - z.bidQty*z.bidRate), 0);
ok(near(xQty + xPrice, xTot, 1e-6),
   'quantity + price = total, EXACTLY (not apportioned)',
   'residual ' + (xQty + xPrice - xTot).toExponential(2));
ok(near(xQty, T.qtyVar) && near(xPrice, T.priceVar) && near(xTot, T.totVar),
   'the page reports the same three variances this harness computes');
for (const z of ZONES){
  const q = (z.actQty-z.bidQty)*z.bidRate, p = (z.actRate-z.bidRate)*z.actQty;
  const t = z.actQty*z.actRate - z.bidQty*z.bidRate;
  if (!near(q+p, t, 1e-6)) ok(false, 'identity holds per elevation: ' + z.id);
}
ok(true, 'identity also holds per elevation, all ' + ZONES.length + ' of them');
ok(near(xEvShop + xEvField, xEv, 1e-9),
   'shop EV + field EV = package EV', 'residual $' + (xEvShop + xEvField - xEv).toExponential(2));

console.log('\n== D. Panel flow ==');
const last = WEEKS.crated.length - 1;
ok(T.crated === WEEKS.crated[last] && T.set === WEEKS.set[last], 'totals read the final week');
ok(T.buffer === WEEKS.crated[last] - WEEKS.set[last], 'buffer = crated − set', T.buffer + ' panels');
const xRate = (WEEKS.set[last] - WEEKS.set[last-4]) / (4 * PROGRAM.workDaysPerWeek);
ok(near(xRate, T.setRate, 1e-9), 'trailing 4-week set rate', xRate.toFixed(2) + '/day');
ok(near(T.buffer / xRate, T.coverDays, 1e-9), 'days of cover = buffer ÷ set rate',
   T.coverDays.toFixed(1) + ' days');
ok(T.cover.length === WEEKS.crated.length, 'a cover reading exists for every week');
ok(T.coverDays < T.coverPrior,
   'cover is genuinely falling — the page claims a downward trend, so it must be true',
   T.coverPrior.toFixed(1) + ' → ' + T.coverDays.toFixed(1) + ' days');

console.log('\n== E. Gates actually evaluate ==');
ok(GATES.length === 5, 'five gates');
const blocked = GATES.filter(g => g.s === 'act');
ok(blocked.length > 0,
   'at least one gate is genuinely failing — a gate board that is all green checks nothing',
   blocked.map(g => g.n).join('; '));
const sealedNoHose = ZONES.filter(z => z.sea > 0 && !z.hose);
ok(sealedNoHose.length > 0 && /BLOCKED/.test(GATES[4].d),
   'the hose-test gate blocks on the elevations that actually lack it',
   sealedNoHose.map(z=>z.id).join(','));
const setNoFlood = ZONES.filter(z => z.set > 0 && !z.flood);
ok(setNoFlood.length === 0 && GATES[3].s !== 'act',
   'no panels set above an unsigned sill, and the gate agrees');

console.log('\n== F. Tolerance ==');
for (const r of R){
  if (r.surveyed === 0){ ok(r.creepPer === 0, r.id + ': unsurveyed elevation projects nothing'); continue; }
  ok(near(r.creepPer, r.creepMm / r.surveyed, 1e-9), r.id + ': drift per panel');
  ok(near(r.creepProj, (r.creepMm / r.surveyed) * r.sweep, 1e-9), r.id + ': projected drift');
}
const over = R.filter(r => r.surveyed > 0 && r.creepProj > PROGRAM.jointBudgetMm);
ok(over.length > 0,
   'at least one elevation projects past the joint budget — the metric earns its place',
   over.map(r => r.id + ' ' + r.creepProj.toFixed(1) + 'mm').join(', '));

console.log('\n== G. Cross-domain finding ==');
/* The page's Bid-vs-Actual narrative names the elevation with the worst productivity
   variance IN DOLLARS and asserts it is also worst on cost variance and tolerance. Test
   exactly that claim -- an earlier version of this check tested the worst PF *ratio*
   instead and failed, because PDM has a worse ratio on a tiny base. The page is right and
   the test was wrong; both readings are now asserted so neither can drift. */
const worstCv    = R.slice().sort((a,b)=>a.cv-b.cv)[0].id;
const worstProdV = R.slice().sort((a,b)=>b.prodVar-a.prodVar)[0].id;
const worstCreep = R.filter(r=>r.surveyed>0).sort((a,b)=>b.creepRatio-a.creepRatio)[0].id;
ok(worstCv === worstProdV && worstProdV === worstCreep,
   'one elevation is worst on cost variance, productivity dollars AND tolerance — as claimed',
   'cv=' + worstCv + ' prod$=' + worstProdV + ' creep=' + worstCreep);
const worstPf = R.slice().sort((a,b)=>a.pf-b.pf)[0].id;
ok(worstPf !== worstProdV,
   'worst PF ratio and worst productivity dollars are DIFFERENT elevations — the page says so '
   + 'rather than letting a ranked-by-dollars list imply otherwise',
   'ratio=' + worstPf + ' dollars=' + worstProdV);
ok(/rate is not the same question as magnitude/i.test(src),
   'the page carries that caveat in its own words');

console.log('\n== H. Monte Carlo reads honestly ==');
ok(MC_LEN === 10000, 'ten thousand runs', String(MC_LEN));
ok(T.p10 <= T.p50 && T.p50 <= T.p80 && T.p80 <= T.p95, 'percentiles are ordered');
const flatSrc = src.replace(/\s+/g, ' ');
/* Assert against the RENDERED text, not the source: the source splits these sentences
   across JS string concatenation, so a source-level regex gives a false negative. What
   matters is what a reader sees anyway. */
const rendered = (els.mcRows ? els.mcRows.innerHTML : '').replace(/\s+/g, ' ');
ok(/Read the narrowness, not just the centre/.test(rendered),
   'the page explains WHY the distribution is narrow rather than leaving it looking overconfident');
ok(/drawn independently, which understates the true spread/.test(rendered),
   'the independence assumption is stated as a limitation, not hidden');
// Matches MC[0] or sims[0] -- the MC chart was parameterized into build(sims, correlated) for the
// correlated-draw toggle (2026-09-03); the invariant itself (BAC forced into the x-range) is
// unchanged, only the local variable name, so the check now tracks the invariant, not one literal
// variable name.
ok(/Math\.min\((?:MC|sims)\[0\], T\.bac/.test(src),
   'the chart forces BAC into range so the budget line cannot be clipped off-canvas');
if (T.pOverBac === 1)
  ok(/entire distribution sits to the right of it/.test(rendered),
     'when every run overruns, the page says so plainly instead of showing a degenerate chart');
ok(!/undefined|NaN/.test(rendered), 'no undefined or NaN leaked into the Monte Carlo narrative');

console.log('\n== I. Sanitization (whitespace-normalised) ==');
[[/Rainier Tower|815 Pine|Holland Construction|Weber Thompson/i, 'a real Walters & Wolf project name'],
 [/\b80\s*%\s*of\s*(project\s*)?lab(o|ou)r/i, 'the unverified 80%-of-labour claim'],
 [/B\.?E\.? Meyers|SYSPRO|Collins Aerospace|Pillari/i, 'a real employer name (this page is synthetic-only)'],
 [/\b92\s*%/, 'the retired bid-to-award statistic']
].forEach(([re, why]) => ok(!re.test(flatSrc), 'no ' + why));
ok(/Synthetic illustrative data/.test(flatSrc), 'the synthetic-data banner is present');
ok(!/<script[^>]+src=|<link[^>]+href="http/i.test(src), 'zero external references');

console.log('\n== J. UI-design review fixes (2026-09-02) ==');
ok(/font:16px\/1\.6 -apple-system/.test(src), 'base body font is 16px (was 14.5px, below the review checklist minimum)');
ok(/min-height:44px/.test(src), 'the shared .icobtn touch target is 44px (was 34px)');
const tabIds = ['tab-flow','tab-cost','tab-bid','tab-gates','tab-recon','tab-method'];
const panelIds = ['p-flow','p-cost','p-bid','p-gates','p-recon','p-method'];
tabIds.forEach((id, i) => {
  ok(new RegExp('id="' + id + '"').test(src), 'tab button has id="' + id + '"');
  ok(new RegExp('aria-labelledby="' + id + '"').test(src),
     panelIds[i] + ' tabpanel is aria-labelledby="' + id + '"');
});
ok(/ArrowRight[\s\S]{0,400}ArrowLeft/.test(src) || /ArrowLeft[\s\S]{0,400}ArrowRight/.test(src),
   'the tablist handles ArrowLeft/ArrowRight (WAI-ARIA tabs pattern, not click-only)');
ok(/Home[\s\S]{0,200}End/.test(src) || /"Home"/.test(src), 'the tablist handles Home/End');

console.log('\n== K. Design-critique fixes (2026-09-02) ==');
ok(/padding:9px 11px/.test(src), '.icobtn padding is 9px vertical (was 6px, below the 0.75rem guideline)');
ok(/\(hover:hover\) and \(pointer:fine\)\{\.icobtn:hover/.test(src),
   '.icobtn:hover is gated to hover-capable pointers (was ungated -- risked sticky-hover on touch)');
ok(/class="help"/.test(src), 'CPI/SPI KPI tiles carry an inline help toggle');
ok(/Cost Performance Index/.test(src) && /Schedule Performance Index/.test(src),
   'the help toggles carry real definitions, not placeholder text');
ok(/\.kpi \.help::before\{content:""/.test(src),
   'the help toggle has the same 44px invisible hit-area expander as .help-ic in index.html (visual glyph stays small, real tap target does not)');

// Permanent regression gate (2026-09-03, /stress-test finding during the 20-feature build): several
// new buttons were given an inline `min-height:36px`/`32px` override, silently undercutting the
// .btn class's own 44px floor this page was already fixed to earlier the same session. Fixed by
// dropping the inline override (the class rule wins on its own); this check makes that class of
// regression fail the build instead of relying on a human re-noticing it.
const inlineShortBtn = [...src.matchAll(/<button[^>]*style="[^"]*"/g)]
  .filter(m => /min-height:\s*(\d+)px/.test(m[0]) && parseInt(m[0].match(/min-height:\s*(\d+)px/)[1], 10) < 44);
ok(inlineShortBtn.length === 0,
   'no <button> inline style overrides .btn\'s 44px min-height floor with something smaller',
   inlineShortBtn.map(m => m[0].slice(0, 60)).join(' | ') || 'none found');

console.log('\n== L. Ask AI (2026-09-03) ==');
ok(F.askAiConfigured() === false, 'Ask AI is dormant by default -- the placeholder Worker URL was never replaced, so no network call is even attempted');
ok(F.getAskAiWorkerUrl().indexOf('REPLACE-ME') !== -1, 'the Worker URL is still the documented placeholder (docs/ASK_AI_SETUP.md is the deploy step, not this file)');
ok(F.askAiState.enabled === false, 'Ask AI has not auto-enabled itself on page load -- a reader must click the gate button');
ok(F.askAiState.history.length === 0, 'zero questions have been asked at load -- proves the feature makes no network call just by the page rendering');
const snap = F.buildFacadeAskAiSnapshot();
ok(snap.totals.bac === T.bac && snap.totals.cpi === T.cpi && snap.totals.p50 === T.p50,
   'the snapshot totals are the SAME live T values every other tab reads, not a second invented copy', 'bac=' + snap.totals.bac);
ok(snap.elevations.length === R.length && snap.elevations[0].id === R[0].id && snap.elevations[0].pctEarned === R[0].pct,
   'the snapshot carries all 6 real elevations, keyed the same way R already is', snap.elevations.length + ' elevations');
ok(snap.gates.length === GATES.length && snap.gates[4].n === 5 && snap.gates[4].status === GATES[4].s,
   'the snapshot remaps GATES into {n:<1-based position>, status, ...} -- gate 5 lands at position 5, matching facade_get_gate\'s positional lookup', 'gates=' + snap.gates.length);
ok(snap.gates.every(g => !/&\w+;/.test(g.name) && !/&\w+;/.test(g.detail)),
   'gate name/detail text is HTML-entity-decoded before it reaches the model (deent()), not raw markup like "&mdash;"');
ok(snap.eacMethods.length === EACS.length && near(snap.eacMethods[0].value, EACS[0].v),
   'the snapshot carries all 4 real EAC methods with their real values', snap.eacMethods.length + ' methods');
ok(near(snap.mc.p50, T.p50) && near(snap.mc.pOverBac, T.pOverBac),
   'the snapshot\'s Monte Carlo summary matches the real T.p50/T.pOverBac, not a separate simulation', 'p50=' + snap.mc.p50);
ok(near(snap.bidVariance.totVar, T.totVar), 'the snapshot\'s bid variance ties to the real T.totVar', 'totVar=' + snap.bidVariance.totVar);
ok(F.escHtml('<script>alert(1)</script>') === '&lt;script&gt;alert(1)&lt;/script&gt;',
   'escHtml neutralises HTML -- an AI answer is external content and is escaped before it ever reaches innerHTML, same as index.html\'s own Ask AI');
ok(/dashboard:\s*"facade"/.test(src), 'the fetch body actually declares dashboard:"facade" -- the Worker cannot silently answer this page against the OTHER dashboard\'s tool set');
ok(/id="askAiEnableBtn"[^>]*class="btn"|class="btn" id="askAiEnableBtn"/.test(src),
   'the Enable button uses the new .btn class (44px min-height), not a cramped inline override like index.html\'s own compact chips');
ok(/\.btn\{[^}]*min-height:44px/.test(src), '.btn itself carries the 44px touch-target floor the rest of this page was already fixed to');
ok(/\.gsearch\{[^}]*min-height:44px/.test(src) && /\.gsearch\{[^}]*font:16px/.test(src),
   '.gsearch (the Ask AI input) is also 44px tall and 16px text -- the same two floors facade.html\'s body/icobtn were fixed to earlier this session');

console.log('\n== M. Domain-metric build (2026-09-03) ==');
const { RFIS, CHANGE_ORDERS, RFI_ROWS, CO_ROWS } = F;

// First-Pass Yield -- re-derived straight from ZONES literals, not from R (the derived output).
ZONES.forEach(z => ok(z.qcFirstPass + z.qcRework === z.cra,
  z.id + ': qcFirstPass + qcRework === cra (the invariant the FPY split depends on)',
  z.qcFirstPass + '+' + z.qcRework + '=' + (z.qcFirstPass + z.qcRework) + ' vs cra=' + z.cra));
const rawCraTotal = ZONES.reduce((a, z) => a + z.cra, 0);
const rawFirstPass = ZONES.reduce((a, z) => a + z.qcFirstPass, 0);
ok(near(T.fpy, rawFirstPass / rawCraTotal), 'package FPY re-derived from raw qcFirstPass/cra sums matches T.fpy', T.fpy.toFixed(4));
const worstFpyZone = ZONES.slice().sort((a, b) => (a.qcFirstPass / a.cra) - (b.qcFirstPass / b.cra))[0];
ok(R.find(r => r.id === worstFpyZone.id).fpy < 0.95, 'the worst-FPY elevation genuinely reads below the 95% band this page treats as healthy', worstFpyZone.id);

// Breakage rate vs. the stated NiS design basis.
const rawBreaks = ZONES.reduce((a, z) => a + z.breaks, 0);
ok(near(T.breakRate, rawBreaks / rawCraTotal), 'package breakage rate re-derived from raw breaks/cra sums matches T.breakRate', T.breakRate.toFixed(5));
ok(PROGRAM.nisDesignRate === 0.008, 'the NiS design-basis constant is the real cited 8-per-1,000 figure, not a rounded stand-in');
const overDesignZones = ZONES.filter(z => (z.breaks / z.cra) > PROGRAM.nisDesignRate);
ok(overDesignZones.length >= 1 && overDesignZones.length < ZONES.length,
  'at least one elevation runs over the design basis while the package total does not -- the per-elevation-vs-package divergence the box claims to show',
  overDesignZones.map(z => z.id).join(','));

// AAMA 501.2 quantitative hose-test reading.
const hoseTested = ZONES.filter(z => z.hoseVolMl !== null);
const hoseNearMiss = hoseTested.filter(z => z.hoseVolMl > 0 && z.hoseVolMl < 14.2);
ok(T.hoseTestedCount === hoseTested.length, 'T.hoseTestedCount matches a raw count of elevations with a non-null hoseVolMl', T.hoseTestedCount);
ok(near(T.hoseNearMissRate, hoseNearMiss.length / hoseTested.length), 'T.hoseNearMissRate re-derived from raw hoseVolMl readings matches', T.hoseNearMissRate.toFixed(3));
hoseTested.forEach(z => ok(z.hoseVolMl <= 14.2, z.id + ": every hoseVolMl reading actually respects the standard's own 14.2 ml allowance (a reading above it should be a failed test, not a passed one)"));

// Unbilled factory value / WIP.
const rawUnbilled = ZONES.reduce((a, z) => a + Math.max(0, z.cra - z.set) * (z.bacShop / z.panels), 0);
ok(near(T.unbilledFactoryValue, rawUnbilled, 1), 'T.unbilledFactoryValue re-derived from raw (cra-set) x (bacShop/panels) per elevation matches', T.unbilledFactoryValue.toFixed(2));
ok(T.unbilledFactoryValue > 0 && T.unbilledFactoryValue < T.bac, 'unbilled factory value is a real positive figure and a small fraction of BAC, not a runaway number');
ok(typeof T.overWip === 'boolean' && T.overWip === (T.coverDays > PROGRAM.bufferCeilingDays), 'T.overWip is exactly the coverDays > ceiling comparison, not a separately hand-set flag');

// BEI + TCPI/CPI divergence.
ok(near(T.bei, T.set / T.plan), 'T.bei is exactly set/plan from the SAME weekly series the KPI board already reads, not a second computation', T.bei.toFixed(4));
ok(T.bei > 0 && T.bei < 2, 'BEI is a plausible ratio, not a broken division');
const gap = T.tcpi - T.cpi;
ok(Math.abs(gap) >= 0 , 'TCPI-CPI gap computes to a real finite number'); // sanity: no NaN
ok(isFinite(gap), 'the TCPI/CPI divergence is finite (would NaN if T.bac===T.ac, i.e. zero remaining budget headroom)');

// Retainage.
ok(near(T.retainageHeld, T.ev * PROGRAM.retainagePct), 'T.retainageHeld re-derived as billedToDate(=EV) x retainagePct matches exactly', T.retainageHeld.toFixed(2));
ok(PROGRAM.retainagePct > 0 && PROGRAM.retainagePct < 0.15, 'the retainage rate is inside the commonly-cited 0-15% commercial range, not a placeholder value');

// RFIs -- daysOpen re-derived from raw ISO dates via a completely independent date calc.
function rawDaysBetween(a, b){ return Math.round((new Date(b) - new Date(a)) / 86400000); }
RFIS.forEach(r => {
  const row = RFI_ROWS.find(x => x.id === r.id);
  const expectDays = rawDaysBetween(r.opened, r.answered || PROGRAM.dataDateIso);
  ok(row.daysOpen === expectDays, r.id + ': daysOpen matches an independently re-derived date difference', row.daysOpen + ' vs ' + expectDays);
  ok(row.closed === !!r.answered, r.id + ': closed flag matches whether answered is set');
});
const rawClosed = RFIS.filter(r => r.answered);
const rawAvg = rawClosed.reduce((a, r) => a + rawDaysBetween(r.opened, r.answered), 0) / rawClosed.length;
ok(near(T.rfiAvgDays, rawAvg), 'T.rfiAvgDays re-derived from raw closed-RFI dates matches', T.rfiAvgDays.toFixed(2));
ok(T.rfiOpenCount === RFIS.filter(r => !r.answered).length, 'T.rfiOpenCount matches a raw count of RFIS with no answered date');
ok(T.rfiOpenMaxDays >= 0, 'rfiOpenMaxDays is non-negative');

// Change orders / PCOs.
const rawApproved = CHANGE_ORDERS.filter(c => c.status === 'approved').reduce((a, c) => a + c.value, 0);
ok(T.coApprovedValue === rawApproved, 'T.coApprovedValue matches a raw sum of approved CHANGE_ORDERS values', T.coApprovedValue);
ok(near(T.coRatePct, rawApproved / T.bac), 'T.coRatePct is exactly coApprovedValue/BAC, not a hand-typed percentage');
ok(T.coRatePct > 0 && T.coRatePct < 0.15, 'the change-order rate sits inside the commonly-cited 0-15% commercial band this page benchmarks it against');
const rawUnpriced = CHANGE_ORDERS.filter(c => c.status === 'pending').reduce((a, c) => a + c.value * c.pctCompleteUnapproved, 0);
ok(near(T.coUnpricedExposure, rawUnpriced), 'T.coUnpricedExposure matches a raw sum of pending value x pctCompleteUnapproved');
CHANGE_ORDERS.filter(c => c.status === 'pending').forEach(c => {
  const row = CO_ROWS.find(x => x.id === c.id);
  ok(row.daysOutstanding === rawDaysBetween(c.opened, PROGRAM.dataDateIso), c.id + ': daysOutstanding independently re-derived from its opened date');
});

// New metrics actually reach the Ask AI snapshot -- the point of the wiring in buildFacadeAskAiSnapshot.
const snap2 = F.buildFacadeAskAiSnapshot();
['bei', 'fpy', 'breakRate', 'unbilledFactoryValue', 'retainageHeld', 'rfiAvgDays', 'coRatePct', 'coUnpricedExposure']
  .forEach(k => ok(snap2.totals[k] === T[k], 'snapshot.totals.' + k + ' is wired to the real T.' + k + ', not omitted'));

console.log('\n== N. 20-feature UX round (2026-09-03), structural checks -- browser-verified live separately ==');
ok(/id="tab-gloss"/.test(src) && /id="p-gloss"/.test(src), 'the Glossary tab exists (feature #6)');
ok(/id="quizBtn"/.test(src) && /function quizPickNext/.test(src), 'quiz mode exists (feature #7)');
ok(/id="elevDrawer"/.test(src) && /function openElevDrawer/.test(src) && /function closeElevDrawer/.test(src),
   'the elevation drill-down drawer exists (feature #1)');
ok(/data-elev="/.test(src), 'at least one elev-link trigger renders on the page');
ok((src.match(/elevLink\(r\.id\)/g) || []).length >= 8, 'elevLink is applied across multiple tables, not just one', (src.match(/elevLink\(r\.id\)/g) || []).length);
ok(/data-sort="/.test(src) && /function wireSortableTable/.test(src), 'sortable-table infrastructure and at least one opted-in table exist (feature #5)');
const sortableCount = (src.match(/data-sort="/g) || []).length;
ok(sortableCount >= 8, 'sortable columns are wired on at least 8 tables', sortableCount);
ok(/function parseSortNum/.test(src) && /1e6/.test(src.match(/function parseSortNum[\s\S]{0,400}/)[0]),
   'the sort parser understands this page\'s own $X.XXM / $Xk formatted cells, not just bare numbers');
ok(/class="mosaic"/.test(src) && /MOSAIC_STATES/.test(src), 'the panel mosaic exists (feature #11)');
ok(/id="benchBody"/.test(src) && /renderBenchmark/.test(src), 'the benchmark scorecard exists (feature #9)');
ok(/id="sbxCrate"/.test(src) && /id="sbxSet"/.test(src) && /SBX_DAYS/.test(src), 'the Gate-3 what-if sandbox exists (feature #2)');
ok(/state-flip/.test(src) && /classList\.add\("state-flip"\)/.test(src), 'the sandbox applies a real state-change flourish, not a decorative always-on animation (feature #15)');
ok(/function computeMcCorrelated/.test(src) && /id="mcCorrBtn"/.test(src), 'the correlated-Monte-Carlo toggle exists (feature #3)');
ok(/id="bufferCompareBtn"/.test(src) && /T\.coverPrior/.test(src), 'the 3-weeks-ago buffer overlay toggle exists (feature #17)');
ok(/id="playScrub"/.test(src) && /id="playBtn"/.test(src), 'the week-by-week playback scrubber exists (feature #12)');
ok(/playBtn\.disabled = true/.test(src), 'auto-play is disabled under reduced motion rather than running at a 0ms interval (a real gate, not a token one)');
ok(/id="zoneMap"/.test(src) && /ZONEMAP_ORDER/.test(src), 'the persistent spatial elevation map exists (feature #14)');
ok(/id="plainLangBtn"/.test(src) && /plain-lang/.test(src), 'the plain-language toggle exists (feature #10)');
ok(/id="walkStartBtn"/.test(src) && /WALK_STEPS/.test(src) && /walk-highlight/.test(src), 'the guided walkthrough exists (feature #16)');
ok(/function animateCount/.test(src) && /KPIS\.forEach\(function\(x, i\)\{ if \(x\.raw/.test(src), 'KPI count-up animation is wired (feature #13)');
ok(/data-hover-cause="/.test(src) && /function showHoverCard/.test(src), 'the productivity-bar hover-card exists (feature #19)');
ok(/id="askAiSummaryBtn"/.test(src), 'the pinned Ask AI summary starter exists (feature #20)');
ok(/e\.sub\b/.test(src) && EACS.every(e => typeof e.sub === 'string' && e.sub.length > 0),
   'every EAC method row carries a real substituted-number formula, not just the symbolic one (feature #8)');

console.log('\n== O. /stress-test fixes on the 20-feature round (2026-09-03) ==');
ok(/benchBody[\s\S]{0,600}r\[5\] \? "watch" : "ok"/.test(src),
   'benchmark scorecard pill colour is driven by an explicit boolean per row, not a regex matched against the reading text (the regex approach silently mis-coloured "Above band" -- caught before ship)');
ok(!/Below\|Slower\|Above ceiling\|Below floor\|Above basis/.test(src),
   'the old fragile regex-based benchmark colour check is actually gone, not just superseded');
ok(/playTimer = setInterval[\s\S]{0,500}flowPanel\.hidden/.test(src),
   'the playback auto-play timer checks the Panel Flow tab is still visible and stops itself if not (previously it ran forever in the background once started, even after switching tabs)');
ok(/id="mcIndepBtn"/.test(src) && /indepBtn\.addEventListener\("click", function\(\)\{ build\(MC, false\)/.test(src),
   'the correlated-Monte-Carlo view has a real path back to the independent-draw view (it was a one-way door)');
ok(/elevDrawerReturnFocus = document\.activeElement/.test(src) && /elevDrawerReturnFocus\.focus\(\)/.test(src),
   'closing the elevation drawer restores focus to whatever triggered it (it previously dropped focus silently)');
ok(/if \(startBtn\) startBtn\.focus\(\)/.test(src),
   'ending the walkthrough restores focus to the button that started it');
ok(/role="dialog" aria-modal="true" aria-label="Guided tour"/.test(src),
   'the walkthrough overlay carries the same dialog semantics as the elevation drawer (it was missing role/aria-modal entirely)');
ok(/history\.replaceState\(null, "", location\.pathname \+ location\.search \+ "#elev="/.test(src),
   'opening the elevation drawer uses replaceState, not a direct location.hash assignment (a direct assignment pushed a new history entry per open, so Back needed one press per elevation ever opened)');
ok(/\.zonemap \.zm-row\{[^}]*min-height:44px/.test(src),
   'the clickable zone-map rows meet the 44px touch-target floor (they measured ~23px before this fix)');
ok(/th\[role="button"\]::before\{content:"";position:absolute[^}]*height:44px/.test(src),
   'sortable table headers carry a 44px invisible hit-area expander (the visible header is ~33.5px tall)');
ok(/\.elev-link\{[^}]*position:relative;display:inline-block/.test(src) && !/\btd \.elev-link\{/.test(src),
   'the elev-link 44px hit-area is anchored on the link itself in every context, not only inside a <td> (rowbar-embedded links in wipRows/cvRows/prodRows previously had no positioned ancestor at all, since "position:relative" was scoped to "td .elev-link")');
ok(/\.gatepill\.watch\{/.test(src) && /status === "watch" \? "watch"/.test(src),
   'the sandbox\'s three real states (below floor / above ceiling / in band) map to three distinct pill colours, not two ("above ceiling" previously rendered identically to a healthy "in band" reading)');
ok(/id="quizRight"/.test(src) && /id="quizWrong"/.test(src) && /quiz\.right\+\+/.test(src),
   'the quiz\'s "self-graded" score has a real control that increments it (quiz.right was previously written once at init and never incremented, so the score silently stayed 0/N forever)');
ok(/startBtn\.addEventListener\("click", function\(\)\{ if \(!el\("elevDrawer"\)\.hidden\) closeElevDrawer/.test(src),
   'starting the guided walkthrough closes an already-open elevation drawer first, rather than stacking two dialogs');

// The mosaic renders one <i> tile per real panel -- re-count the ACTUAL rendered tiles rather than
// trusting the counts array arithmetic, so a future edit that miscounts a state band is caught.
const mosaicHtml = els.mosaicWrap ? els.mosaicWrap.innerHTML : '';
const mosaicTileCount = (mosaicHtml.match(/<i /g) || []).length;
ok(mosaicTileCount === T.panels, 'the panel mosaic renders exactly one tile per real panel, package-wide', mosaicTileCount + ' vs ' + T.panels);
ZONES.forEach(z => {
  const perZoneCount = (mosaicHtml.split(z.id + ' &mdash;').length - 1);
  ok(perZoneCount === z.panels, z.id + ': mosaic renders exactly ' + z.panels + ' tiles for this elevation (its title-attribute count)', perZoneCount);
});

console.log('\n== P. /stress-test fixes, round 2 -- independent-reviewer findings (2026-09-03) ==');
ok(/function trapFocus\(container, e\)/.test(src),
   'a real focus-trap function exists (both dialogs declared role="dialog" aria-modal="true" but nothing actually cycled Tab/Shift+Tab inside them -- most browsers do not enforce that from the ARIA attribute alone, so keyboard users could Tab straight past either overlay onto the page behind it)');
ok(/if \(!el\("elevDrawer"\)\.hidden\) trapFocus\(el\("elevDrawer"\), e\)/.test(src),
   'the elevation drawer\'s keydown handler actually calls trapFocus while open');
ok(/if \(!el\("walkOverlay"\)\.hidden\) trapFocus\(el\("walkOverlay"\), e\)/.test(src),
   'the walkthrough\'s keydown handler actually calls trapFocus while open (this closes the keyboard-only path the independent reviewer found: Tab could reach a background elev-link and Enter would open the drawer WHILE the walkthrough was still showing, even after the mouse-only "close drawer before starting tour" fix)');
ok(/walkLockTimer = setTimeout\(function\(\)\{ document\.documentElement\.style\.overflow = "hidden"; \}/.test(src),
   'the walkthrough locks page scroll once its own scrollIntoView has settled, matching the elevation drawer\'s scroll-lock -- deliberately NOT locked before the scroll (that would fight scrollIntoView, the overlay\'s own navigation mechanism)');
ok(/function walkEnd\(\)\{[\s\S]{0,50}el\("walkOverlay"\)\.hidden = true;[\s\S]{0,300}document\.documentElement\.style\.overflow = "";/.test(src),
   'ending the walkthrough always unlocks scroll again, including when ended mid-lock-timer');
ok(!/tables are re-rendered on tab switch/.test(src),
   'the stale/inaccurate comment claiming tables re-render on tab switch is gone (none of the render*() functions ever run more than once; delegation is for covering many elevLink() call sites with one handler, not for surviving re-renders that do not happen)');

console.log('\n== Q. Shop/field productivity split (2026-09-03) ==');
// Backward compatibility: blended ernH/actH/pf must be UNCHANGED from before the split (the raw
// ZONES literals were designed so ernHShop+ernHField / actHShop+actHField sum to the exact old
// totals -- this is the check that promise actually holds, not just an assertion it should).
ZONES.forEach(z => ok((z.ernHShop + z.ernHField) > 0 && (z.actHShop + z.actHField) > 0,
  z.id + ': has real, positive shop+field hours on both sides'));
ok(T.ernH === 90400 && T.actH === 96650, 'package blended earned/actual hours are UNCHANGED from before the shop/field split (90,400 / 96,650) -- the raw literals were designed to preserve this exactly', T.ernH + '/' + T.actH);
ok(near(T.pf, 90400 / 96650), 'package blended PF is unchanged from before the split', T.pf.toFixed(4));

// Re-derive pfShop/pfField/prodVarShop/prodVarField from raw ZONES literals independently.
const rawErnHShop = ZONES.reduce((a, z) => a + z.ernHShop, 0);
const rawActHShop = ZONES.reduce((a, z) => a + z.actHShop, 0);
const rawErnHField = ZONES.reduce((a, z) => a + z.ernHField, 0);
const rawActHField = ZONES.reduce((a, z) => a + z.actHField, 0);
ok(near(T.pfShop, rawErnHShop / rawActHShop), 'T.pfShop re-derived from raw ernHShop/actHShop sums matches', T.pfShop.toFixed(4));
ok(near(T.pfField, rawErnHField / rawActHField), 'T.pfField re-derived from raw ernHField/actHField sums matches', T.pfField.toFixed(4));
const rawProdVarShop = ZONES.reduce((a, z) => a + (z.actHShop - z.ernHShop) * PROGRAM.laborRateShop, 0);
const rawProdVarField = ZONES.reduce((a, z) => a + (z.actHField - z.ernHField) * PROGRAM.laborRateField, 0);
ok(T.prodVarShop === rawProdVarShop, 'T.prodVarShop re-derived from raw hours x PROGRAM.laborRateShop matches exactly', T.prodVarShop);
ok(T.prodVarField === rawProdVarField, 'T.prodVarField re-derived from raw hours x PROGRAM.laborRateField matches exactly', T.prodVarField);
ok(T.prodVar === T.prodVarShop + T.prodVarField, 'T.prodVar is EXACTLY the sum of the shop and field halves, not a separately-computed blended-rate figure (the old formula and the new split-rate formula would legitimately differ -- this asserts the page reports the more accurate split sum, not a stale blended one)');
ok(PROGRAM.laborRateShop !== PROGRAM.laborRateField, 'shop and field genuinely use two different rates, not the same number under two names', PROGRAM.laborRateShop + ' vs ' + PROGRAM.laborRateField);
ZONES.forEach(z => {
  const r = R.find(x => x.id === z.id);
  ok(near(r.pfShop, z.ernHShop / z.actHShop), z.id + ': per-elevation pfShop matches raw ernHShop/actHShop');
  ok(near(r.pfField, z.ernHField / z.actHField), z.id + ': per-elevation pfField matches raw ernHField/actHField');
  ok(r.prodVarShop === (z.actHShop - z.ernHShop) * PROGRAM.laborRateShop, z.id + ': per-elevation prodVarShop re-derived matches');
  ok(r.prodVarField === (z.actHField - z.ernHField) * PROGRAM.laborRateField, z.id + ': per-elevation prodVarField re-derived matches');
});

// Hours tie-out (mirrors the $ EV tie-out already tested above).
ok(T.ernHShop + T.ernHField === T.ernH, 'earned hours tie: shop + field === package blended, exactly');
ok(T.actHShop + T.actHField === T.actH, 'actual hours tie: shop + field === package blended, exactly');

// UI wiring.
ok(/id="prodShopFieldRows"/.test(src) && /id="prodShopFieldNote"/.test(src), 'the Bid vs Actual tab renders a shop-vs-field productivity split box');
ok(/id="reconHoursRows"/.test(src), 'the Shop↔Field tab renders an hours tie-out, matching the existing $ tie-out treatment');
ok(/Shop PF ' \+ idx\(r\.pfShop\)/.test(src), 'the elevation drawer shows per-elevation Shop PF / Field PF, not just the blended figure');
const snap3 = F.buildFacadeAskAiSnapshot();
['pfShop', 'pfField', 'prodVarShop', 'prodVarField', 'ernHShop', 'actHShop', 'ernHField', 'actHField']
  .forEach(k => ok(snap3.totals[k] === T[k], 'snapshot.totals.' + k + ' is wired to the real T.' + k));
ok(snap3.elevations.every(e => typeof e.pfShop === 'number' && typeof e.pfField === 'number'),
  'every elevation in the Ask AI snapshot carries its own pfShop/pfField, not just the package totals');

// Cross-domain finding must still hold with the split-rate prodVar (re-run explicitly, not just
// trusted from Section G above, since prodVar's VALUE changed with this feature -- ~600,000 blended
// to 633,250 split-rate -- and a coincidental preservation is worth confirming, not assuming).
const worstProdVAfterSplit = R.slice().sort((a, b) => b.prodVar - a.prodVar)[0].id;
ok(worstProdVAfterSplit === 'S-HI', 'S-HI is still the package\'s worst elevation on productivity dollars after the split-rate recalculation (was true with the old blended rate too -- confirmed still true, not assumed)', worstProdVAfterSplit);

console.log('\n== R. CPH (Cost Per Hour) monthly tracking (2026-09-03) ==');
const { MONTHLY } = F;
ok(Array.isArray(MONTHLY) && MONTHLY.length === 8, 'MONTHLY carries 8 real months, not a placeholder', MONTHLY.length);
// Hours tie-out -- the same real hours the elevation ledger already tracks (T.actHShop/actHField),
// just viewed by calendar month. This DOES reconcile, by design.
const rawHShop = MONTHLY.reduce((a, m) => a + m.hShop, 0);
const rawHField = MONTHLY.reduce((a, m) => a + m.hField, 0);
ok(rawHShop === T.actHShop, 'MONTHLY shop hours sum EXACTLY to T.actHShop -- the same real hours, viewed by month instead of by elevation', rawHShop + ' vs ' + T.actHShop);
ok(rawHField === T.actHField, 'MONTHLY field hours sum EXACTLY to T.actHField', rawHField + ' vs ' + T.actHField);
ok(T.monthlyHShopTotal === rawHShop && T.monthlyHFieldTotal === rawHField, 'T.monthlyHShopTotal/HFieldTotal match a raw re-sum of MONTHLY');

// Rate variance -- re-derived independently, the exact labour-side parallel to (actRate-bidRate)*actQty.
const rawRateVarShop = MONTHLY.reduce((a, m) => a + (m.hShop > 0 ? (m.cphShop - PROGRAM.laborRateShop) * m.hShop : 0), 0);
const rawRateVarField = MONTHLY.reduce((a, m) => a + (m.hField > 0 && m.cphField !== null ? (m.cphField - PROGRAM.laborRateField) * m.hField : 0), 0);
ok(T.rateVarShop === rawRateVarShop, 'T.rateVarShop re-derived from raw MONTHLY literals matches exactly', T.rateVarShop);
ok(T.rateVarField === rawRateVarField, 'T.rateVarField re-derived from raw MONTHLY literals matches exactly', T.rateVarField);
ok(T.rateVar === T.rateVarShop + T.rateVarField, 'T.rateVar is exactly the sum of the shop and field halves');
ok(T.rateVar > 0, 'the rate variance is genuinely positive (the package really did pay more per hour than budget, not a contrived zero or negative)', T.rateVar);

// CPH is a DIRECTLY-tracked rate, not derived from acShop/acField (which include material) --
// assert that relationship is honestly absent, not silently implied.
ok(!/T\.cphShopLatest = .*acShop/.test(src) && !/cphShop:\s*T\.acShop/.test(src),
   'CPH is never derived from acShop/acField (which include material cost, not labour alone) -- confirms the stated design decision was actually followed, not just written as a comment');

// Latest readings and escalation trend.
const shopMonths = MONTHLY.filter(m => m.hShop > 0);
const fieldMonths = MONTHLY.filter(m => m.hField > 0 && m.cphField !== null);
ok(T.cphShopLatest === shopMonths[shopMonths.length - 1].cphShop, 'T.cphShopLatest is the real most recent month\'s shop rate, not a project-to-date average');
ok(T.cphFieldLatest === fieldMonths[fieldMonths.length - 1].cphField, 'T.cphFieldLatest is the real most recent month\'s field rate');
ok(T.cphShopLatest > PROGRAM.laborRateShop, 'the latest shop rate is genuinely above budget (the escalation narrative is real, not asserted over flat data)', T.cphShopLatest + ' vs ' + PROGRAM.laborRateShop);
ok(T.cphFieldLatest > PROGRAM.laborRateField, 'the latest field rate is genuinely above budget', T.cphFieldLatest + ' vs ' + PROGRAM.laborRateField);
const shopRatesAscending = shopMonths.every((m, i) => i === 0 || m.cphShop >= shopMonths[i - 1].cphShop);
ok(shopRatesAscending, 'shop CPH is monotonically non-decreasing across months -- a real escalation trend, not a random walk that happens to end above budget');
const fieldRatesAscending = fieldMonths.every((m, i) => i === 0 || m.cphField >= fieldMonths[i - 1].cphField);
ok(fieldRatesAscending, 'field CPH is monotonically non-decreasing across months');

// UI wiring.
ok(/id="cphChart"/.test(src) && /function\(\)\{[\s\S]{0,50}var w = 620, h = 220/.test(src) || /id="cphChart"/.test(src), 'the CPH-by-month chart is wired');
ok(/id="cphNote"/.test(src) && /id="cphFormula"/.test(src), 'the CPH note and formula boxes exist');
ok(/ico ' \+ \(T\.rateVar > 0 \? "act" : "ok"\)/.test(src), 'the Bid vs Actual tab\'s 4th cause (Rate) is wired with a real conditional icon, not a hard-coded status');
const snap4 = F.buildFacadeAskAiSnapshot();
['cphShopLatest', 'cphFieldLatest', 'rateVarShop', 'rateVarField', 'rateVar', 'laborRateShopBudget', 'laborRateFieldBudget']
  .forEach(k => ok(snap4.totals[k] === T[k] || snap4.totals[k] === PROGRAM.laborRateShop || snap4.totals[k] === PROGRAM.laborRateField,
    'snapshot.totals.' + k + ' is wired to a real value, not omitted', snap4.totals[k]));
ok(Array.isArray(snap4.monthlyCph) && snap4.monthlyCph.length === 8, 'the Ask AI snapshot carries the full monthly CPH series, not just the latest reading');

console.log(fail ? '\nFAILED — ' + fail + ' check(s)' : '\nall ok');
process.exit(fail ? 1 : 0);
