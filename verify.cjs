// Headless verification harness for index.html
// Stubs the DOM, runs the inline IIFE, then independently re-derives every
// portfolio total and compares against window.__PCC__.
const fs = require("fs");
// __dirname, not a hardcoded absolute path (same /stress-test finding as stress.cjs, 2026-08-18)
const html = fs.readFileSync(__dirname + "/index.html", "utf8");
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) { console.error("no script block found"); process.exit(1); }

function makeEl(id) {
  const el = {
    id: id || "", _html: "", textContent: "", value: "0", hidden: false,
    style: {}, dataset: {},
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    addEventListener(){}, removeEventListener(){},
    setAttribute(){}, getAttribute(){ return null; },
    insertAdjacentHTML(){}, scrollIntoView(){}, click(){}, focus(){},
    closest(){ return null; },
    querySelector(){ return makeEl(); }, querySelectorAll(){ return []; },
  };
  Object.defineProperty(el, "innerHTML", {
    get(){ return this._html; }, set(v){ this._html = String(v); }
  });
  return el;
}
const registry = {};
const documentStub = {
  documentElement: makeEl("html"),
  getElementById(id){ return registry[id] || (registry[id] = makeEl(id)); },
  querySelector(){ return makeEl(); },
  querySelectorAll(){ return []; },
  addEventListener(){}, removeEventListener(){},
};
const windowStub = {
  matchMedia(){ return { matches: true }; },
  addEventListener(){},
  scrollTo(){},
  innerWidth: 1400,
};
global.window = windowStub;
global.document = documentStub;
global.getComputedStyle = () => ({ getPropertyValue: () => "0 0 0" });

let failed = false;
try {
  eval(m[1]);
} catch (e) {
  console.error("RUNTIME ERROR:", e.message);
  console.error(e.stack.split("\n").slice(0, 4).join("\n"));
  process.exit(1);
}
console.log("IIFE executed without runtime errors.");

const P = window.__PCC__;
if (!P) { console.error("__PCC__ not exposed"); process.exit(1); }

// Independent re-derivation
const pkgs = P.rows;
const sum = k => pkgs.reduce((a, r) => a + r[k], 0);
const bac = sum("bac"), pv = sum("pv"), ev = sum("ev"), ac = sum("ac");
const eacBottomUp = pkgs.reduce((a, r) => a + r.bac / (r.ev / r.ac), 0);
const exp = {
  bac, pv, ev, ac,
  spi: ev / pv, cpi: ev / ac,
  eac: eacBottomUp, eacIndep: bac / (ev / ac),
  vac: bac - eacBottomUp,
  tcpi: (bac - ev) / (bac - ac),
  pct: ev / bac,
  bei: sum("actsD") / sum("actsP"),
  pf: sum("ernH") / sum("actH"),
};
const got = P.totals;
const checks = [
  ["bac", "bac"], ["pv", "pv"], ["ev", "ev"], ["ac", "ac"],
  ["spi", "spi"], ["cpi", "cpi"], ["eac", "eac"], ["eacIndep", "eacIndep"],
  ["vac", "vac"], ["tcpi", "tcpi"], ["pct", "pct"], ["bei", "bei"], ["pf", "pf"],
];
for (const [k, g] of checks) {
  const ok = Math.abs(exp[k] - got[g]) < 1e-6;
  if (!ok) { failed = true; console.error(`MISMATCH ${k}: expected ${exp[k]}, got ${got[g]}`); }
  else console.log(`ok  ${k.padEnd(9)} ${Number(got[g].toFixed(4))}`);
}

// KPI inventory
console.log("\nKPI count:", P.kpis.length, P.kpis.length === 20 ? "(ok)" : "(EXPECTED 20)");
if (P.kpis.length !== 20) failed = true;
const sparkIds = ["cpi","cv","eac","vac","tcpi","cdi","fund","spi","sv","cpli","bei","float","msv","expo","ccr","cor","pce","pf","rfi","trir"];
for (const k of P.kpis) {
  const v = k.val(), rag = k.rag();
  if (!sparkIds.includes(k.id)) { failed = true; console.error("no sparkline series for", k.id); }
  if (!/^[gar]$/.test(rag)) { failed = true; console.error("bad rag for", k.id, rag); }
  if (v === undefined || v === null || String(v).includes("NaN")) { failed = true; console.error("bad value for", k.id, v); }
  console.log(`  ${k.id.padEnd(6)} ${k.fam.padEnd(10)} ${String(v).replace(/<[^>]*>/g, "").padEnd(16)} rag=${rag}`);
}
// every KPI phases resolve to real phase keys
const phaseKeys = ["plan","env","pe","fd","proc","con","close"];
for (const k of P.kpis) for (const ph of k.ph)
  if (!phaseKeys.includes(ph)) { failed = true; console.error("unknown phase", ph, "on", k.id); }

// S-curve monotonicity invariants: EV<=PV, AC>=EV at all elapsed months
console.log("\nHeadline tie-out:");
console.log("  BAC", got.bac.toFixed(1), "| PV", got.pv.toFixed(1), "| EV", got.ev.toFixed(1), "| AC", got.ac.toFixed(1));
console.log("  SPI", got.spi.toFixed(3), "| CPI", got.cpi.toFixed(3), "| EAC", got.eac.toFixed(1), "| VAC", got.vac.toFixed(1));
console.log("  TCPI", got.tcpi.toFixed(3), "| CPLI(driving)", got.cpli.toFixed(3), "| BEI", got.bei.toFixed(3), "| PF", got.pf.toFixed(3));

process.exit(failed ? 1 : 0);
