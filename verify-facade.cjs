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
    id, innerHTML:'', hidden:false, dataset:{}, attrs:{}, className:'',
    setAttribute(k,v){ this.attrs[k]=v; }, getAttribute(k){ return this.attrs[k]; },
    addEventListener(){}, querySelectorAll(){ return []; }, querySelector(){ return null; },
    closest(){ return null; }
  };
}
const els = {};
const get = id => (els[id] = els[id] || makeEl(id));
global.document = {
  documentElement: makeEl('html'),
  getElementById: get,
  querySelector: sel => get(sel),
  querySelectorAll: () => []
};
global.window = { matchMedia: () => ({ matches:true }) };

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
ok(/Math\.min\(MC\[0\], T\.bac/.test(src),
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

console.log(fail ? '\nFAILED — ' + fail + ' check(s)' : '\nall ok');
process.exit(fail ? 1 : 0);
