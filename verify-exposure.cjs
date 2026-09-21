/* Exposure guard (added 2026-09-20): keeps employer-identifying and interview-coaching text out of the
   dashboard, the pages linked from it, the README, and the published Pages site. Run: node verify-exposure.cjs */
const fs = require("fs");
let fails = 0, n = 0;
function ok(cond, msg) { n++; if (cond) console.log("  ok   " + msg); else { fails++; console.log("  FAIL " + msg); } }
const read = (f) => fs.readFileSync(f, "utf8");
const index = read("index.html"), facade = read("facade.html"), arch = read("architecture.html"), readme = read("README.md");

console.log("== presenter notes carry no coaching or employer lines ==");
[/Dave's own words/, /Otak-specific/, /Do NOT cite the real/, /Say it before they ask/, /Manager-level thinking/, /Over-explaining makes it bigger/].forEach((re) =>
  ok(!re.test(index), "index.html has no " + re));
ok(!/otak/i.test(index), "index.html names no employer (otak)");

console.log("== facade and architecture pages ==");
ok(!/href="walters-wolf\.html"/.test(facade), "facade.html does not link walters-wolf.html");
ok(!/walters/i.test(facade), "facade.html names no employer (walters)");
ok(!/real at Otak/.test(arch), "architecture.html does not say 'real at Otak'");

console.log("== README ==");
ok(!/3775557|req #/.test(readme), "README carries no requisition number");
ok(!/\]\((otak|walters-wolf|dc-investment-case)\.html\)/.test(readme), "README does not hyperlink the employer fit-brief pages");
ok(!/Walters_Wolf/.test(readme), "README does not reference the employer-named deck");
ok(!/No client, employer, or agency data\s+appears anywhere in this repository/.test(readme), "README does not make the false blanket 'no employer data' claim");

console.log("== deck removed and unreferenced ==");
ok(!fs.existsSync("docs/Data_Center_Investment_Case_Walters_Wolf.pptx"), "the employer-named deck is not in the repo");
["index.html", "dc-investment-case.html", "walters-wolf.html", "README.md"].forEach((f) =>
  ok(!/Walters_Wolf\.pptx/.test(read(f)), f + " does not reference the deck"));

console.log("== Pages site excludes harnesses and docs ==");
ok(fs.existsSync("_config.yml"), "_config.yml exists");
const cfg = fs.existsSync("_config.yml") ? read("_config.yml") : "";
["README.md", "CLAUDE.md", "docs", "stress.cjs"].forEach((p) => ok(new RegExp("^\\s*-\\s+" + p.replace(".", "\\.") + "\\s*$", "m").test(cfg), "_config.yml excludes " + p));

console.log("\n" + (fails ? "FAILED " + fails + " of " + n : "all ok (" + n + " checks)"));
process.exit(fails ? 1 : 0);
