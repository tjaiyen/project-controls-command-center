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
  [/\bAbbott\b/, "Abbott (zero basis anywhere in the underlying research)"],
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
ok(countArrayEntries("CORRIDORS", /\{key:/g) === 3, "CORRIDORS has all 3 (Quincy, Hillsboro, Puget Sound)");
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

console.log(fail ? "\nFAILED " + fail : "\nall ok");
process.exit(fail ? 1 : 0);
