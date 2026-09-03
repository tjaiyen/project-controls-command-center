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

/* Cross-document consistency, not just internal correctness. This page's "Where I'd start" and
   "operation specifically" sections are static hand-authored HTML -- nothing in the DOM stub above
   touches them, so this harness had ZERO coverage of a real defect found in the 2026-09-02
   stress-test pass: this page kept an entirely superseded version of Option A (still named
   "Bid-to-Actual Margin Reconciliation", assuming an ERP exists) for 97 minutes after PROPOSAL.md
   was rewritten to drop that assumption. A harness that never looks at a section can't catch drift
   in it. These checks close that hole -- they pin the CURRENT offer names/claims directly against
   the page source, so a future edit to one document without the other fails loudly here instead of
   silently. */
ok(/Estimating History Assembly/.test(flat), 'Option A is named "Estimating History Assembly" (current)');
ok(!/Bid(-|&#8209;)to(-|&#8209;)Actual Margin Reconciliation/.test(flat), 'Option A is NOT the superseded "Bid-to-Actual Margin Reconciliation" name (entity-tolerant match)');
ok(/The shared substrate/.test(flat), 'Option B is named "The shared substrate" (current)');
ok(!/the actuals live in the ERP/.test(flat), 'no longer asserts an ERP exists (the 2026-09-02 finding)');
ok(!/Read access to whatever holds actual cost today/.test(flat), 'no longer asks for ERP/job-cost read access as a precondition');
ok(/Estimating re-derives price it already paid for once/.test(flat), 'the "estimating re-derives price" leak (current 6th item) is present');

/* Market-backdrop card (added 2026-09-02, sourced from independently-verified public market data --
   see feedback discussion). Same static-section blind spot as above: nothing in the DOM stub touches
   this card, so pin its load-bearing figures directly so a future edit can't quietly drop or corrupt
   a cited number. Kept deliberately narrow -- no strategy recommendation is asserted here, only that
   the sourced facts are present, because the card itself takes no position on which market the branch
   should build into. */
ok(/35\.8%/.test(flat), 'Seattle office vacancy stat (35.8%, Kidder Mathews Q2 2026) is present');
ok(/10,903 MW/.test(flat), 'CBRE data-center inventory stat (10,903 MW, H1 2026) is present');
ok(/kidder\.com\/market-reports/.test(flat), 'Kidder Mathews source link is present');
ok(/cbre\.com\/insights\/books\/north-america-data-center-trends-h1-2026/.test(flat), 'CBRE H1 2026 source link is present');
ok(/grantpudqtep\.org/.test(flat), 'Grant PUD QTEP source link is present');
ok(!/should (pivot|retool|reposition)|we recommend|the recommended path/i.test(flat), 'market-backdrop card stays descriptive -- no strategy recommendation asserted on a public page');

console.log(fail ? '\nFAILED ' + fail : '\nall ok');
process.exit(fail ? 1 : 0);
