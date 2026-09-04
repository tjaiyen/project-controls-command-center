# Handoff — Project Controls Command Center

A complete technical blueprint of everything in this repository: what it is, how it's built, what
every tab does, how the numbers are proven correct, and where to extend it. Written for anyone
picking this project up cold — a future maintainer, a collaborator, or future-me.

**Live:** https://tjaiyen.github.io/project-controls-command-center/
**Repo:** https://github.com/tjaiyen/project-controls-command-center

---

## 1. What this is

A phase-gated capital-program-controls dashboard, built as a job-application capability piece —
not a client deliverable, not connected to any real program. It demonstrates how a Project
Controls Manager would actually run a capital program: 20 derived KPIs across cost, schedule,
risk, change, delivery and compliance, each carrying its formula, threshold bands, the phases it's
meaningful in, and the specific play to run when it breaches — plus a phase-gate governance model,
an escalation matrix, a RAID/CAPA action register, and a data-integrity story that runs the same
math twice (JavaScript in the browser, SQL in DuckDB) and proves the two agree.

**All data is synthetic.** The program ("Cascade Transit Extension" — 18 miles, 12 stations, GC/CM
+ bid-build delivery, a fictional regional transit authority), its packages, risks, delays and
change log are invented to exercise the framework. No client, employer, or agency data appears
anywhere in this repository. The method is the content, not the numbers.

---

## 2. At a glance

| | |
|---|---|
| Primary file | `index.html` — 14,126 lines, one file, no build step |
| Top-level JS functions | 432 (fresh `grep -cE "^\s*function [a-zA-Z_]" index.html`, this pass) |
| Tabs | 13, grouped into 5 altitudes on the tab rail (Executive · Program Performance · Field & Assurance · Governance & Execution · Reference) |
| KPIs (with formula/threshold/phase/source/play each) | 20 |
| KPI families (`KPI_FAMILIES` — Cost/Schedule/Risk/Change/Delivery/Compliance) | 6, each with its own operational question + why-it-matters card on Overview |
| JS integrity-gate checks (`GUARDS`) | 30, re-run on every page load |
| Ingestion-validation checks (`INGEST_GUARDS`) | 2 |
| SQL/DuckDB parity checks (`pipeline/run_pipeline.py`) | 122, independently re-run and verified this pass. `stress.cjs` now live-verifies this count itself (2026-08-27, "resolve all limitations") when `pipeline/.venv` exists — create it once via `python3 -m venv pipeline/.venv && pipeline/.venv/bin/pip install duckdb`; without it, the check degrades to a loudly-flagged text-presence check rather than a silent one |
| Escalation-matrix rules (`ESCALATION`) | 12, each with a named owner, a clock, and (added 2026-08-26) a stated rationale for why its threshold sits where it does |
| Glossary terms (each with a live-computed worked example) | 76 |
| Actions/RAID register items | 17 (6 Issue, 10 Task, 1 Decision) |
| Control accounts / packages | 8 |
| Contracts | 6 |
| Risks | 7 (added R-07, extreme-weather exposure, 2026-08-26) |
| Delay events | 4 |
| Other 2026-08-26 proactive-mechanism additions (§8) | `OWNER_DECISIONS` (3), `SUB_HEALTH` (3), `LABOR_MOBILIZATION` (3), `CARBON_DISCLOSURE` (3), `AUDIT_LOG` (session-only, unbounded fact — see §8) |
| Progress-verification packages (`CLAIMED_PROGRESS`, GC-claimed vs. ledger-verified, AI & Data tab) | 8, 1 genuinely flagged today on real computed figures (GUARDS #30) |
| Stakeholder data-readiness agencies (`STAKEHOLDER_AGENCIES`, Wang's 6-force model + Carnegie next-play, AI & Data tab) | 6 real external agencies, added 2026-09-03 |
| `stress.cjs` test assertions | 4,094, all passing |
| `worker/smoketest.js` assertions (Ask AI backend, §10) | 40, all passing — a 3rd, independent test harness, Node-only, no real network/Cloudflare runtime |
| Companion pages | `otak.html` (fit brief, 449 lines), `architecture.html` (static pipeline map, 598 lines), `walters-wolf.html` (second-audience fit brief) + `facade.html` (unitized curtain-wall controls dashboard) — added 2026-09-02, merged to `main` 2026-09-03; see their own `README.md` rows and `verify-walters-wolf.cjs`/`verify-facade.cjs` harnesses (not written up in §13 yet — flagged in §18). Also `dc-investment-case.html` (interactive data-center investment case, added 2026-09-03, linked from `walters-wolf.html`) + `docs/Data_Center_Investment_Case_Walters_Wolf.pptx` (companion deck) + `verify-dc-investment-case.cjs` — same §13/§18 gap |
| Companion backend (never deployed — see §10) | `worker/` — a Cloudflare Worker for the Ask AI feature; `ASK_AI_WORKER_URL` in `index.html` is still the `REPLACE-ME` placeholder |
| Hosting | GitHub Pages, served directly from `main`, zero build |
| Git history | 218 commits |

Current EVM tie-out (verify live in the browser console via `__PCC__.totals`, or `node verify.cjs`):

| | |
|---|---|
| BAC | $1,240.0M |
| PV / EV / AC | $847.0M / $819.7M / $857.6M |
| SPI / CPI | 0.968 / 0.956 |
| EAC (bottom-up) / (independent, BAC÷CPI) | $1,303.7M / $1,297.3M |
| VAC | −$63.7M |
| TCPI (to BAC) | 1.099 |
| CPLI (driving path) | 0.878 |
| BEI / PF | 0.937 / 0.959 |
| Complete | 66.1% |

---

## 3. Repository layout

```
index.html               the dashboard — everything below lives inside this one file
otak.html                fit brief: requirement-by-requirement coverage vs. a real posting
architecture.html        a static, hand-verified snapshot of the pipeline diagram (see §13)
README.md                public-facing overview (shorter, sales-oriented version of this doc)
stress.cjs                adversarial test harness — stubs the DOM, exercises every interaction
verify.cjs                independent EVM tie-out — re-derives every total from raw package data
worker/                  Cloudflare Worker backend for the Executive Command tab's "Ask AI"
                         free-text Q&A — NOT deployed (ASK_AI_WORKER_URL is still the REPLACE-ME
                         placeholder in index.html; the feature is dormant on the live page). §10.
  index.js                request handler: CORS, rate limit, closed tool-use loop, mechanical
                         fact-check against the real ledger, cost accounting
  lib.js                  pure guardrail logic factored out for unit testing (the 10-tool TOOLS
                         array, fact-check regex, budget math) — no network/KV/DO dependency
  budget-do.js             BudgetCounter Durable Object — an atomic shared daily-spend ceiling
                         (a plain KV check-then-write let concurrent requests race past the cap;
                         see the file's own comment for the 2026-08-25 /stress-test numbers)
  smoketest.js             40-assertion Node test harness for index.js/lib.js's request-handling
                         logic end-to-end, against a scripted fake Anthropic response + fake KV/DO
                         — a 3rd, independent test harness alongside stress.cjs/verify.cjs (§11)
  wrangler.toml            Cloudflare Worker + KV namespace + Durable Object binding config
pipeline/
  run_pipeline.py         synthesizes raw claims, builds the ledger in DuckDB, proves SQL == JS
  models/
    fct_control_account.sql   the control-account mart, built in SQL from the same raw inputs
    schema.yml                dbt-style column tests (not null, relationships, expected ranges)
  output/                 gitignored — the pipeline's own JSON artifact, regenerated on each run
docs/
  HANDOFF.md               this file — durable architecture reference
  KNOWN_GAPS.md            volatile deferred-work log + full session provenance (split out of
                         this file 2026-09-03; check it before assuming something isn't built yet)
  ASK_AI_SETUP.md          TJ-only deployment steps to turn the (currently dormant) Ask AI
                         feature on — Cloudflare account + own Anthropic key, never handed to an
                         assistant
.private/, otak-session-notes.md   gitignored — internal research notes, never published
```

No `node_modules`, no `package.json`, no bundler config (GitHub Pages serves the static files
directly from `main` with no build step). `.github/workflows/test.yml` (added 2026-09-02,
/stress-test finding: the four harnesses above had no automated gate — a broken commit could reach
`main` without any of them ever running) runs `verify.cjs`, `verify-facade.cjs`,
`verify-walters-wolf.cjs`, `stress.cjs`, and `worker/smoketest.js` on every push/PR, with a real
`pipeline/.venv` set up in CI so the live SQL/DuckDB parity check runs for real there too, not the
degraded text-only fallback.

---

## 4. Architecture & stack

**Static HTML, one file, zero dependencies.** `index.html` is CSS (inline `<style>`) + markup +
one `<script>` block containing a single IIFE with 432 top-level functions (§2's table has the
current count — this line previously drifted behind it, /stress-test finding, 2026-09-02; see
§2's note on the prior 176-vs-204 mismatch). No framework, no
bundler, no CDN, no `npm install`. Opening the file directly in a browser (`file://`) or serving it
with any static file server works identically — the repo's own convention for local testing is
`python3 -m http.server` from the repo root.

**Rendering pattern.** Every visible number is computed at render time from raw literal data —
nothing is a pre-computed, hand-typed string. The core data structure is `PKGS` (8 literal
objects: `id, bac, pv, ev, ac, commit, float, cpRem, actsP, actsD, ernH, actH`), from which
`derive()` computes every per-package ratio (SPI, CPI, EAC, CPLI, BEI, PF, …), and `rows` /
`T` (the reduced portfolio total) are built once at load. Every chart, table, and KPI card reads
from `rows`/`T` or one of the sibling arrays (`WBS`, `RISKS`, `DELAYS`, `CONTRACTS`, `ACTIONS`,
`KPIS`, `GUARDS`, `CPH_CELLS`, `GLOSS`, …) — never a separately-typed duplicate.

**Redraw model.** `redrawCharts()` re-runs the chart-rendering functions that need to respond to
theme toggle / tab switch (`renderScurve`, `renderWaterfall`, `renderCont`, `renderRisk`,
`syncMcView`, `renderGantt`, `renderScurveScrub`, `renderGateLine`, `renderCdeFlow`). A handful of
functions (`renderGuards`, `renderStatControl`, `renderEwmaControl`, `renderActions`, …) run once
at page-init instead, because their content doesn't depend on theme or the active tab — calling
them from `redrawCharts()` would just be wasted work.

**Theming.** Three-layer CSS custom-property pattern: bare `:root` defines the dark-default
palette, `@media (prefers-color-scheme: light)` swaps it for a light one, and
`:root[data-theme="dark"|"light"]` lets the in-page Theme button override either direction
explicitly. Dark-theme color tokens are bare RGB triplets (`--c-accent: 96 165 250`) so call sites
wrap them as `rgb(var(--c-accent))`, except `--c-line`/`--c-grid`/`--c-elev`, which are already
complete CSS values.

**Debugging surface.** `window.__PCC__` exposes every raw data array and every derive*/format
function used on the page — `rows`, `totals` (`T`), `kpis`, `guards`, `actions`, `wbs`, `risks`,
`delays`, `contracts`, `gates`, `gate5Checks`, `gloss`, `findGloss`, `deriveCph`, `deriveZScores`,
`deriveEwma`, `deriveDrbEmv`, `drbAssumptions`, `deriveGbmParams`, `deriveEarnedSchedule`,
`dsNodes`/`dsCaption`, `glNodes`/`glCaption`, `archNodes`/`archCaption`, `state`, `program`, and
more (grep `window.__PCC__=` in `index.html` for the exhaustive current list). This is the same
object `stress.cjs` drives its assertions against, and the same one you can poke at live in any
browser's dev console to independently sanity-check a number.

---

## 5. Data model

| Array / object | Count | What it is | Read by |
|---|---|---|---|
| `PKGS` → `rows` / `T` | 8 packages, 1 portfolio total | The ledger: BAC/PV/EV/AC/commit/float/cpRem/activity-counts/hours per control account | Nearly every tab |
| `WBS` | 8 | Scope element ↔ CBS category ↔ OBS owner ↔ control account, one row per package | Operating Framework (WBS/CBS/OBS table, the "100% Rule" proof) |
| `KPIS` | 20 | id/family/abbr/name/tier/formula/threshold/phase/source/why/play, per metric | Overview KPI board, Operating Framework's reference library |
| `GUARDS` | 30 | Deterministic reconciliation checks, re-run against the live ledger on every load — the 29th (added 2026-08-26) requires a logged root cause on any closed Quality NCR; the 30th (added 2026-09-03) flags any package whose GC-claimed progress exceeds ledger-verified progress by more than 5% | AI & Data tab's integrity gate |
| `CLAIMED_PROGRESS` | 8 | GC-claimed percent-complete per package (Schedule of Values), reconciled against ledger-verified EV/BAC — CP-501 genuinely flagged today (91.0% claimed vs. 81.7% verified) | AI & Data tab's Progress Verification card + GUARDS #30 |
| `STAKEHOLDER_AGENCIES` | 6 | Real external agency categories (FTA, State DOT, City Utilities, a regional utility, a State Environmental Agency, an adjacent municipality), each scored against Wang (2018)'s 6 data-sharing forces, paired with a Carnegie-principle next move via `CARNEGIE_PLAY` | AI & Data tab's Stakeholder Data-Readiness card |
| `INGEST_GUARDS` | 2 | Raw-record validation (no negative AC, EV ≤ BAC) — distinct from `GUARDS`' reconciliation | AI & Data tab |
| `ESCALATION` | 12 | Escalation-matrix rule: trigger condition, owner, response-time clock, and (added 2026-08-26) a rationale string naming why the threshold sits where it does | Operating Framework tab's escalation matrix |
| `RISKS` | 7 | id/name/probability(1-5)/impact-cost/root cause — R-07 (extreme-weather exposure) added 2026-08-26 | Risk & Change tab (tornado chart + heat map) |
| `DELAYS` | 4 | id/classification (`Excusable — compensable` / `Non-excusable` / `Recovered`)/days/fragnet | Schedule tab's TIA register |
| `CONTRACTS` | 6 | Award value, approved/pending change, contingency allocation, per contract | Risk & Change tab's commercial register (a third axis, distinct from control accounts) |
| `ACTIONS` | 17 | RAID register: Issue/Task/Decision, owner, opened/due/touch dates, root/corrective/preventive fields | Actions tab |
| `CPH_CELLS` | 1 crew, 6 weeks | Crew cost-per-hour history for CP-201's tunnel crew | Delivery tab, AI & Data's z-score/EWMA control charts |
| `GLOSS` | 61 | Term/definition/live-computed worked example, each independently traceable to real data | Glossary tab + every inline "i" help icon site-wide |
| `LEDGER_INPUTS` | 11 | Name/abbr/description/live-computed worked example, one per raw `PKGS` field — human-facing metadata for the ledger card, not a second copy of the data itself | Overview tab's ledger card |
| `KPI_LEDGER` / `KPI_LEDGER_MIXED` / `KPI_LEDGER_NONE` | 14 / 3 / 6 | Which raw ledger fields actually feed each KPI, stated honestly — pure-ledger, mixed with another register, or not ledger-derived at all | KPI drawer's "Computed from the ledger" / "Not from the ledger" box |
| `PROGRAM` | 32 fields | Everything not per-package: contingency, funding, safety (TRIR), RFI aging, subcontractor turnaround, change-order pipeline | Cost, Schedule, Delivery, Risk & Change tabs |
| `DRB_ASSUMPTIONS` | `{pOwnerWins: 0.55, legalCost: 0.75}` | Illustrative-only assumptions for the settle-vs-escalate decision tree — never mutated by the interactive slider (§8) | Risk & Change tab |
| `DS_NODES` / `GL_NODES` / `ARCH_NODES` | 12 / 13 / 12 | The three story-navigator flow diagrams' node lists (see §8) | Data Strategy, Operating Framework, AI & Data tabs |
| `OWNER_DECISIONS` | 3 | Pending owner/agency decision: ask/agency/submitted/neededBy/blocks, own aging clock | Operating Framework tab; a 5th independent source in the triage queue |
| `SUB_HEALTH` | 3 | Subcontractor financial-health watch on the 3 highest-exposure contracts, 90-day check cycle | Risk & Change tab, near the contract register; a 6th triage-queue source |
| `LABOR_MOBILIZATION` | 3 | Real driving-schedule trade: mobilization lead-time confirmed vs. required, a leading indicator | Schedule tab, after the float-erosion section |
| `CARBON_DISCLOSURE` | 3 | RCW 39.116-covered material: EPD-submitted / quantity-reported readiness, deliberately not a compliance-threshold KPI | AI & Data tab, next to the integrity gate |
| `AUDIT_LOG` | Session-only, bounded at 50 | Real, working per-session interaction log (timestamp/action/detail) — a genuine mechanism demonstration, not a claim of enterprise multi-user audit logging | AI & Data tab |

`PROGRAM.name` = "Cascade Transit Extension", `PROGRAM.client` = "Regional transit authority
(illustrative)", `PROGRAM.corridor` = "18 miles · 12 stations", `PROGRAM.delivery` = "GC/CM +
bid-build packages" — the fictional program identity every tab's narrative refers back to.

---

## 6. Derived metrics (EVM formulas)

The ledger holds eleven raw inputs per control account; everything else is computed in the
browser at render time — nothing is a stored result.

```
SV   = EV − PV            schedule variance ($)
CV   = EV − AC             cost variance ($)
SPI  = EV / PV              <1 behind schedule (in dollars, not days)
CPI  = EV / AC              <1 over cost
EAC  = BAC / CPI            forecast at completion at current efficiency (one of four methods shown)
VAC  = BAC − EAC            forecast over/(under) run
TCPI = (BAC−EV)/(BAC−AC)    efficiency the remaining work must hit to land on budget
CPLI = (cpRemaining + totalFloat) / cpRemaining   DCMA: <0.95 flagged
BEI  = activitiesDone / activitiesPlanned          DCMA: <0.95 flagged
PF   = earnedHours / actualHours                    leading indicator; moves before CPI
```

Portfolio EAC is rolled up **bottom-up** (the sum of the 8 packages' own EACs), because each
package is its own control account with its own cost efficiency. The independent check —
portfolio `BAC / CPI` — is displayed alongside it (`$1,297.3M` vs. `$1,303.7M` above). The two
legitimately differ; a single blended CPI would hide the spread between packages, and that spread
is exactly what a program manager needs to see. `GUARDS` checks both figures reconcile to their
own independent recomputation, not just that they exist.

Beyond the core EVM block, three more derivation families exist:

- **Statistical process control** (`deriveZScores`, `deriveEwma`) — population mean/σ/z-score and
  an exponentially-weighted moving average with dynamic control-limit bands, run against
  `CPH_CELLS`' real 6-week crew cost-per-hour series. AI & Data tab.
- **Decision analysis** (`deriveDrbEmv`) — expected monetary value of settling a pending change
  now vs. escalating to a Dispute Review Board; linear in the win-probability assumption, so a
  slider can sweep the whole curve from two endpoints (§8). Risk & Change tab.
- **Diffusion / forecasting** (`deriveGbmParams`, `deriveEarnedSchedule`) — geometric Brownian
  motion log-return MLE for cost drift/volatility, and earned-schedule (a time-based EVM reading,
  distinct from the dollar-based SPI). Cost tab.

---

## 7. Tab-by-tab guide

Tabs are grouped on the rail into 5 altitudes (real DOM order, `.tab-group-label` markup,
`index.html:901-916` — **not** the `TABS=[...]` JS array's own literal order, which lists `exec`
last; that array's own comment claims it "matches the tab rail's visual/DOM order," which this
pass found is no longer true — flagged, not fixed here, since it's a code comment, not a doc):

| Altitude | Tabs | Why grouped together |
|---|---|---|
| **Executive** | Overview, Executive Command, Portfolio | Board-level rollups, the 20-KPI health check, and a plain-language proactive-problem-solving view |
| **Program Performance** | Cost, Schedule, Risk & Change | Core EVM, CPM driving path, priced/commercial risk — Risk & Change sits here, not with Delivery, because it's priced/commercial content, not field-level telemetry |
| **Field & Assurance** | Delivery, AI & Data | What's happening on the ground + whether the data behind it can be trusted |
| **Governance & Execution** | Operating Framework, Actions, Attention & Triage, Data Strategy | Attention & Triage sits with Actions — both are accountability/follow-through tooling, not a reference lookup |
| **Reference** | Glossary | The one genuine lookup tool, alone on purpose |

| # | Tab (id) | What's on it |
|---|---|---|
| 1 | **Overview** (`over`) | A "Six lenses, not one blended score" card explaining what each of the 6 KPI families (Cost/Schedule/Risk/Change/Delivery/Compliance) actually asks and why it can't be folded into the others, a "Three layers, not one number" card naming this dashboard's own leading-telemetry / confirming-EVM / independent-assurance architecture for the first time (each layer real, already built, just never named as one system), directly above the 20-KPI board with drill-down detail (formula/threshold/source/play per card, plus a "computed from the ledger" / "not from the ledger" provenance box, honestly stated per KPI), a live root-cause-to-owner trace, the eleven-input ledger card (all 11 raw fields, a per-package inspector, and a live "change one input, watch the KPIs move" demo — reads a local snapshot, never mutates the real ledger), an 11-stop guided Tour with tab-jumping evidence links, an executive summary. |
| 2 | **Executive Command** (`exec`) | Plain-English Gate 5 status, a proactive-problem-solving sandbox, context callouts — the board-level "what does this actually mean" reading of the same real data, distinct from Overview's KPI-board detail view. Also hosts the **Ask AI** free-text Q&A (§10) — dormant by default (opt-in per session, zero network calls until enabled) and not yet deployed live (`ASK_AI_WORKER_URL` is still the `REPLACE-ME` placeholder). |
| 3 | **Portfolio** (`port`) | Agency-level rollup across 4 lines of business — one reads live off this program's own totals (never duplicated, `GUARDS`-checked), three are summary-only illustrative peers. |
| 4 | **Cost** (`cost`) | EVM S-curve + variance bridge, an estimate-to-budget baseline bridge reconciled to the ledger, four-method EAC, a forecast-reliability section (EAC trend, a naive-drift-vs-linear-regression forecaster comparison with a disclosed identical-first-value caveat, monthly cash flow), what-if forecasting with 3 live sliders + scenario comparison, Monte Carlo completion distribution (10,000 runs, seeded/reproducible, a Triangular/PERT draw-shape toggle, an opt-in AACE 57R-09 risk-driver layer), a reference-class-forecast comparison band (this program's own Monte Carlo P10/P50/P80/P95 against a real Flyvbjerg-derived megaproject reference-class multiplier), the cost-diffusion (GBM) card — with a log-return strip plot + fitted-curve overlay, a "Math unlocked" plain-language drawer, and an EVM-vs-GBM methodology comparison (what each method assumes, never a forward-projected figure), a CII PDRI front-end-planning completeness tracker (per-package, 8-checkpoint), an AACE RP 17R-97/56R-08 estimate-classification card (Class 5-1 per control account), an FTA Standard Cost Category (SCC) realignment of `T.bac` into the real 10-category worksheet (reconciles exactly), an FHWA LCCA 30-year NPV comparison (ballasted vs. direct-fixation track, real discount-rate methodology, explicitly illustrative dollar inputs), a WSDOT-style cost-code / unit-price bid-item breakdown one level below the FTA SCC categories (real TxDOT-sourced concrete/excavation unit rates, 3 honest-gap lines where no verified public rate exists, a real quantity-vs-price variance decomposition, a 25%-quantity-overrun contract-adjustment flag, real Sound Transit/LA Metro reference benchmarks) with a Pareto cost-driver ranking one level below the package-level variance bridge, an AACE estimating-method column added to the estimate-classification card, a sticky in-tab section-anchor rail. |
| 5 | **Schedule** (`sched`) | DCMA-style schedule health — SPI, SPI(t)/Earned Schedule, CPLI, BEI, the full objective metric triad the DCMA 14-Point Assessment and ANSI/EIA-748 sit under, named explicitly (checks 13/14, with the other 12 stated as a real gap) — a Gantt-style bar with baseline vs. forecast, a fragnet-based delay & TIA register tied to package float, a labor-availability leading indicator (3 real driving-schedule trades, mobilization lead-time confirmed vs. required — AGC/ABC-sourced), revenue-service forecast drift, statistical control charts (z-score + EWMA) over crew cost-per-hour. |
| 6 | **Risk & Change** (`risk`) | A priced risk register (probability × impact heat map + sensitivity tornado chart, 7 risks including a 2026-08-26 extreme-weather addition), an integrated cost-schedule risk view (ICSRA — which of the 7 risks carry a real, derivable joint cost+schedule hit, reusing the existing risk→action linkage, not a fabricated map), a Washington State Auditor Sound Transit lessons card (real design-deficiency change-order exposure + geotechnical-coverage findings, cross-referenced against this program's own PDRI front-end-planning status), a forward material-price exposure trigger extending CDI (real AGC steel/aluminum index data against R-04's own escalation-clause mitigation), a subcontractor financial-health watch (3 highest-exposure contracts, 90-day check cycle), a contract commercial register (a third axis distinct from control accounts), change pipeline with proposed-vs-settled pricing defense, the settle-vs-DRB EMV decision tree with an **interactive slider + chart** (§8). |
| 7 | **Delivery** (`del`) | Leading indicators (productivity factor by package, RFI/submittal aging, a quality NCR register with real open counts and per-item aging read live off the Actions/RAID register), the crew cost-per-hour module with a drill-down into idle/rework/baseline attribution. |
| 8 | **AI & Data** (`ai`) | The pipeline architecture diagram (interactive — §8), a stakeholder data-readiness register (added 2026-09-03 — 6 real external agencies scored against Wang (2018)'s 6-force interagency data-sharing model, each paired with a named Carnegie next move, or flagged as outside persuasion's reach where the real blocker is legal authority), the SQL model, a live 30-check integrity gate (the 29th, added 2026-08-26, gates Quality NCR closure on a logged root cause; the 30th, added 2026-09-03, is the Progress Verification check — flags any package whose GC-claimed progress exceeds ledger-verified progress by more than 5%, plus its own dedicated card) + 2 ingestion-validation checks, a GAO-20-195G cost-estimate credibility checklist (audits this dashboard's own real features — SCC coverage, parity-check count, KPI-registry completeness — against GAO's 4 real characteristics, honestly scored Partial where the underlying gap is real), an embodied-carbon disclosure-readiness tracker (RCW 39.116-covered materials, deliberately not a compliance-threshold KPI — the real WA law is disclosure-only) with a California Buy Clean Act (AB 262) rebar GWP-cap comparison (real numeric caps, the comparable federal program correctly flagged as rescinded/defunded in 2025) and an Envision (ISI) rating-structure card (real 64-credit/5-category framework, deliberately no fabricated score), a real per-session activity/change-audit log, statistical control (z-score/EWMA) with worked-math accordions, a Hotelling's T² multivariate control chart (joint cost + idle-time, honestly caveated at n=6), a multivariate anomaly score across all 8 packages (a root-sum-of-squares composite over every metric's z-score, with a signed-sum direction disclosure so a package that outperforms everywhere isn't rendered with the same color as one that's genuinely bad), and AI narrative generation under a verification contract (§10). |
| 9 | **Operating Framework** (`fw`) | Phase playbook, the WBS/CBS/OBS/ABS control-account mapping (with a worked "100% Rule" proof, carrying an illustrative ABS tag per row alongside WBS/CBS/OBS), Board phase-gate governance with a live Gate-5 hard stop, a 12-rule escalation matrix (each rule now also carries a stated rationale for its threshold, a mentoring/knowledge-transfer artifact added 2026-08-26), a pending owner/agency decisions register (its own aging clock, a 5th independent triage source), a live Working-Backward/inversion worked example, reporting cadence, stakeholder interface map, the 20-metric KPI reference library. |
| 10 | **Actions** (`act`) | A RAID/CAPA register with proactive staleness detection, owner accountability rollup, a real cost-overrun-driver taxonomy (Cantarelli/Flyvbjerg's 4-category technical/economic/psychological/political framework plus ASCE stakeholder attribution, applied to this program's own 3 real root-caused actions), a worked-math accordion for `actionStatus()`'s threshold logic. |
| 11 | **Attention & Triage** (`triage`) | Cross-cutting "what needs a human right now" view — every firing escalation rule, stale RAID item, near-term deadline, and pre-breach condition, pulled live from the same registers every other tab reads (no duplicated data). |
| 12 | **Data Strategy** (`data`) | A real-world plan for connecting scattered, multi-system data — ISO 19650 CDE staging architecture as an interactive flow diagram (§8), a 4-tile IDS guardrail status grid with a genuinely live 2-check ingestion-validation panel embedded in it, automated guardrails, a discrepancy-resolution decision flow folded into that same diagram, a Category/Trigger/Routing proactive-error-recovery table, a Dual-Stack Parity card citing this program's own real, live CPI against the actual SQL that independently re-derives it. |
| 13 | **Glossary** (`gloss`) | 76 terms, each with a live-computed worked example, a real category (5 domains — Cost & EVM, Schedule & CPM, Risk/Commercial & Governance, Field Telemetry & Quality, Data Strategy & Architecture — with a live pill filter), and a real "See it live" cross-tab jump button — the same content the inline "i" help icons pull from site-wide. Filterable by search AND category together, and reachable from anywhere via a bare `/` keypress. |

Plus, outside the tab body: **Presentation Mode** (a scripted 2-set walkthrough with presenter
notes), an **11-stop guided Tour**, a **printable executive brief**, light/dark **Theme** toggle,
a text-size control (`A-`/`Normal`/`A+`, persisted to `localStorage`), and — below 1050px — a
**sticky tab bar + anchor rail** so switching sections or jumping to an in-tab anchor no longer
requires scrolling back to the top (`--bar-height`/`--tabs-height` custom properties, kept accurate
live via `ResizeObserver`, since the header grows to multiple rows below 1050px and no fixed pixel
offset is correct at every width).

---

## 8. Interactivity catalog

Everything below is a real DOM interaction, independently covered by `stress.cjs`:

- **3 story-navigator flow diagrams** — click or Space/Enter any node to select it; a story card
  below shows a genuinely additive caption (not a restatement of the box label), with Prev/Next
  buttons and position dots:
  - **Gate-Line** (Operating Framework) — 13 nodes, the phase-gate timeline.
  - **CDE flow** (Data Strategy) — 12 nodes, the ISO 19650 states + the discrepancy-resolution
    branch folded in at the point it actually happens (the Shared verification gate).
  - **Pipeline architecture** (AI & Data) — 12 nodes (6 sources + dbt staging + marts + integrity
    gate + 3 outputs); each source node names the *specific* live field/downstream tab it feeds
    (e.g. the cost ledger names `PKGS[].ac` and the z-score/EWMA controls it feeds), and the
    integrity-gate node clarifies the dbt-side 122-check count vs. this tab's own live
    `GUARDS.length` (30) — two independently-run stacks, not one gate wearing two names.
- **7 hover/click tooltips on `bars()`-rendered charts** (EAC trend, float, CPLI, schedule drift,
  float erosion, productivity, crew cost-per-hour) plus the risk heat map — each shows the real
  underlying numbers, not just a highlight.
- **3 independent drill-down drawers** — KPI root-cause (Overview), crew cost-per-hour
  idle/rework/baseline attribution (Delivery), Actions row detail (Actions).
- **1 ledger-card demo slider** (Overview: Actual Cost, per selected package) — recomputes CPI/EAC/
  VAC live from a local snapshot of the selected `PKGS` entry; never touches the real ledger, and
  `stress.cjs` independently re-derives its expected output rather than calling the app's own
  formula. Min/max are built outward from the package's real AC in whole step multiples specifically
  so the baseline value always lands exactly on the slider's own step grid — an earlier version
  independently rounded min/max and let a real browser's step-snapping silently drift the "reset"
  value off the true figure, caught only by live-browser verification, not by the test suite alone.
- **4 sliders on the What-If model** (Cost tab: CPI, SPI, contingency $M) + **2 sliders on the DRB
  EMV decision tree** (Risk & Change: win probability, legal cost) — the DRB sliders drive local
  display state only and never mutate `DRB_ASSUMPTIONS`; a small SVG chart makes the "escalating
  can never beat settling" structural finding visible across the whole probability range instead
  of asserting it as one static delta.
- **76-term glossary** with live search filter, plus a click-driven inline "i" help icon next to
  jargon anywhere on the page — both read from the same `GLOSS` array, so there's one source of
  truth for every definition.
- **1 six-KPI-families card** (Overview: `KPI_FAMILIES`) — each of the 6 family tiles carries its
  own real operational question, its "why this can't be folded into the others" rationale, and its
  own independently-counted KPI total (never hand-typed against `KPIS`), plus an inline "i" help
  icon resolving to the matching Glossary entry. Each family filter button on the KPI board (§9)
  also now carries that same question as a native `title` tooltip. A cross-reference button jumps
  to and flashes the Schedule tab's `schedDriftCard`, the existing "one root cause, five
  instruments" story — reusing `data-jump-tab`/`data-jump-el`, not a new nav mechanism.
- **Data Strategy tab UI/UX round** (`GUARDRAILS` grid, `RECOVERY_ROWS` table, dual-stack parity
  card): the 4 IDS guardrail categories restyled from a plain table into a `.ledgerGrid` tile grid
  (same pattern as the six-KPI-families card above), with the one genuinely live, IDS-shaped check
  this ledger has (`INGEST_GUARDS`, 2 checks) embedded directly in Tile 2 — `renderIngestGuards()`
  was generalized to take a target-element id so both this tab and the AI & Data tab's own panel
  share one implementation, not a copy. The "Proactive error recovery" section's 3 prose boxes
  became a Category/Trigger/Routing table, same real categories, no invented SLA numbers. A new
  Dual-Stack Parity card cites this program's own live `T.cpi` next to the literal SQL line from
  `pipeline/models/fct_control_account.sql` that independently re-derives it, plus the real,
  reproducible `python3 pipeline/run_pipeline.py` command — a "here's the receipt" callout, not a
  fabricated live-polling badge (the tab's own guardrail-count tripwire in `renderDataStrategy()`
  explicitly notes there's no live multi-system feed to poll on this synthetic build).
- **Monte Carlo draw-shape toggle** (Cost tab: `mcDistTri`/`mcDistPert`, Triangular ↔ PERT) —
  answers a question TJ asked directly (why triangular over PERT?) by building the alternative,
  not just explaining the choice. `triang()`'s closed-form inverse-CDF has no PERT equivalent, so
  PERT draws through a real Gamma (Marsaglia-Tsang, via a Box-Muller Gaussian) → Beta (ratio of two
  Gammas) → PERT (Beta scaled into `[lo,hi]` with the standard λ=4 shape parameters) chain — see
  `gaussRnd`/`gammaRnd`/`betaRnd`/`pertRnd` (all shared through one `mcDraw(rnd,p,dist)` call site
  so `computeMc()`, the math explainer, and the one-run stepper can't drift onto different
  distribution logic from each other). The canonical `MC` run (the print brief / board figure's
  source) is always triangular regardless of the toggle — the same "board number never silently
  changes" guarantee the per-account uncertainty filter already had. The math explainer
  (`renderMcMath()`) branches its own copy on the active distribution so it never describes
  triangular while PERT is actually selected, or vice versa — including the real, computed α/β
  shape parameters and PERT's own textbook mean, not narrated numbers.
- **Megaproject-controls-doc upgrade** (Schedule/Operating Framework/Delivery tabs, 2026-08-21) —
  extracted from a downloaded infrastructure-controls research doc, grounded against the live code
  before building anything (most of the doc's framework — RCF, CPLI/BEI, multi-method EAC, phase
  gates, ISO 19650 CDE, IDS guardrails, TIA fragnets, DRB — was already built): the Schedule tab's
  DCMA citation box now names the DCMA 14-Point Assessment and ANSI/EIA-748 explicitly (CPLI/BEI
  are checks 13/14 by definition), stating the other 12 checks as a real, honest gap (they need an
  activity-level CPM network this ledger doesn't carry) rather than implying full coverage. Earned
  Schedule/SPI(t) — already computed by `deriveEarnedSchedule()` but previously buried inside the
  SPI KPI's own click-through drawer — now joins CPLI/BEI as a 4th headline `schedTriad` tile,
  completing the "objective metric triad" the doc names as one coherent unit. The WBS/CBS/OBS
  "100% Rule" table gained a real ABS tag per row, closing the gap between the table and the
  WBS-vs-ABS mismatch already narrated at length elsewhere. A new Quality NCR register (Delivery
  tab, `renderNcr()`) reads real open counts and per-item aging live off the same `ACTIONS`/RAID
  register every other tab's stale-flag logic already reads — deliberately **not** a fabricated
  generation-vs-closure rate, since only 2 real NCR rows exist on this ledger, nowhere near enough
  for a genuine trend; the card says so explicitly rather than implying more precision than the
  data supports. Adding a 3rd Delivery leading indicator required updating 2 separate framing
  sites (`KPI_FAMILIES`'s Delivery entry, the `delivery` GLOSS entry) that both hard-named exactly
  2 — `stress.cjs` now carries a drift guard asserting both name all 3, so this can't silently go
  stale the way the "N instruments" and "twenty-seven checks" bugs did earlier this session. The
  doc's own specific case-study figures (East Link, Big Dig, Crossrail, Sydney Metro) were
  deliberately **not** cited anywhere — they trace to secondary sources the doc itself never
  appears to have independently verified, the same caution this project already applies to any
  AI-synthesized research (see the plan file's own grounding note).
- **Three-layer architecture card** (Overview tab, `LAYERS`/`renderLayersGrid()`, 2026-08-21) — a
  47-file research package's own Insight 4 named a real pattern this dashboard already implements
  but had never stated as one architecture: leading telemetry (Delivery family's 3 indicators) →
  confirming EVM/Earned Schedule (`schedTriad`'s 4 tiles) → independent computed assurance
  (`GUARDS`/`INGEST_GUARDS`). Pure narrative synthesis — nothing new computed, every number read
  live off the real arrays it names (`GUARDS.length`, `INGEST_GUARDS.length`), with a jump button
  per layer to the real tab/element it describes. One candidate citation was dropped rather than
  used: an attempt to independently verify a specific "20% faster / 75% fewer false alarms"
  EWMA-on-Earned-Schedule finding via `WebFetch` against the primary PDF was inconclusive (the
  fetch couldn't confirm the claim from the readable text), so the card states only what's true
  and already verified about this dashboard's own real mechanisms, not an unconfirmed external
  number. Also added: the Gate 5 card's existing prose now states the post-lock re-baselining
  governance principle explicitly (a locked baseline should never move without the same
  independent review the lock required) — narrative only, since no re-baseline event is modeled
  on this synthetic ledger to gate against, stated honestly as a principle, not an enforced check.
- **Multivariate anomaly score** (AI & Data tab) — a root-sum-of-squares composite z-score across
  all 8 packages' full metric set, ranking packages by *breadth* of deviation rather than any
  single metric. Direction-blind by construction (a package that outperforms on every metric scores
  identically to one that's genuinely bad), so a signed-sum (`dir`/`sumSigned`) drives the bar's
  red/amber/green coloring and an explicit "the real story is…" disclosure sentence, rather than
  letting the neutral composite number imply a verdict it can't honestly give.
- **Forecaster comparison** (Cost tab, forecast-reliability section) — naive-drift vs. a 2-point
  least-squares linear regression, stepped one period ahead. The two methods' first forecast row is
  mathematically guaranteed identical (a 2-point fit stepped one period ahead reduces to the same
  formula as the naive drift), disclosed on-page rather than left to read as a bug.
- **Sticky tab bar + anchor rail below 1050px** — `.tabs`/`.anchor-rail` gain `position:sticky`
  once the header wraps to more than one row (below 1050px, where a fixed `--nav-height` offset is
  no longer accurate); `syncStickyNavOffsets()` keeps `--bar-height`/`--tabs-height` live via
  `ResizeObserver`, called once at the very end of the render cascade (not at its own definition
  site) so the header's badges/counts are already populated before the first measurement — an
  earlier version measured too early and captured a wrong, too-short header height.
- **Ask AI free-text Q&A** (Executive Command tab, dormant by default — §10) — a guardrailed
  question-answering panel over the real ledger, opt-in per session, zero network calls until
  enabled, and not yet deployed live (`ASK_AI_WORKER_URL` is still the placeholder).
- **12 `<details class="dbox">` "how this is actually computed" accordions** — each walks a
  worked example against real data (S-curve PV formula, waterfall bridge, Gantt forecast-finish,
  CPLI driving-path arithmetic, risk exposure, Monte Carlo per-run formula, crew cost-per-hour
  weekly overrun, z-score arithmetic, EWMA recursive update, the WBS "100% Rule" as literal
  addition, `actionStatus()`'s branch order, the per-package ledger inspector).
- **11-stop guided Tour**, **2-set Presentation Mode** with a presenter-notes popup, **printable
  executive brief** — all reuse the live data, never a separately-authored summary.
- **Cross-account hover-highlight** on the S-curve/waterfall/Gantt.
- Keyboard support throughout: every clickable node also responds to Tab + Enter/Space, and
  `:focus-visible` gets a visible accent ring distinct from `:hover`.
- **10 proactive-prevention mechanisms** (brainstorm-mode round, 2026-08-26, sourced from a
  researched "Top 20 strategic challenges" pass — see the vault's own
  `11_STRATEGIC_CHALLENGES_AND_SOLUTIONS.md`), each a real, tested mechanism, not narrative only:
  the pending owner/agency decisions register, the subcontractor financial-health watch, the
  escalation-matrix rationale field, R-07 (extreme-weather risk), the labor-availability leading
  indicator, the forward material-price exposure trigger, the QA/QC-to-critical-path closure
  gate (GUARDS #29), the embodied-carbon disclosure-readiness tracker, the shadow-ledger framing
  on the Dual-Stack Parity card, and the session activity/change-audit trail — see §5/§7 for
  where each lives. One of these (embodied-carbon) was substantively rebuilt mid-round after
  independent verification found the original research's WA "Buy Clean" assumption was wrong —
  the real statute (RCW 39.116) is disclosure-only, not a numeric compliance threshold; corrected
  before it shipped, not after.

---

## 9. Guardrails & integrity system

Three layers, each catching a different failure mode:

1. **`GUARDS`** (30 checks, JS, re-run on every page load, AI & Data tab) — reconciliation: does
   the portfolio BAC equal the sum of package budgets? Does SPI/CPI recompute to the same value
   shown elsewhere? Does the risk exposure equal `Σ P_BAND[p] × cost`? Does every control account
   map to exactly one contract? Does every "current period" figure shown in a trend series read
   live off the same source every other tab reports, rather than a duplicated literal? One check
   (`Compliance sweep`) scans the *rendered page's own text* for prohibited claim patterns
   (fabricated tool/certification claims) — genuinely live-verified, not a no-op: an earlier
   /stress-test found it silently passing in the test harness (no `document.body` in the DOM
   stub) while genuinely FAILING on the live page (false-flagging two allowlisted citations); both
   the guard's allowlist and the test harness's blind spot were fixed the same session. The 29th
   check (added 2026-08-26, a formal QA/QC-to-critical-path gate) requires a logged root cause on
   any Quality NCR before it can be marked closed — passes trivially today (neither real NCR is
   closed yet), a real structural invariant behaviorally proven to flip to FAIL when tested against
   a synthetic closed-without-root-cause NCR, then restored.
2. **`INGEST_GUARDS`** (2 checks) — raw-record validation *before* reconciliation: no negative
   actual cost, no package with EV > BAC. A different failure class than `GUARDS` (a record that's
   internally consistent but individually implausible vs. one that's inconsistent with the rest of
   the ledger).
3. **`pipeline/run_pipeline.py`** (122 checks, SQL/DuckDB, offline) — the same ledger built twice,
   independently, in two different languages. See §12.

---

## 10. AI features — narrative generation + Ask AI

Two distinct AI features exist on this dashboard, both under a verification contract:

**AI narrative generation** (AI & Data tab) — an AI-generated narrative draft where every cited
figure is independently re-derived and checked against the live ledger before it's allowed to post
(the `FIGS[]`/`renderNarr()` pattern: figures are pulled from `rows`/`T` by name, never hand-typed
into the prose string). This was a real bug class earlier in this project's history — a
magic-index array coupling in an earlier draft of `renderNarr()` let the narrative silently cite
the wrong package's numbers — fixed and now guarded by a `stress.cjs` assertion that the cited
figure matches an independent recomputation, not just that *a* number is present.

**Ask AI** (Executive Command tab) — a free-text Q&A panel over the real ledger, dormant by
default (`state.askAiEnabled` starts `false`; a reader must click "Enable Ask AI for this
session" — zero network calls until then) and **not deployed live**: `ASK_AI_WORKER_URL` in
`index.html` is still the `REPLACE-ME` placeholder (deploying it is a TJ-only step —
`docs/ASK_AI_SETUP.md`). The backend (`worker/`, a Cloudflare Worker) holds the real Anthropic API
key — `index.html` is fully static/public and can never hold it. Guardrails, most to least novel:

- **Closed tool-use, not open generation.** The model can only call 10 named, narrowly-scoped
  tools (`get_totals`, `get_kpi`, `list_kpis`, `get_risk`, `list_risks`, `get_action`,
  `list_actions`, `get_gate5_status`, `get_mc_stats`, `get_opening_date`, all defined in
  `worker/lib.js`'s `TOOLS` array) — it cannot free-generate a number, only ask for one by name and
  quote what the tool returns.
- **Mechanical fact-check**, not model self-report — the response is checked against the real
  ledger after generation, the same "verify, don't trust the model's own claim" contract §10's
  narrative feature already uses.
- **Atomic daily budget ceiling** (`worker/budget-do.js`, a Durable Object, not plain KV) — a
  `/stress-test` finding (2026-08-25): a plain KV check-then-write let 20 concurrent requests all
  succeed, with 19 of 20 real cost updates silently lost to a last-write-wins race (recorded spend
  $0.30 for what should have read ~$6.00). A Durable Object serializes calls against the same id,
  which is what makes the fix atomically correct, not a bigger retry loop. `$2.00`/day hard
  ceiling, reserved conservatively upfront per question, before ever calling Anthropic.
- **Per-IP rate limit** (KV-backed, best-effort only — KV has no atomic increment, so this specific
  limiter can be raced under a burst; the Durable Object budget cap above is the real backstop on
  total cost regardless).
- **`worker/smoketest.js`** (40 assertions) exercises the full request-handling logic end-to-end
  against a scripted fake Anthropic response and fake KV/DO — real coverage despite `stress.cjs`
  structurally being unable to test this (no real network/KV/DO exists in its Node DOM stub).
  Verify with `wrangler deploy --dry-run` and one real question before trusting it live.

---

## 11. Testing & verification

**`stress.cjs`** (4,094 assertions, all passing) — stubs the DOM, loads `index.html`'s script
verbatim into that stub, and exercises it exactly like a user would: every tab switch, every
filter, every drawer, every slider drag, every keyboard interaction. 92 labeled sections (fresh
`grep -c 'console.log("=='` count, this pass):

```
A. static structure          B/B2. runtime + portfolio tab       C. narrative vs. data
D. interactions               D2. Monte Carlo/scenarios/print     D3. AI & data tab
D4. tour/glossary/motion      D4.5–D4.10. stress-test fix rounds  D5–D5.8. cost/schedule/WBS/
  baseline/change-pricing/TIA/crew-CPH/gate-governance/working-backward/gate-line/contracts
D6. actions tab                D7. presentation mode               D8. KPI root-cause drill-down
D9/D9.1. Data Strategy + CDE flow   D10. inline term help          D11. interactive motion
D12. bars()/heat-map tooltips  E. otak.html                        F. fabrication/sanitization sweeps
G. text-size localStorage persistence
```

**Testing doctrine, enforced throughout:** every assertion independently re-derives its expected
value from raw/literal data in the test file itself — **never** by calling the app's own
`derive*()` function and reapplying the same formula. This caught real circularity bugs earlier in
the project (a test that would pass even if the app's math were wrong, because it was checking the
app's answer against itself). A magic-number count (e.g. "exactly N `dbox` panels exist") gets a
dated comment explaining the count and why it changed, not a silent bump.

**`verify.cjs`** — a second, independent harness: re-derives every portfolio total (`BAC`, `PV`,
`EV`, `AC`, `SPI`, `CPI`, `EAC`, `VAC`, `TCPI`, `CPLI`, `BEI`, `PF`) directly from the 8 packages'
raw literal values, with zero code shared with the app's own `derive()`/`T` logic. Run it after any
change that could touch a headline number:

```bash
node verify.cjs   # prints the tie-out table; compare against §2 above
node stress.cjs   # prints "N passed, 0 failed" — any regression fails loudly
```

**`worker/smoketest.js`** (40 assertions) — a third, independent harness, covering the Ask AI
backend's request-handling logic (§10) end-to-end against a scripted fake Anthropic response and
fake KV/DO. This is real coverage `stress.cjs` structurally cannot provide (no network/KV/DO exists
in its Node DOM stub):

```bash
node worker/smoketest.js   # prints "N passed, 0 failed"
```

---

## 12. Data pipeline — SQL/DuckDB parity proof

`pipeline/run_pipeline.py` is the second independent stack the AI & Data tab's "two stacks, one
set of numbers" claim refers to. It:

1. Parses the 8 control accounts' raw `bac/pv/ev/ac` straight out of `index.html`'s own source —
   so the SQL side can never silently drift onto different input data than the JS side.
2. Loads them into DuckDB and builds `models/fct_control_account.sql` — the same SPI/CPI/EAC
   derivation, in SQL instead of JavaScript.
3. Runs `models/schema.yml`'s column-level guardrails (uniqueness, not-null, referential
   integrity, expected-range checks).
4. Diffs every SQL-derived value against the JS-derived value, per package, plus 4 whole-ledger
   guardrails (EV ≤ PV everywhere, % complete ≤ 1 everywhere, SPI within a sane band, no duplicate
   package IDs) and one portfolio-level reconciliation.

**Re-verified 2026-09-03** (a `/stress-test` pass on this session's own new Claude Code
infrastructure, not assumed from any earlier claim): installed `duckdb` into `pipeline/.venv`
and ran it fresh —

```
$ pipeline/.venv/bin/python3 pipeline/run_pipeline.py
...
portfolio: {'bac': 1240.0, 'pv': 847.0, 'ev': 819.7, 'ac': 857.6}
ALL CHECKS PASSED
```

122 PASS, 0 FAIL — matching both `index.html`'s own "122 checks" prose and `README.md`'s claim
exactly, and the portfolio totals match the JS-side tie-out in §2 to the decimal. Requires
`pip install duckdb`; no other dependency, no network access, no credentials. (Count grew from 54
to 64 on 2026-08-21, `/stress-test` round: `schema.yml` declared 10 guardrail tests — claim_id
unique/not_null, package_id not_null + referential integrity, pv/ev/ac_delta ≥ 0 on
`stg_progress_claims`, plus package_id/bac not_null and bac≥1 on `fct_control_account` — that
`run_pipeline.py` documented but never actually ran; all 10 are now real checks. Also fixed a
mislabeled check() string that printed "ev <= pv" for what was actually testing ev≤bac. Grew again,
64→65, on 2026-08-25 (a temporal-fence guardrail added to `schema.yml`); 65→101, on 2026-09-02, when
the schedule-risk composite feature added `fct_schedule_risk`/`stg_risk_register` guardrails; then
101→103 the same day, when a `/stress-test` finding on that same feature forced the risk-to-package
link through a real `stg_actions` join instead of a hand-authored column, adding 2 more; then
103→122 on 2026-09-03, when the progress-verification feature added `fct_progress_verify`/
`stg_claimed_progress` — 3 parse checks, 8 rows + 8 per-package parity checks + 1 threshold check,
and 6 schema.yml-mirroring guardrails.)
The raw claim rows are synthesized to sum back to the dashboard's own PV/EV/AC totals by
construction (a residual-cents plug, see `run_pipeline.py`'s own `distribute()` comment) — so this
proof covers the SQL aggregation/formula layer agreeing with the JS layer, not an independently-
sourced dataset reproducing the dashboard's numbers. Worth stating plainly rather than implying
more than a synthetic single-source demo can prove.

---

## 13. Companion pages

- **`otak.html`** — "Fit Brief: requirement-by-requirement coverage against a Project Controls
  Manager posting, gaps included." A separate, self-contained HTML file (449 lines) built around
  the same design system, honestly naming shortfalls rather than only strengths. Re-verified
  against the live posting twice already (per its own header, 17 Aug 2026 and 26 Aug 2026 — still
  live, still open, every requirement and the salary range unchanged) — re-verify against the
  current live posting before reuse, since job postings and TJ's own gap profile both change.
- **`architecture.html`** (598 lines) — a **static, hand-verified snapshot** of the pipeline
  diagram, distinct from `index.html`'s own interactive `#arch` diagram (§8). The README already
  flags this distinction explicitly ("A verified snapshot, not a live render"). The diagram's own
  *drawing* still has no automated check tying it to `index.html`'s `#arch` diagram — if the
  pipeline architecture changes again, update both by hand. Its **prose counts** (20 KPIs, 30
  guards, 122 SQL checks, 17 actions) are a different story: `stress.cjs`'s `E.1. architecture.html
  sync` section now reads this file's own source the same way it already read `otak.html`'s, and
  asserts those counts against `index.html`'s live arrays — added 2026-08-21 after a live, 3rd
  stale "twenty-seven" instance was found in this file's own `aria-label` (§18 gap #3/#9), and
  extended 2026-08-26 to also assert `P.tabs.length===13` and `P.escalation.length===12` — closing
  the exact gap class that let this file's tab/escalation counts drift undetected between rounds.
- **`worker/`** (Cloudflare Worker backend for the Executive Command tab's Ask AI feature, §10) —
  companion-*code*, not a companion *page*: no HTML, never served to a browser directly. Not
  deployed; `ASK_AI_WORKER_URL` in `index.html` is still the `REPLACE-ME` placeholder.

---

## 14. Theming, accessibility, responsive

- **Theme**: dark-default, light via `prefers-color-scheme` or the manual Theme toggle (persisted).
- **Motion**: draw-in charts, staggered card entrances, growing histogram bars — all gated behind
  `@keyframes drawin` + a `prefers-reduced-motion` media query.
- **Text size**: `A-`/`Normal`/`A+` control, persisted to `localStorage`, guarded with try/catch
  (the DOM stub used by `stress.cjs` has no `window.localStorage`, so every read/write is wrapped).
- **Keyboard nav**: every interactive SVG node (`flow-node`) is `tabindex="0" role="button"` with
  Enter/Space activation and a `:focus-visible` ring distinct from hover.
- **Mobile**: verified with zero horizontal overflow at 320–375px width across every tab (including
  the newest DRB EMV chart, which scales its `viewBox` correctly down to ~300px client width).
- **ARIA live regions**: debounced narrative panels (`aria-live="polite"`) so a fast slider drag
  doesn't spam a screen reader with every intermediate value — the debounce fires once the drag
  settles, not on every `input` event.

---

## 15. Deployment

GitHub Pages, serving directly from `main` — no build step, no deploy pipeline. Pushing to `main`
*is* the deploy. (Do not add a build step without a real reason — the zero-dependency, zero-build
architecture is the point, not an oversight.)

**Correction (/stress-test finding, independent reviewer, 2026-09-03):** this section previously
said "no Actions workflow" — false, and directly contradicted by §3/§11 of this same document:
`.github/workflows/test.yml` (added 2026-09-02) is real and runs on every push/PR. What's still
true: it's advisory, not a hard gate — a direct push to `main` is never blocked on it, only a PR
merge could be, and this project doesn't require PRs today. `CLAUDE.md`'s own pre-push hook
(machine-local only) is the actual push-time gate.

---

## 16. Local development

```bash
git clone https://github.com/tjaiyen/project-controls-command-center.git
cd project-controls-command-center
python3 -m http.server 8000        # or just open index.html directly — both work
# → http://localhost:8000/index.html

node stress.cjs                    # full interaction test suite
node verify.cjs                    # independent EVM tie-out
node worker/smoketest.js           # Ask AI backend request-handling logic (§10/§11)

python3 -m venv pipeline/.venv && pipeline/.venv/bin/pip install duckdb
pipeline/.venv/bin/python3 pipeline/run_pipeline.py   # SQL/JS parity proof
```

No `package.json`, no lockfile, no `npm install` step for the dashboard itself — `stress.cjs` and
`verify.cjs` are plain Node scripts using only built-ins.

---

## 17. Extension points

For a future maintainer adding to this dashboard:

- **New KPI**: add one object to `KPIS` (needs `id/fam/abbr/name/tier/f/th/ph/src/why/act`) — it
  automatically appears on the Overview board and the Operating Framework's reference library. Add
  a corresponding `GUARDS` entry only if the metric has an independent way to recompute itself
  (most do); if it doesn't, say so rather than adding a guard that just re-reads the same value.
- **New glossary term**: add one `{k,t,p,e}` object to `GLOSS` (`e` must be a function returning a
  **live-computed** worked example — never a hand-typed number). Add a `data-help="key"` icon
  anywhere in the markup to surface it inline; the icon and the Glossary tab both resolve through
  the same `findGloss()`.
- **New story-navigator diagram**: copy the CDE-flow (`renderCdeFlow`/`selectDS`/`dsCaption`,
  §8) pattern exactly — a `*_NODES` array, a `*Caption(node)` function with genuinely additive
  content (not a restatement of the node label), a `select*(idx)` function, and the matching
  `#*StoryCard`/`#*StoryTitle`/`#*StoryText`/`#*Pos`/`#*Dots`/`#*Prev`/`#*Next` HTML block copied
  verbatim (`.story-dots` is already generic CSS).
- **New `bars()`-rendered chart with a tooltip**: pass a 4th `tipFmt(item, i)` closure argument to
  the existing `bars(el, items, fmt, tipFmt)` helper — it wires the shared `#tip` element once per
  container via a `dataset.tipWired` guard.
- **Every new number added anywhere** must independently trace to a real `derive*()` function or a
  literal in `PKGS`/`WBS`/`RISKS`/`DELAYS`/`CONTRACTS`/`ACTIONS`/`CPH_CELLS`/`PROGRAM` — never a
  hand-typed figure that merely looks consistent with the rest of the page. This is the single
  rule this project has enforced most consistently, and the one a `stress.cjs` assertion should
  check for anything new.


---

## 18. Known gaps / deferred work, and document provenance

Moved to [`docs/KNOWN_GAPS.md`](KNOWN_GAPS.md) 2026-09-03 (Claude Code workflow-leverage round) —
this file had grown to 1,802 lines mixing durable architecture (§1-17 above, rarely changes) with
a volatile, ever-growing session-by-session log (named deferred work + every count's provenance).
Same content, split by volatility, not rewritten. Check `docs/KNOWN_GAPS.md` before assuming
something named there isn't built yet — several "known gaps" have already been resolved and the
log says so explicitly, dated.
