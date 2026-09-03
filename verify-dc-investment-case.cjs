/* Static-analysis harness for dc-investment-case.html.
   Deliberately NOT a DOM-execution harness like verify.cjs/verify-facade.cjs/
   verify-walters-wolf.cjs -- this page builds its charts and interactive panels via
   real appendChild/createElementNS calls, not innerHTML string assembly, so a hand-stubbed
   DOM (this repo's existing pattern) can't execute it faithfully, and this repo is
   deliberately zero-dependency (no package.json, no node_modules -- see README/HANDOFF) so
   pulling in jsdom just for this one page would break that on purpose.
   Full interactive-behavior verification (charts render, risk rows expand, GC/corridor
   filters work, keyboard interaction, theme-toggle re-render, risk-sort order, live link
   hrefs) was done via real browser execution this session -- see the chat record. This
   harness covers what static analysis actually can: the two things most likely to
   silently regress -- fabricated content creeping back in, and a data array's entry count
   drifting from what the page claims/needs. */
const fs = require("fs");
const src = fs.readFileSync("dc-investment-case.html", "utf8");
const flat = src.replace(/\s+/g, " ");
let fail = 0;
const ok = (c, l) => { console.log((c ? "  ok   " : "  FAIL ") + l); if (!c) fail++; };

/* Sanitization sweep -- the exact fabricated content found and removed from the source
   deck this session must never reappear on this page, which was rebuilt from the deck's
   underlying chapters specifically to avoid inheriting it. */
const BANNED = [
  [/U\.S\. Bank has walked away|walked away from seven buildings/i, "the fabricated 'U.S. Bank walked from seven buildings' claim"],
  [/2 Columbia Center/i, "the fabricated '2 Columbia Center' anchor-tenant-loss claim"],
  [/Hensel Phelps/i, "Hensel Phelps (screened out in favor of the verified six-account GC table)"],
  [/\bAbbott\b/i, "Abbott (zero basis anywhere in the underlying research)"],
  [/1\.8 trillion/, "the self-contradicting '$1.8 trillion' maturity-wall figure (real figure is ~$2.5T)"],
  [/~1 in 6/, "the fabricated '~1 in 6 impaired' stat (real figure is 32% refinance success)"],
  [/6\.4%.*4\.2%|4\.2%.*6\.4%/, "the fabricated 6.4%/4.2% DSCR rate-spread figure"],
];
for (const [re, why] of BANNED) ok(!re.test(flat), "no " + why);

/* Data-array entry counts, extracted from each array literal in isolation (not a flat
   regex count across the whole file -- RISKS and BEAR both use a `{risk:` field, so a
   naive count of "risk:" across the file over-counts by BEAR's 5 entries). */
function countArrayEntries(varName, itemRe) {
  const m = src.match(new RegExp("var " + varName + " = \\[([\\s\\S]*?)\\n  \\];"));
  if (!m) return null;
  return (m[1].match(itemRe) || []).length;
}
ok(countArrayEntries("RISKS", /\{risk:/g) === 11, "RISKS has all 11 rows from the proposal's real risk register (the deck compressed this to 5)");
ok(countArrayEntries("BEAR", /\{risk:/g) === 5, "BEAR (bear-case table) has its 5 rows");
ok(countArrayEntries("GC", /\{corridor:/g) === 6, "GC has all 6 verified accounts (the deck's fabricated row is not among them)");
ok(countArrayEntries("PHASES", /\{n:/g) === 4, "PHASES has all 4 roadmap phases");
ok(countArrayEntries("CORRIDORS", /\{key:/g) === 2, "CORRIDORS has exactly 2 (Quincy, Hillsboro) -- Ch. 4 is explicit: \"exactly two buildable corridors\"");
ok(!/SCL|\bPSE\b|pugetsound/.test(flat), "no fabricated third 'Puget Sound conversions' corridor (SCL/PSE have zero basis in the research)");
ok(countArrayEntries("IMP", /\{label:/g) === 4, "IMP chart has all 4 panel scenarios");

/* Nav rail / section-id parity -- every nav link must have a matching section, and vice
   versa, or the active-highlight-on-scroll logic silently breaks for the orphaned one. */
const navHrefs = Array.from(flat.matchAll(/<a href="#([a-z]+)">/g)).map(m => m[1]);
const sectionIds = Array.from(flat.matchAll(/<section id="([a-z]+)"/g)).map(m => m[1]);
ok(navHrefs.length === 10 && sectionIds.length === 10, "10 nav links and 10 sections (got " + navHrefs.length + "/" + sectionIds.length + ")");
ok(navHrefs.every(h => sectionIds.includes(h)), "every nav link points at a real section id");
ok(sectionIds.every(s => navHrefs.includes(s)), "every section has a nav link (nothing orphaned from scroll-highlighting)");

/* Load-bearing figures actually present verbatim (the same headline numbers cited on
   walters-wolf.html's market-backdrop card, so the two pages can't silently disagree). */
["35.8%", "10,903 MW", "1.4%", "80.4%", "$2.5 trillion", "32%", "$121B", "12.34%"].forEach(fig =>
  ok(flat.includes(fig), 'cites "' + fig + '"'));

/* The deck link must point at a file that actually exists (same "provable, not asserted"
   discipline as verify-walters-wolf.cjs's equivalent check). */
ok(/href="docs\/Data_Center_Investment_Case_Walters_Wolf\.pptx"/.test(src), "links to the corrected deck");
ok(fs.existsSync("docs/Data_Center_Investment_Case_Walters_Wolf.pptx"), "the linked deck file actually exists in the repo");

/* /stress-test fixes (2026-09-03, both confirmed live via browser execution before trusting them):

   1. panel-wait was missing data-panel="wait" -- its own sibling panels (panel-wrong, panel-right)
      both have the attribute, this one didn't. The click handler matches panels by
      `p.dataset.panel === btn.dataset.panel`, so clicking "If we wait" opened NO panel at all --
      a real, user-visible blank-content bug, not a cosmetic one. Pin the attribute directly so a
      future edit that drops it again fails here instead of silently shipping a blank tab.

   2. The three tablist groups (decisionToggle, corridorToggle, phaseRail) had role="tablist"/
      role="tab" but no role="tabpanel" or aria-controls/aria-labelledby linking tabs to their
      panels -- an incomplete ARIA tab pattern that leaves screen-reader users without the panel
      association. Fixed on all three; pin that the wiring exists in both the static HTML
      (decisionToggle) and the JS that builds the other two at runtime. */
console.log("\n== /stress-test fixes (2026-09-03) ==");
ok(/id="panel-wait" role="tabpanel" aria-labelledby="tab-wait" data-panel="wait"/.test(src),
  'panel-wait has its data-panel="wait" attribute (its absence silently broke the "If we wait" tab)');
ok(/aria-controls="panel-wrong"/.test(src) && /aria-controls="panel-right"/.test(src) && /aria-controls="panel-wait"/.test(src),
  "decisionToggle's 3 tabs each have aria-controls pointing at their real panel");
ok(/role="tabpanel"/.test(src) && (src.match(/role="tabpanel"/g) || []).length >= 3,
  "at least 3 role=\"tabpanel\" elements exist (decision panels; corridor/phase panels are JS-generated, checked below)");
ok(/btn\.setAttribute\("aria-controls", "corridor-" \+ c\.key\)/.test(src) && /panel\.setAttribute\("role", "tabpanel"\)/.test(src),
  "corridorToggle's JS-generated tabs/panels are ARIA-wired at creation time");
ok(/btn\.setAttribute\("aria-controls", "phase-" \+ i\)/.test(src),
  "phaseRail's JS-generated tabs/panels are ARIA-wired at creation time");

/* Mobile chart legibility (2026-09-03): SVG text scales with the whole graphic, not just the
   viewport -- a bar-value label was measured at 6 CSS px tall on a 375px mobile viewport before
   this fix (live-measured via getBoundingClientRect, not assumed). Fixed with the same
   overflow-x:auto + fixed-intrinsic-width pattern .tblwrap already uses for wide tables on this
   page -- pin that the same discipline is applied to charts, not just tables. */
ok(/\.chart\{margin-top:16px;overflow-x:auto\}/.test(src) && /\.chart svg\{display:block;width:640px/.test(src),
  "charts use the same overflow-x:auto + fixed-width pattern as wide tables, instead of shrinking text below legible size on mobile");

/* CRIT fix, found by an independent fresh-context reviewer and confirmed by directly viewing the
   source proposal's own Chart 9.1 image before trusting the finding: the cash-flow array used to
   start POSITIVE and dip negative near the end -- roughly the inverse of the real chart, which is
   negative from month 1, troughs around month 9, and breaks even around month 15. Pin the shape,
   not just the presence of a chart -- a value-level check, not a decoration-level one. */
console.log("\n== CRIT fix: cash-flow shape (2026-09-03) ==");
{
  const m = src.match(/var CASHFLOW = \[([^\]]+)\];/);
  ok(!!m, "CASHFLOW array is present and parseable");
  if (m) {
    const vals = m[1].split(",").map(Number);
    ok(vals.length === 18, "CASHFLOW has 18 monthly points (got " + vals.length + ")");
    ok(vals[0] < 0, "starts negative (month 1), matching the source chart -- not positive");
    ok(vals[17] > 100, "ends well positive by month 18, matching the source chart's ~200 endpoint");
    const troughIdx = vals.indexOf(Math.min(...vals));
    ok(troughIdx === 8, "trough lands at month 9 (index 8), matching the source's own \"Maximum exposure ~ month 9\" label (got index " + troughIdx + ")");
    const crossIdx = vals.findIndex(v => v >= 0);
    ok(crossIdx === 14, "crosses to breakeven at month 15 (index 14), matching the source's own \"Illustrative breakeven ~ month 15\" label (got index " + crossIdx + ")");
  }
}

/* Chart render consolidation (2026-09-03): rendering used to happen at two independently-
   maintained call sites (initial load + theme-toggle handler), and they'd already drifted --
   the theme-toggle copy was missing every aria string and the schedule chart entirely. Pin that
   there is exactly one renderAllCharts function and exactly two call sites (defined-once,
   called-twice), not two independently-maintained render blocks. */
ok((src.match(/function renderAllCharts\(\)/g) || []).length === 1, "exactly one renderAllCharts definition (not two independently-drifting render blocks)");
ok((src.match(/renderAllCharts\(\)/g) || []).length === 2 || (src.match(/renderAllCharts\)/g) || []).length >= 1,
  "renderAllCharts is actually called (initial load + theme toggle), not just defined");
ok(/setTimeout\(renderAllCharts, 10\)/.test(src), "theme toggle calls the SAME renderAllCharts function, not a hand-duplicated subset");

console.log(fail ? "\nFAILED " + fail : "\nall ok");
process.exit(fail ? 1 : 0);
