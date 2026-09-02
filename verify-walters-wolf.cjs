/* Minimal DOM stub + execute walters-wolf.html's IIFE, same technique as verify.cjs. */
const fs = require('fs');
const src = fs.readFileSync('walters-wolf.html', 'utf8');
const script = src.match(/<script>([\s\S]*?)<\/script>/)[1];
let fail = 0;
const ok = (c, l) => { console.log((c ? '  ok   ' : '  FAIL ') + l); if (!c) fail++; };

function makeEl(id){
  const el = {
    id, innerHTML:'', dataset:{}, attrs:{},
    setAttribute(k,v){ this.attrs[k]=v; }, getAttribute(k){ return this.attrs[k]; },
    addEventListener(){}, querySelectorAll(){ return []; }, querySelector(){ return null; },
    closest(){ return null; }
  };
  return el;
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

const rows = (get('covBody').innerHTML.match(/<tr /g) || []).length;
const cells = (get('cov').innerHTML.match(/covcell/g) || []).length;
ok(rows === 18, 'coverage table renders 18 rows (got ' + rows + ')');
ok(cells === 5, 'summary strip renders 5 cells (got ' + cells + ')');
ok(/10 \/ 17/.test(get('cov').innerHTML), 'core tally reads 10 / 17');
ok(/pill gap/.test(get('covBody').innerHTML), 'at least one gap pill rendered');
ok(!/undefined/.test(get('covBody').innerHTML), 'no "undefined" leaked into rendered rows');
ok(!/undefined/.test(get('cov').innerHTML), 'no "undefined" leaked into summary strip');

/* Sanitization sweep. Whitespace-NORMALISED on purpose: a line-based grep gave a false clean on
   2026-09-02 because "a manufacturer's" straddled a line break in the hero paragraph, and only a
   screenshot caught it. Collapsing whitespace first is the fix for that whole defect class. */
const flat = src.replace(/\s+/g, ' ');
const BANNED = [
  [/a (defense )?manufacturer'?s?\b/i,
   'anonymised employer — every other employer on the page is named, so this reads as evasive'],
  [/\b80\s*%/,              'the unverified "80% of labour moves off-site" figure'],
  [/\b92\s*%/,              'the retired bid-to-award statistic'],
  [/Rainier Tower|815 Pine|Holland Construction|Weber Thompson/i,
   'a real Walters & Wolf project name — implies data we do not have'],
  [/277K|208K|VSLAP|DAGIR/i,'a B.E. Meyers business outcome (counsel-gated as a case study)'],
  [/\b138\b/,               'the 138-DAX drift number; canonical is 180+ per master_resume.md:301']
];
for (const [re, why] of BANNED) ok(!re.test(flat), 'no ' + why);

console.log(fail ? '\nFAILED ' + fail : '\nall ok');
process.exit(fail ? 1 : 0);
