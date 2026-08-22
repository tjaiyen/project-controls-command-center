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
| Primary file | `index.html` — 7,874 lines, one file, no build step |
| Top-level JS functions | 176 (not re-audited this round — see §18 gap note) |
| Tabs | 11 |
| KPIs (with formula/threshold/phase/source/play each) | 20 |
| KPI families (`KPI_FAMILIES` — Cost/Schedule/Risk/Change/Delivery/Compliance) | 6, each with its own operational question + why-it-matters card on Overview |
| JS integrity-gate checks (`GUARDS`) | 28, re-run on every page load |
| Ingestion-validation checks (`INGEST_GUARDS`) | 2 |
| SQL/DuckDB parity checks (`pipeline/run_pipeline.py`) | 64, independently re-run and verified this pass |
| Glossary terms (each with a live-computed worked example) | 55 |
| Actions/RAID register items | 15 (4 Issue, 10 Task, 1 Decision) |
| Control accounts / packages | 8 |
| Contracts | 6 |
| Risks | 6 |
| Delay events | 4 |
| `stress.cjs` test assertions | 1,846, all passing |
| Companion pages | `otak.html` (fit brief), `architecture.html` (static pipeline map) |
| Hosting | GitHub Pages, served directly from `main`, zero build |
| Git history | 117 commits |

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
pipeline/
  run_pipeline.py         synthesizes raw claims, builds the ledger in DuckDB, proves SQL == JS
  models/
    fct_control_account.sql   the control-account mart, built in SQL from the same raw inputs
    schema.yml                dbt-style column tests (not null, relationships, expected ranges)
  output/                 gitignored — the pipeline's own JSON artifact, regenerated on each run
docs/
  HANDOFF.md               this file
.private/, otak-session-notes.md   gitignored — internal research notes, never published
```

Nothing else exists. No `node_modules`, no `package.json`, no bundler config, no CI workflow file
in this repo (GitHub Pages serves the static files directly from `main` with no build step).

---

## 4. Architecture & stack

**Static HTML, one file, zero dependencies.** `index.html` is CSS (inline `<style>`) + markup +
one `<script>` block containing a single IIFE with 169 top-level functions. No framework, no
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
| `GUARDS` | 28 | Deterministic reconciliation checks, re-run against the live ledger on every load | AI & Data tab's integrity gate |
| `INGEST_GUARDS` | 2 | Raw-record validation (no negative AC, EV ≤ BAC) — distinct from `GUARDS`' reconciliation | AI & Data tab |
| `RISKS` | 6 | id/name/probability(1-5)/impact-cost/root cause | Risk & Change tab (tornado chart + heat map) |
| `DELAYS` | 4 | id/classification (`Excusable — compensable` / `Non-excusable` / `Recovered`)/days/fragnet | Schedule tab's TIA register |
| `CONTRACTS` | 6 | Award value, approved/pending change, contingency allocation, per contract | Risk & Change tab's commercial register (a third axis, distinct from control accounts) |
| `ACTIONS` | 17 | RAID register: Issue/Task/Decision, owner, opened/due/touch dates, root/corrective/preventive fields | Actions tab |
| `CPH_CELLS` | 1 crew, 6 weeks | Crew cost-per-hour history for CP-201's tunnel crew | Delivery tab, AI & Data's z-score/EWMA control charts |
| `GLOSS` | 55 | Term/definition/live-computed worked example, each independently traceable to real data | Glossary tab + every inline "i" help icon site-wide |
| `LEDGER_INPUTS` | 11 | Name/abbr/description/live-computed worked example, one per raw `PKGS` field — human-facing metadata for the ledger card, not a second copy of the data itself | Overview tab's ledger card |
| `KPI_LEDGER` / `KPI_LEDGER_MIXED` / `KPI_LEDGER_NONE` | 14 / 3 / 6 | Which raw ledger fields actually feed each KPI, stated honestly — pure-ledger, mixed with another register, or not ledger-derived at all | KPI drawer's "Computed from the ledger" / "Not from the ledger" box |
| `PROGRAM` | 32 fields | Everything not per-package: contingency, funding, safety (TRIR), RFI aging, subcontractor turnaround, change-order pipeline | Cost, Schedule, Delivery, Risk & Change tabs |
| `DRB_ASSUMPTIONS` | `{pOwnerWins: 0.55, legalCost: 0.75}` | Illustrative-only assumptions for the settle-vs-escalate decision tree — never mutated by the interactive slider (§8) | Risk & Change tab |
| `DS_NODES` / `GL_NODES` / `ARCH_NODES` | 12 / 13 / 12 | The three story-navigator flow diagrams' node lists (see §8) | Data Strategy, Operating Framework, AI & Data tabs |

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

| # | Tab (id) | What's on it |
|---|---|---|
| 1 | **Overview** (`over`) | A "Six lenses, not one blended score" card explaining what each of the 6 KPI families (Cost/Schedule/Risk/Change/Delivery/Compliance) actually asks and why it can't be folded into the others, a "Three layers, not one number" card naming this dashboard's own leading-telemetry / confirming-EVM / independent-assurance architecture for the first time (each layer real, already built, just never named as one system), directly above the 20-KPI board with drill-down detail (formula/threshold/source/play per card, plus a "computed from the ledger" / "not from the ledger" provenance box, honestly stated per KPI), a live root-cause-to-owner trace, the eleven-input ledger card (all 11 raw fields, a per-package inspector, and a live "change one input, watch the KPIs move" demo — reads a local snapshot, never mutates the real ledger), a 10-stop guided Tour with tab-jumping evidence links (§18 gap #8 — this doc previously called it "five-chapter," a stale phrase with no matching code), an executive summary. |
| 2 | **Portfolio** (`port`) | Agency-level rollup across 4 lines of business — one reads live off this program's own totals (never duplicated, `GUARDS`-checked), three are summary-only illustrative peers. |
| 3 | **Cost** (`cost`) | EVM S-curve + variance bridge, an estimate-to-budget baseline bridge reconciled to the ledger, four-method EAC, a forecast-reliability section (EAC trend, forecast-accuracy scorecard, monthly cash flow), what-if forecasting with 3 live sliders + scenario comparison, Monte Carlo completion distribution (10,000 runs, seeded/reproducible, a Triangular/PERT draw-shape toggle, an opt-in AACE 57R-09 risk-driver layer), the cost-diffusion (GBM) card — now with a log-return strip plot + fitted-curve overlay, a "Math unlocked" plain-language drawer, and an EVM-vs-GBM methodology comparison (what each method assumes, never a forward-projected figure). |
| 4 | **Schedule** (`sched`) | DCMA-style schedule health — SPI, SPI(t)/Earned Schedule, CPLI, BEI, the full objective metric triad the DCMA 14-Point Assessment and ANSI/EIA-748 sit under, named explicitly (checks 13/14, with the other 12 stated as a real gap) — a Gantt-style bar with baseline vs. forecast, a fragnet-based delay & TIA register tied to package float, revenue-service forecast drift, statistical control charts (z-score + EWMA) over crew cost-per-hour. |
| 5 | **Risk & Change** (`risk`) | A priced risk register (probability × impact heat map + sensitivity tornado chart), a contract commercial register (a third axis distinct from control accounts), change pipeline with proposed-vs-settled pricing defense, the settle-vs-DRB EMV decision tree with an **interactive slider + chart** (§8). |
| 6 | **Delivery** (`del`) | Leading indicators (productivity factor by package, RFI/submittal aging, a quality NCR register with real open counts and per-item aging read live off the Actions/RAID register), the crew cost-per-hour module with a drill-down into idle/rework/baseline attribution. |
| 7 | **AI & Data** (`ai`) | The pipeline architecture diagram (now interactive — §8), the SQL model, a live 28-check integrity gate + 2 ingestion-validation checks, statistical control (z-score/EWMA) with worked-math accordions, and AI narrative generation under a verification contract (§10). |
| 8 | **Operating Framework** (`fw`) | Phase playbook, the WBS/CBS/OBS/ABS control-account mapping (with a worked "100% Rule" proof, now carrying an illustrative ABS tag per row alongside WBS/CBS/OBS), Board phase-gate governance with a live Gate-5 hard stop, escalation matrix, a live Working-Backward/inversion worked example, reporting cadence, stakeholder interface map, the 20-metric KPI reference library. |
| 9 | **Actions** (`act`) | A RAID/CAPA register with proactive staleness detection, owner accountability rollup, a worked-math accordion for `actionStatus()`'s threshold logic. |
| 10 | **Glossary** (`gloss`) | 55 terms, each with a live-computed worked example, a real category (5 domains — Cost & EVM, Schedule & CPM, Risk/Commercial & Governance, Field Telemetry & Quality, Data Strategy & Architecture — with a live pill filter), and a real "See it live" cross-tab jump button — the same content the inline "i" help icons pull from site-wide. Filterable by search AND category together, and reachable from anywhere via a bare `/` keypress. |
| 11 | **Data Strategy** (`data`) | A real-world plan for connecting scattered, multi-system data — ISO 19650 CDE staging architecture as an interactive flow diagram (§8), a 4-tile IDS guardrail status grid with a genuinely live 2-check ingestion-validation panel embedded in it, automated guardrails, a discrepancy-resolution decision flow folded into that same diagram, a Category/Trigger/Routing proactive-error-recovery table, a Dual-Stack Parity card citing this program's own real, live CPI against the actual SQL that independently re-derives it. |

Plus, outside the tab body: **Presentation Mode** (a scripted 2-set walkthrough with presenter
notes), a **10-stop guided Tour**, a **printable executive brief**, light/dark **Theme** toggle, and
a text-size control (`A-`/`Normal`/`A+`, persisted to `localStorage`).

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
    integrity-gate node clarifies the dbt-side 54-check count vs. this tab's own live
    `GUARDS.length` (28) — two independently-run stacks, not one gate wearing two names.
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
- **55-term glossary** with live search filter, plus a click-driven inline "i" help icon next to
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
- **12 `<details class="dbox">` "how this is actually computed" accordions** — each walks a
  worked example against real data (S-curve PV formula, waterfall bridge, Gantt forecast-finish,
  CPLI driving-path arithmetic, risk exposure, Monte Carlo per-run formula, crew cost-per-hour
  weekly overrun, z-score arithmetic, EWMA recursive update, the WBS "100% Rule" as literal
  addition, `actionStatus()`'s branch order, the per-package ledger inspector).
- **10-stop guided Tour**, **2-set Presentation Mode** with a presenter-notes popup, **printable
  executive brief** — all reuse the live data, never a separately-authored summary.
- **Cross-account hover-highlight** on the S-curve/waterfall/Gantt.
- Keyboard support throughout: every clickable node also responds to Tab + Enter/Space, and
  `:focus-visible` gets a visible accent ring distinct from `:hover`.

---

## 9. Guardrails & integrity system

Three layers, each catching a different failure mode:

1. **`GUARDS`** (28 checks, JS, re-run on every page load, AI & Data tab) — reconciliation: does
   the portfolio BAC equal the sum of package budgets? Does SPI/CPI recompute to the same value
   shown elsewhere? Does the risk exposure equal `Σ P_BAND[p] × cost`? Does every control account
   map to exactly one contract? Does every "current period" figure shown in a trend series read
   live off the same source every other tab reports, rather than a duplicated literal? One check
   (`Compliance sweep`) scans the *rendered page's own text* for prohibited claim patterns
   (fabricated tool/certification claims) — genuinely live-verified, not a no-op: an earlier
   /stress-test found it silently passing in the test harness (no `document.body` in the DOM
   stub) while genuinely FAILING on the live page (false-flagging two allowlisted citations); both
   the guard's allowlist and the test harness's blind spot were fixed the same session.
2. **`INGEST_GUARDS`** (2 checks) — raw-record validation *before* reconciliation: no negative
   actual cost, no package with EV > BAC. A different failure class than `GUARDS` (a record that's
   internally consistent but individually implausible vs. one that's inconsistent with the rest of
   the ledger).
3. **`pipeline/run_pipeline.py`** (64 checks, SQL/DuckDB, offline) — the same ledger built twice,
   independently, in two different languages. See §12.

---

## 10. AI narrative generation

The AI & Data tab includes an AI-generated narrative draft — but every cited figure is
independently re-derived and checked against the live ledger before it's allowed to post (the
`FIGS[]`/`renderNarr()` pattern: figures are pulled from `rows`/`T` by name, never hand-typed into
the prose string). This was a real bug class earlier in this project's history — a magic-index
array coupling in an earlier draft of `renderNarr()` let the narrative silently cite the wrong
package's numbers — fixed and now guarded by a `stress.cjs` assertion that the cited figure
matches an independent recomputation, not just that *a* number is present.

---

## 11. Testing & verification

**`stress.cjs`** (1,846 assertions, all passing) — stubs the DOM, loads `index.html`'s script
verbatim into that stub, and exercises it exactly like a user would: every tab switch, every
filter, every drawer, every slider drag, every keyboard interaction. 41 labeled sections:

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

**Verified this session**, not assumed from the README's own claim: installed `duckdb` into a
throwaway venv and ran it fresh —

```
$ python3 pipeline/run_pipeline.py
...
portfolio: {'bac': 1240.0, 'pv': 847.0, 'ev': 819.7, 'ac': 857.6}
ALL CHECKS PASSED
```

64 PASS, 0 FAIL — matching both `index.html`'s own "64 checks" prose and `README.md`'s claim
exactly, and the portfolio totals match the JS-side tie-out in §2 to the decimal. Requires
`pip install duckdb`; no other dependency, no network access, no credentials. (Count grew from 54
to 64 on 2026-08-21, `/stress-test` round: `schema.yml` declared 10 guardrail tests — claim_id
unique/not_null, package_id not_null + referential integrity, pv/ev/ac_delta ≥ 0 on
`stg_progress_claims`, plus package_id/bac not_null and bac≥1 on `fct_control_account` — that
`run_pipeline.py` documented but never actually ran; all 10 are now real checks. Also fixed a
mislabeled check() string that printed "ev <= pv" for what was actually testing ev≤bac.)
The raw claim rows are synthesized to sum back to the dashboard's own PV/EV/AC totals by
construction (a residual-cents plug, see `run_pipeline.py`'s own `distribute()` comment) — so this
proof covers the SQL aggregation/formula layer agreeing with the JS layer, not an independently-
sourced dataset reproducing the dashboard's numbers. Worth stating plainly rather than implying
more than a synthetic single-source demo can prove.

---

## 13. Companion pages

- **`otak.html`** — "Fit Brief: requirement-by-requirement coverage against a Project Controls
  Manager posting, gaps included." A separate, self-contained HTML file (448 lines) built around
  the same design system, honestly naming shortfalls rather than only strengths. Re-verified
  against the live posting once already (per its own header, 17 Aug 2026) — re-verify against the
  current live posting before reuse, since job postings and TJ's own gap profile both change.
- **`architecture.html`** (598 lines) — a **static, hand-verified snapshot** of the pipeline
  diagram, distinct from `index.html`'s own interactive `#arch` diagram (§8). The README already
  flags this distinction explicitly ("A verified snapshot, not a live render"). The diagram's own
  *drawing* still has no automated check tying it to `index.html`'s `#arch` diagram — if the
  pipeline architecture changes again, update both by hand. Its **prose counts** (20 KPIs, 28
  guards, 64 SQL checks, 17 actions) are a different story: `stress.cjs`'s `E.1. architecture.html
  sync` section now reads this file's own source the same way it already read `otak.html`'s, and
  asserts those counts against `index.html`'s live arrays — added 2026-08-21 after a live, 3rd
  stale "twenty-seven" instance was found in this file's own `aria-label` (§18 gap #3/#9).

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

GitHub Pages, serving directly from `main` — no build step, no Actions workflow, no deploy
pipeline. Pushing to `main` *is* the deploy. (Do not add a build step without a real reason — the
zero-dependency, zero-build architecture is the point, not an oversight.)

---

## 16. Local development

```bash
git clone https://github.com/tjaiyen/project-controls-command-center.git
cd project-controls-command-center
python3 -m http.server 8000        # or just open index.html directly — both work
# → http://localhost:8000/index.html

node stress.cjs                    # full interaction test suite
node verify.cjs                    # independent EVM tie-out

python3 -m venv .venv && .venv/bin/pip install duckdb
.venv/bin/python3 pipeline/run_pipeline.py   # SQL/JS parity proof
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

## 18. Known gaps / deferred work

Named explicitly, not silently dropped — from the most recent engagement/interactivity round:

1. ~~**EWMA and z-score control charts as real SVG line charts.**~~ — **Resolved 2026-08-21**
   (the "how the dashboard catches drift" brainstorm round): `renderEwmaChart()` draws the real
   per-point-varying-width uncertainty band this gap named, as a filled SVG polygon built directly
   from `deriveEwma()`'s own real `ucl`/`lcl` points — the chart geometry, not a separately-fitted
   curve. The z-score check was upgraded too, reusing `bars()`'s existing `center:true` mode (no
   new geometry needed there — a fixed ±threshold doesn't vary per point the way EWMA's does).
2. **A 4th independent drill-down drawer for the risk register** (`#risks`). Three drawer
   implementations already exist independently (KPI root-cause, crew cost-per-hour, Actions row
   detail); whether to extract a shared `renderDrillDrawer(config)` helper is a real question worth
   deciding once a 4th *and* 5th instance both exist, not mid-build on the 4th.
3. **`architecture.html` and `index.html`'s `#arch` diagram can drift** (§13) — no automated check
   ties them together the way `GUARDS`/`stress.cjs` tie the ledger together. Its own stale "27
   checks" text was resynced to 28 on 2026-08-20 in the 2 locations found *that day* — but a fresh
   grep on 2026-08-21 found a **3rd** stale "twenty-seven" instance (the `#archSvg` `aria-label`)
   that pass missed, proving the gap's own point: nothing catches drift automatically. Fixed
   2026-08-21; **§18 gap #9 below adds the automated sync test this gap has been naming since
   2026-08-20** — that structural risk is now closed, not just the 3rd stale instance.
4. ~~**`README.md`'s own stated counts lag behind this document**~~ — **Resolved 2026-08-20** (and
   re-synced eleven more times on 2026-08-21 — the six-families card, the Data Strategy UI/UX round,
   the Monte Carlo PERT draw-shape toggle, the megaproject-controls-doc upgrade round, the Kimi
   research-package round, the full-dashboard `/stress-test` pass, the EAC-spread live check, the
   total-float early-warning round, the Monte Carlo captivation round, the Galton Engine round, the
   drift-catching round, the tab-rail navigation round (320px mobile-overflow fix, hover-preview
   mini-drawers, 1&ndash;9/"?" keyboard shortcuts), the altitude-grouped-rail round (5 nav
   groups, Gate 5 status pill, sticky in-tab anchor rail, return breadcrumb), and the whole-repo
   `/stress-test` round (pipeline coverage 54&rarr;64 checks, 3 stale citation dates corrected, the
   `#cntGate5` CSS bug)): 1,692 assertions / 53 glossary terms / 28-check integrity gate / 64-check
   SQL pipeline, matching §2 as of this writing.
5. **The eleven-input ledger card is new this round** (2026-08-20) and only covers the Overview
   tab's own `PKGS` provenance — it does not touch or resolve gap #2 above (the risk register still
   has no independent drill-down drawer of its own).
6. **"Top-level JS functions: 176" in §2 was not re-audited this round** (2026-08-21) — a fresh
   `grep -nE "^\s*function [a-zA-Z_]" index.html | wc -l` returns 204, but that count wasn't
   reconciled against whatever narrower methodology produced 176 (§4 separately states 169, a
   pre-existing mismatch this round didn't introduce or investigate). One real function,
   `renderFamiliesGrid()`, was added this round. Left un-reconciled rather than guessed at — a
   wrong "fixed" number would be worse than a flagged stale one.
7. ~~**The Data Strategy tab's tile grid, live ingestion panel, recovery table, and parity card
   were verified via DOM-content extraction... not via a scrolled screenshot**~~ — **Resolved
   2026-08-21** (`/stress-test` full-dashboard visual pass): two independent reviewers (this
   session + a fresh-context subagent) confirmed real, non-garbled content at both desktop and
   480px width — the guardrail grid, embedded live ingest panel ("GREEN — all 2 passing"),
   recovery table, and parity card (real CPI 0.956, not a placeholder) all render correctly. The
   browser tool's screenshot-after-scroll compositing issue (root-caused this round — see gap #10)
   meant a full scrolled *screenshot* still wasn't captured, but DOM-level verification is now
   corroborated by two independent passes rather than one, which is what this gap was actually
   asking for.
8. ~~**`README.md`/`docs/HANDOFF.md` both called the Overview tab's guided narrative a
   "five-chapter guided story walkthrough"**~~ — **Resolved 2026-08-21**: no 5-chapter array ever
   existed in the code; the real feature is the 10-stop `TOUR_BEATS`. Caught in passing during the
   "96→100" brainstorm round's exploration, not part of any requested item — surfaced and fixed
   rather than smuggled in silently (coding-discipline.md).
9. ~~**No automated check tying `architecture.html`'s prose counts to `index.html`'s live
   arrays**~~ (§13, gap #3 above) — **Resolved 2026-08-21**: `stress.cjs` now reads
   `architecture.html`'s source the same way it already reads `otak.html`'s, and asserts its
   20-KPI / 28-guard / 17-action / 54-check prose matches the live counts. Directly motivated by
   catching a real, live 3rd stale "twenty-seven" instance this same round (gap #3 above) that the
   prior hand-edit pass missed.
10. **Testing-environment note, not a product gap** (`/stress-test` full-dashboard pass,
    2026-08-21): the browser tool used for live verification this session reliably screenshots a
    tab at its initial scroll position, but consistently fails to composite a fresh frame after
    *any* scroll past roughly 600–900px — whether via `window.scrollTo()` or native mouse-wheel —
    returning a stale/blank frame instead, confirmed independently by two separate reviewers in
    this same session (this session's own JS-`scrollTo` attempts, and a fresh-context subagent's
    native-scroll attempts). Root cause for the JS-`scrollTo` case: `index.html`'s `<html>`
    carries `scroll-behavior:smooth` (line ~197), and a synchronous `scrollTo()` + immediate
    `window.scrollY` readback races the animation — fixed by passing
    `{top:N, behavior:'instant'}` instead of a bare `(x,y)` call. The screenshot-compositing
    failure past a scroll threshold is a separate, still-open tool limitation with no known fix;
    work around it with DOM-based verification (`getBoundingClientRect`, content extraction) for
    anything below the fold, and treat screenshots as reliable only near scroll position 0.
    Separately: `#printBtn`'s `window.print()` call opens a real native print dialog that can hang
    an automated browser tab indefinitely — avoid clicking it in an automated verification pass;
    closing and reopening the tab recovers cleanly.
11. ~~**Delivery tab's Quality NCR register overflowed the page horizontally at mobile width**~~
    — **Resolved 2026-08-21** (full-dashboard `/stress-test` pass, second visual pass since gap
    #7-9's round): a real, reproducible bug, isolated to `t-del` at ≤375px — every other of the
    11 tabs stayed clean. Root cause: `renderNcr()`'s `.rowbar` row uses
    `grid-template-columns:110px 1fr 90px 64px`, sandwiching the title track between 264px of
    fixed columns; CSS Grid's default `min-width:auto` on that `1fr` item let its min-content size
    (not its wrapped size) force the row past its ~300px mobile column, pushing
    `window.innerWidth` to 411px against a 375px `visualViewport` (confirmed via
    `window.visualViewport.width` staying 375 while `window.innerWidth`/`document.body.scrollWidth`
    both read 411 — the layout viewport, not the device, had grown). Pre-registered fix
    (`min-width:0` on the title span, the identical precedent already set by
    `.rowbar>.tab-num,.rowbar>.mono{min-width:0;...}` for this exact bug class — the title span
    carried neither class) confirmed live: 411px → 375px, all 11 tabs, before/after. A structural
    regression guard was added to `stress.cjs` (checks the fix's presence in `ncrCard`'s rendered
    HTML) since this DOM-stub harness has no real CSS layout engine to re-run the live probe
    itself.
12. **3-playlist Guided Tour selector — deferred, not built** (altitude-grouped-rail round,
    2026-08-21): the second nav-IA proposal's most interesting idea, but not scoped — whether the
    13 requested stops (4+5+4, some likely overlapping across "Executive Briefing" / "CP-201
    Forensic Thread" / "Data Integrity & Governance") already exist among `TOUR_BEATS`' real 10
    entries, or need new narrated tour content authored for gaps, is unverified. Needs a dedicated
    grounding pass against `TOUR_BEATS`' actual content before it can be honestly sized.

---

## 19. Document provenance

Every count and claim in this document was pulled fresh this session from the live code — not
carried over from memory or an earlier pass:

- Line counts: `wc -l` on the actual files.
- Array counts (`KPIS.length`, `GUARDS.length`, etc.): read live via `window.__PCC__` in a running
  browser instance, not grepped/estimated from source (a source-text grep for KPI category labels
  initially over-counted by 2, caught by cross-checking against the live array).
- Test counts: a fresh `node stress.cjs` run (`1320 passed, 0 failed`) and `node verify.cjs`
  (tie-out matches §2 exactly).
- The "54 checks" pipeline-parity claim: **actually executed**, not assumed from prose — installed
  `duckdb` into a throwaway venv, ran `pipeline/run_pipeline.py` fresh, confirmed 54/54 PASS and
  the portfolio totals matching the JS side to the decimal (re-confirmed this round; the ledger
  card touches no `PKGS` value, so the portfolio totals are unchanged from the prior pass).
- Tab list, node lists, delay classifications, contract IDs, program identity: read live from
  `window.__PCC__` in a running browser session, cross-checked against the rendered nav.
- The ledger-card demo's own numbers were live-browser tested, not just stub-tested — a real
  step-snapping bug (§8) was caught this way after the Node test stub passed cleanly on the same
  code, which is the concrete reason this document keeps insisting on live verification over
  trusting a green test run alone.
- **2026-08-21 six-families-card round**: `KPI_FAMILIES.length` (6), `GLOSS.length` (50), and every
  family tile's own KPI count read live via `window.__PCC__` in a running browser instance, not
  grepped. The 6 family help-icons, the 6 filter-button `title` tooltips, and the cross-reference
  jump button (`data-jump-tab="sched" data-jump-el="schedDriftCard"`) were each exercised live —
  clicked, its resulting popover/tab-state read back, not just asserted to exist in markup.
- **2026-08-21 Data Strategy UI/UX round**: every real check name/copy cited in this round's
  brainstorm plan was read directly from source before being reused (`GUARDS`' 28 check names
  read to confirm they're this dashboard's own math-consistency proofs, not IDS-shaped raw-data
  checks — the reason the tile grid embeds `INGEST_GUARDS` instead of a fabricated per-tier
  pass-rate). The parity card's cited SQL line was grepped verbatim from `pipeline/models/
  fct_control_account.sql`, not paraphrased. All 4 new elements (tile grid, embedded live ingest
  panel, recovery table, parity card) were checked live in a real browser for correct real values
  and zero console errors (§18 gap #7 notes the one verification step not completed this round —
  a full scrolled screenshot, blocked by browser-tool flakiness, not a code defect).
- **2026-08-21 "96→100" brainstorm round (Tier 0/1 items)**: three parallel Explore passes read the
  live code before any brief item was accepted at face value — this is what caught the live
  "twenty-seven" drift in `architecture.html`'s `aria-label` (fixed), confirmed `renderInversion()`
  already builds the exact Gate-5→contingency-coverage→A-09 chain the brief asked for as new work
  (nothing built, §18 correctly does not list this as resolved-this-round since nothing changed),
  and confirmed the "not years running P6" hedge the brief describes lives only in presenter notes,
  never on-page. `stress.cjs`'s new `E.1. architecture.html sync` section was run fresh
  (`1352 passed, 0 failed`) and `node verify.cjs` re-confirmed the tie-out is unchanged (this
  round's edits touch zero `PKGS` values).
- **2026-08-21 `/stress-test` full-dashboard visual pass**: all 11 tabs, both companion pages
  (`architecture.html`, `otak.html`), and the cross-tab overlays (10-stop Tour, Presentation Mode,
  light/dark Theme toggle) reviewed by two independent parties — this session directly, plus a
  fresh-context subagent — split by scope for coverage, each checking structural overflow,
  zero-size/garbled content, and console errors at both desktop (1280px) and narrow (480px) width.
  **Zero real, reproducible defects found.** Several promising leads were investigated and
  disproven as false positives before being discarded, not silently dropped: SVG `<title>`
  tooltip elements and the `.help-ic` invisible 44px touch-target expander both produce a
  `scrollWidth`/`clientWidth` mismatch with no actual visual effect; wrapped inline `<b>`/`<code>`
  text spanning two lines produces a misleading single bounding-box "overlap" with a neighboring
  element that never actually touches (confirmed via `getClientRects()` showing the real
  per-line fragments); a synthetic `.click()`-chained tab-highlight artifact didn't reproduce with
  genuine mouse clicks. Closed §18 gap #7 (Data Strategy tab visual verification) with
  corroborating dual-review evidence; opened and closed within the same round §18 gap #10 (a
  testing-environment note, not a product gap, about the browser tool's own screenshot/scroll
  limitations found and root-caused this pass).
- **2026-08-21 Monte Carlo PERT draw-shape round**: TJ asked directly why the Monte Carlo used
  triangular over PERT — answered honestly first (`grep -n "PERT" index.html` returned nothing; it
  was never a documented decision, just the distribution implemented), then built PERT as an
  additive toggle rather than a silent swap. `gammaRnd`'s and `betaRnd`'s correctness were checked
  against their own textbook statistical properties (a Gamma variate never ≤0; a Beta(2,3) draw's
  empirical mean over 5,000 draws converges near its true mean 0.400; a `pertRnd` draw against
  CP-201's real live `mcParams()` stays within bounds and its empirical mean over 4,000 draws
  converges near PERT's own `(lo+4·mode+hi)/6` formula) — the correct verification doctrine for a
  stochastic sampler, where "recompute the exact same random number by hand" doesn't apply the way
  it does for `triang()`'s closed-form inverse-CDF. Live-browser confirmed: canonical `MC` stays
  byte-identical after toggling to PERT (`dist:"triangular"` unchanged), the active run's own P50
  genuinely shifts, the math explainer's copy switches to name Beta-PERT with real α/β values
  instead of stale triangular-specific prose, and toggling back restores the exact original
  triangular numbers, not an approximation. `node stress.cjs` run fresh (`1352 passed, 0 failed`)
  and `node verify.cjs` re-confirmed unchanged (zero `PKGS` values touched — this is a Monte Carlo
  sampler change, not a ledger change).
- **2026-08-21 Monte Carlo run-count round (4,000 → 10,000)**: TJ asked directly why 4,000 over
  10,000 — same honest-first pattern as the PERT question (`grep` found no documented rationale;
  it was just the number implemented). Answered with a fresh empirical comparison (not just
  theory): P50/P80/P95 move by roughly $0.1–0.3M across the entire 4,000→50,000 range on a
  ~$1,300M portfolio — under 0.02%, invisible at the dashboard's own one-decimal display precision
  — while PERT's per-draw cost is real (~2× triangular's). TJ chose 10,000 anyway; built it,
  found a real regression doing so: the AI & Data tab's own "Monte Carlo reproducible" integrity
  guard (`GUARDS`, `index.html` ~5254) independently re-simulates the run to cross-check `MC.p50`
  and had its own hardcoded `4000` loop bound — bumping only `computeMc()`'s `N` without touching
  this second, independent copy broke the guard correctly (comparing a 4,000-run re-derivation
  against a 10,000-run canonical `MC.p50`), catching exactly the class of drift this guard exists
  to catch. Fixed by reading `MC.n` instead of a literal, closing the drift risk permanently
  rather than just patching the number — the same lesson this project already learned once from
  the `architecture.html` "twenty-seven" bug. 10 other hardcoded "4,000" mentions across static
  HTML, code comments, and narrative-generation strings were also found and fixed; the narrative
  ones were converted to read `MC.n` live wherever they sat inside a render function already in
  scope of `MC`, rather than hand-typing "10,000" as a second literal that could drift again.
  `node stress.cjs` run fresh (`1352 passed, 0 failed`, including the fixed guard); live-browser
  confirmed the PERT toggle recompute at N=10,000 still completes in ~22ms, well within an
  instant-feeling interaction.
- **2026-08-21 megaproject-controls-doc upgrade round**: every candidate idea from the downloaded
  research doc was checked against the live code before being accepted or declined — confirmed via
  direct grep/read, not assumed, that `deriveEarnedSchedule()` was already computed but only
  rendered inside a click-through drawer, that DCMA "14-Point"/"ANSI"/"EIA-748" had zero hits
  anywhere in `index.html` (a still-open item from an earlier round, not rediscovered), that NCR
  tracking was exactly 2 narrative-only `ACTIONS` rows with no mechanism, and that the WBS table
  had no ABS field despite 2 GLOSS entries already narrating the WBS-vs-ABS mismatch. `node
  stress.cjs` run fresh after each of the 4 items (`1380 passed, 0 failed` final), `node verify.cjs`
  re-confirmed the tie-out unchanged throughout (zero `PKGS` values touched), and every new render
  target was checked live in a real browser — the SPI(t) tile's real value (0.978, distinct from
  dollar-SPI's 0.968), the WBS table's real ABS tags, and the NCR card's real open-count/aging
  values and status pills, all with zero console errors and zero layout overflow.
- **2026-08-21 Kimi research-package round**: a 47-file research package was triaged by reading
  only its highest-value synthesis files (`plan.md`, its cross-dimension insight file, its own
  cross-verification file, its own coherence-review file, and one research dimension in full) —
  not all 47 files. Confirmed the package's own internal QA caught a real, still-unfixed factual
  error in its own case-study chapter, reinforcing (not just repeating) the standing rule against
  citing any case-study fact from downloaded research without independent primary-source
  verification. The one idea this package's own research made most tempting — charting EWMA/SPC
  on Earned Schedule/SPI(t) — was verified infeasible before being proposed: `deriveEarnedSchedule()`
  is only ever called with no arguments (one current-state reading), and the only long-enough
  arrays (`pvA`/`evA`/`acA`) are formula-generated interpolations this codebase's own comment
  already calls "structurally meaningless" for statistical charting. Declined outright rather than
  built. What shipped instead: a new "Three layers, not one number" card (Overview tab) naming a
  real architecture this dashboard already had but never stated, and one sentence on the Gate 5
  card naming the post-lock re-baselining governance principle. `node stress.cjs` run fresh
  (`1395 passed, 0 failed`), `node verify.cjs` unchanged, and both new render targets checked live
  in a real browser — the layer card's real, live counts (28-check gate, 2 ingestion checks), all
  3 jump buttons confirmed to actually switch tabs, and the Gate 5 sentence's presence — zero
  console errors, zero layout overflow.
- **2026-08-21 full-dashboard `/stress-test` pass, second visual pass since the earlier same-day
  round** (gaps #7-10): one review done directly, one by an independent fresh-context subagent
  (findings only, no file dump), both empirically probed rather than trusted. The subagent's sole
  finding — a real date-stamp typo, "2026-08-22" instead of "2026-08-21," across 13 comments in
  `index.html`/`stress.cjs` from the megaproject-controls-doc round, contradicting both the git
  commit timestamp and this document's own provenance entry for that round — fixed in all 13
  locations, confirmed zero remaining via fresh grep. This session's own pass added the resize
  matrix the prior visual passes hadn't run (mobile 375px / tablet 768px / desktop, not just
  desktop) and caught a real, reproducible mobile-only bug: the Delivery tab's Quality NCR
  register forced `window.innerWidth` from 375px to 411px (confirmed via `visualViewport.width`
  staying 375 — the layout viewport itself had grown, not a false positive from stale
  measurement), isolated to that one tab across all 11. Root-caused to `renderNcr()`'s
  `grid-template-columns:110px 1fr 90px 64px` lacking the `min-width:0` this exact bug class
  already has a fix precedent for elsewhere on the page; fix applied and the 411→375 prediction
  confirmed live, before/after, across all 11 tabs at all 3 widths. A structural regression guard
  was added to `stress.cjs` (§18 gap #11 has the full root-cause writeup). `node stress.cjs` run
  fresh after both fixes (`1396 passed, 0 failed` — 1395 baseline + 1 new guard), `node verify.cjs`
  unchanged (pure CSS + comment-date fixes, zero `PKGS` touched).
- **2026-08-21 Monte Carlo mode-vs-bounds clarification (brainstorm mode)**: TJ asked for a
  clarification distinguishing how the Monte Carlo `mode` (computed live from the ledger) differs
  from the `min`/`max` bounds (a programmed rule applied around it), plus how a real capital
  program would derive the same three numbers (monthly ERP actuals for the mode; a QRA/QCRA
  workshop pricing risk-register items and value-engineering savings, stress-tested against
  outside base rates, for the bounds). Every number and citation in the proposed text was checked
  against the live code before writing anything: CP-201's real `EV`/`AC` ($178.4M/$205.1M) do
  compute to CPI 0.870 exactly; `mcParams()`'s live −0.08/+0.06 offsets for CP-201 today do match
  what was proposed; `R-01` is real, already in `RISKS`, and is in fact the ground-conditions risk
  named; Flyvbjerg's +45% rail figure is real and already cited elsewhere on the page (`RCF_MULT`)
  — reused, not re-asserted as a new claim. Added as one shared paragraph (`boundsNote`, computed
  once in `renderMcMath()`) spliced into both the Triangular and PERT branches, since it's about
  where the bounds come from, upstream of which shape draws from them — avoiding the duplicate-copy
  trap this file has already caught twice this session. The down/up offset text is read live off
  `r.cpi`/`aLow`/`bHigh` rather than hand-typed as "0.08"/"0.06," so it can't silently go stale the
  way the architecture.html "twenty-seven checks" bug and the Monte Carlo 4000-run guard both did.
  `node stress.cjs` run fresh (`1407 passed, 0 failed` — 1396 baseline + 11 new assertions,
  including a pre-registered check that today's live offsets are exactly 0.08/0.06 and that R-01's
  real title actually contains "ground conditions," not just a coincidental id match), one real
  test bug caught and fixed in the same pass (a Unicode "−" in a new assertion didn't match the
  page's literal `&minus;` HTML-entity text — this file's own established convention, confirmed by
  grepping an existing `&minus;`-checking assertion elsewhere in the file), `node verify.cjs`
  unchanged (pure narrative, zero `PKGS` touched), and both distribution branches checked live in a
  real browser — the bounds note's exact live-computed numbers (0.790–0.930, mode 0.870,
  −0.08/+0.06) confirmed present and byte-correct in the Triangular view, and confirmed to survive
  the toggle into PERT view unchanged, zero console errors, zero layout overflow.
- **2026-08-21 EAC-spread live check**: TJ asked a plain question — "why are we not taking into
  account the 4 [EAC] methods?" — which surfaced a real gap: the `eac` KPI's own `act:` field
  already said "publish the four-method spread... when methods diverge by more than about 5%,
  that divergence is itself the finding" (`KPIS`, `id:"eac"`), but nothing on the page ever
  actually computed that spread or checked it against 5% — narrative guidance, never an enforced
  check, the same "documented principle, not enforced" pattern already named honestly for the
  Gate 5 re-baselining sentence two rounds back. TJ confirmed ("yes") after being shown the honest
  answer (the 4 methods ARE shown side by side already, just never blended into the headline, and
  the reason for that is methodological — the 4 methods encode different root-cause assumptions
  that can't be meaningfully averaged) plus the live-checked fact that today's real spread
  ($1,277.9M–$1,312.0M, ~2.75% of BAC) sits comfortably under the 5% threshold anyway. Built
  `renderEacSpread()`, called from `renderEac()`, into a new `#eacSpread` div under the Cost tab's
  EAC table: reads the real high/low methods and the real spread live off `EACS`/`T.bac` (never a
  hardcoded dollar figure or percentage — the same anti-drift discipline as the Monte Carlo bounds
  note above), renders a green/red pill against the single 5% threshold the KPI text already names
  (deliberately not a 3rd, unsourced middle band). `node stress.cjs` run fresh (`1415 passed, 0
  failed` — 1407 baseline + 8 new assertions, including a pre-registered check that today's real
  high/low methods are "cost and schedule pressure both" / "remaining work at budgeted rate" and
  that the rendered pill is green, not red), `node verify.cjs` unchanged (reads `EACS`/`T.bac`,
  touches zero `PKGS` values), and live-browser confirmed the rendered text byte-for-byte —
  "$34.1M ... 2.7% of BAC ... within the ~5% band" — with the green pill, zero console errors,
  zero layout overflow.
- **2026-08-21 total-float early-warning round**: TJ shared a 4-part, ~15-item brainstorm proposal
  on total float. A fresh-context Explore agent surveyed all 10 checkable claims against the live
  code before anything got proposed — the finding: 7 of 10 items already existed, several matching
  the proposal's own exact numbers (CP-201's -40d, D-02's +40d fragnet, the 68.7% idle figure).
  Shipped the 3 real gaps the survey found, all approved by TJ before building: (1) Gantt tooltip
  depth — `cpRem` as a raw number plus a live-worked CPLI formula per hover, reusing the already-
  guarded `d.r.cpli`, never a second copy of the divide-by-zero guard; (2) `floatCompanionDbox()` —
  connects the worst-float account to its real linked TIA delay fragnet and real crew-level idle
  split into one drawer, mirroring the existing `spiTCompanionDbox()` precedent exactly, every
  value read live off `rows`/`DELAYS`/`CPH_CELLS` (never a hardcoded id or percentage), plus a new
  `data-jump-cphdrill` pre-callback (mirrors `data-jump-actstale`) so the crew-idle jump button
  opens the 3-way split on arrival, not just scrolls to a collapsed toggle; (3) the missing float
  glossary icon on the "Total float by package" heading, matching its neighbor (CPLI) exactly.
  Declined as fabrication risk: a per-account "contractual milestone impact date" in the Gantt
  tooltip (no data field ties a control account to a specific milestone) and a named individual
  Control Account Manager in the escalation handshake (the data model only has role titles).
  Skipped as TJ's own judgment call, offered but not built by default: a float-only "At Risk"/
  "On Track" micro-badge (likely redundant with the float cell's existing color-coding plus the
  ledger's existing composite status pill) and full dynamic escalation-row generation (the
  substance — live breach detection — already exists via `firingEscalations()`; a structural
  rebuild for a mostly cosmetic difference wasn't judged worth it). One real bug caught and fixed
  during the build, in the test file, not the app: a large brace-balance mistake while restructuring
  an existing enclosing test block (removed an opening `{` but left its matching `}` orphaned,
  and separately called a non-exposed `P.renderCph()`, and fired click events on `document.body`
  instead of this file's own established `R.win` target) — all three caught by `node -c`/runtime
  errors before any assertion was trusted, not silently worked around. `node stress.cjs` run fresh
  (`1438 passed, 0 failed` — 1415 baseline + 23 new assertions, including pre-registered checks
  that today's worst-float account really is CP-201 at -40d with exactly one real linked fragnet
  and a ~68.7% real idle share), `node verify.cjs` unchanged (all three additions are pure
  narrative/UI, zero `PKGS` values touched), and live-browser confirmed all three end to end — the
  Gantt tooltip's real worked CPLI, the float drawer's real D-02/68.7% text and both working jump
  buttons (including the crew-idle one auto-opening the drill), and the new glossary icon opening
  the real popover — at desktop and mobile (375px) width, zero console errors, zero layout overflow.
- **2026-08-21 Monte Carlo captivation round**: TJ shared a 5-part brainstorm proposal to make the
  Monte Carlo module "the most captivating, educational, and technically authoritative module in
  the dashboard." A fresh-context Explore agent grounded all 5 items against the live code before
  anything got proposed — the finding: most of the "hard" mechanics already existed (PDF/CDF
  toggle, BAC/contingency threshold lines, a `#sConf`-style percentile drag-inspect precedent on
  the S-curve, a fully-built single-draw stepper, a real Flyvbjerg reference line with gap prose),
  and 3 of the proposal's own 6 cited dollar figures were wrong against the live simulation (P50/
  P95 off by $0.1M at the page's own display precision; the CP-201 worked example's formula
  substituted the account's own EAC where BAC belonged). TJ approved everything except the
  "Galton Engine" Canvas/WebGL particle-physics waterfall, which was held out as a separate
  architecture decision (this page's entire stated design is zero-dependency SVG+CSS; introducing
  Canvas would be a first, not just another feature) rather than silently built or silently
  dropped. Shipped the 4 approved items: (1) a flashing "100% Contingency Breach" pill, gated on
  the literal case (`activeMc.sims[0]`, the single best simulated outcome, still busting
  BAC+contingency) rather than an invented soft threshold; (2) a drag-to-inspect percentile
  needle consolidated directly onto the MC chart itself (`#mcInspect`, reusing `#sConf`'s exact
  required-contingency math but against `activeMc` instead of the canonical `MC`, since the two
  controls answer different questions on purpose), surviving the hist/CDF view toggle via the
  same `<g>`-rendered-fresh-then-cheaply-repositioned pattern `#scurveConfMarker` already
  established; (3) an Optimism Gap stat tile restating `renderMcRcf()`'s existing prose comparison
  as two scannable numbers; (4) a tri-point Beta-PERT curve playground for CP-201 with draggable
  (Pointer Events) and arrow-key-nudgeable min/mode/max pins, an empirical density curve built
  from 2,000 real `pertRnd()` draws (deliberately not an analytic Beta-PDF via a Gamma function —
  the MC histogram itself is already a real drawn-and-counted distribution, never a fitted curve,
  and this stays consistent with that rather than introducing a second, inconsistent technique),
  live-recomputed PERT mean and per-account P80/P95, and a `pertPlayBounds()` that always opens on
  the account's real, live `mcParams()`-derived bounds until the user actually touches a pin.
  Caught one real mobile-viewport CSS bug during the build (a new flex row for the inspect slider
  omitted `flex-wrap:wrap`, which every other flex row on this page already carries for exactly
  this reason — pushed the Cost tab to 386px at a 375px viewport; fixed, re-verified clean across
  all 11 tabs). Caught two real bugs in the new tests, not the app: `document.getElementById`'s
  auto-vivify-on-first-reference behavior in this stub means checking `!!G.mcInspectMarker`
  directly is always true regardless of whether the marker ever really rendered — fixed to check
  `G.mcChart._html` instead, the same static-markup-vs-rendered-innerHTML boundary already
  documented elsewhere in this file; and a keyboard-nudge test wrongly assumed +0.005 then -0.02
  would net back to zero (it doesn't — pre-registered wrong, caught by the contradiction, not
  rationalized past). `node stress.cjs` run fresh (`1472 passed, 0 failed` — 1438 baseline + 34
  new assertions, including a pre-registered check that today's real gap is positive and that
  today's ledger does NOT trigger a false breach, then a forced-condition test proving the pill
  DOES fire on the real rendered markup when the condition is forced true, and a P80/P95 check that
  reproduces the exact same seeded 2,000-sample sequence independently), `node verify.cjs`
  unchanged (all four additions are pure UI/interaction, zero `PKGS` values touched), and live
  browser confirmed all four end to end — the forced-breach pill firing on real markup, the
  inspect needle's marker and readout updating on drag and surviving the CDF toggle, the
  playground's keyboard nudge/clamp/reset all producing the real live numbers — at desktop and
  mobile (375px, post-fix) width, zero console errors.
- **2026-08-21 Galton Engine round**: TJ said "push then now plan and add the galton engine" —
  the one item explicitly held out as a separate architecture decision from the captivation round
  above (Canvas/WebGL vs. this page's zero-dependency SVG+CSS design). Chose Canvas 2D over
  WebGL (2D falling dots don't need a shader pipeline). Design decisions stated up front, not
  discovered after the fact: replays `activeMc.sims` — the same real, already-computed, seeded
  runs the static histogram reads — never a second simulation; reuses the exact same 26-bin
  structure (`renderMc()`'s bin logic extracted into a new shared `mcBinCounts()`, so the
  animated and static charts can never silently disagree, rather than building the literal
  "50 buckets" the brief proposed); animates a stratified sample of 500 (evenly spaced across the
  sorted real outcomes, not a random subset) since animating all 10,000 individual beads is
  unusable, and snaps every bucket to its TRUE full-data count the instant the drop finishes —
  stated in the card's own lede, not silently implied. Speed modes 1x/5x/Instant/Step-by-Step,
  and `prefers-reduced-motion` skips straight to the settled state.
  Two real bugs found live-testing, both fixed, both now covered by a genuine regression test
  (confirmed to actually fail against the pre-fix code, not just pass against the post-fix one —
  B27/B35 discipline): (1) the "Done" completion message needed one phantom extra tick/click after
  the last bead had already visually landed (the completion check ran at the TOP of
  `galtonStepOnce()`, one call too late) — fixed by checking immediately after incrementing, in
  the same call, via a small extracted `galtonFinish()` helper; (2) the real click-handler bug —
  Step mode's own "halt after one step" behavior deliberately sets `running=false` between every
  click (the pause IS the feature), but the click handler's reset trigger was `!running`, so
  every single click in Step mode reset the whole run back to bead 1 instead of continuing —
  invisible to a test that calls `galtonStepOnce()` directly (bypassing the click handler
  entirely, which is exactly how the first version of this round's own tests exercised it) and
  only found by firing real `click` events through the real handler. Fixed by keying the reset
  trigger on `qi>=queue.length` only, never on `running`. Also fixed a mid-run speed-switch gap:
  switching speed while a run was genuinely in flight left one stale leftover tick before the
  next click reset properly — `galtonSetSpeed()` now resets immediately on any speed change made
  mid-run. `node stress.cjs` run fresh (`1505 passed, 0 failed` — 1472 baseline + 33 new
  assertions), `node verify.cjs` unchanged (pure UI, zero `PKGS` touched), and live-browser
  confirmed real canvas pixel output (non-transparent pixel counts checked, not assumed),
  Instant/Step modes both completing correctly end to end through the real click handler, the
  interlock fix, and zero overflow across all 11 tabs at mobile (375px) width — the one overflow
  reading that looked wrong during this pass turned out to be a stale/backgrounded browser tab
  reporting `window.innerWidth: 0` (confirmed via a fresh tab reading the real 1280px with zero
  overflow), not a real regression — reported here rather than silently discarded, per this
  project's own "show the reproduction before dismissing a finding" discipline. Canvas pixel
  rendering itself has no meaningful equivalent in the `stress.cjs` DOM stub (no real 2D context)
  — accepted as live-browser-only coverage, the same class of limitation already stated for
  `renderGanttScrubMarker()` and the tri-point playground's own pointer-drag half.
- **2026-08-21 full-dashboard `/stress-test` pass, third round**: one review direct, one by an
  independent fresh-context subagent. Sole finding: `docs/HANDOFF.md` stated the glossary term
  count three different ways (44, "50 terms," 53) in three places, while `index.html` itself was
  never wrong — every on-page reference reads `GLOSS.length` live, and `stress.cjs` already
  asserted 53 as a passing test. Fixed both stale prose lines to 53, independently re-counted from
  the raw `GLOSS` array source (53 `{k:"` entries) before fixing.
- **2026-08-21 "how the dashboard catches drift" round**: TJ shared a 5-section brainstorm
  proposal. Every cited number checked out against live computation before anything was proposed
  — EAC velocity, float erosion rate, milestone slip, CPH EWMA gap, GBM μ̂/σ̂, CP-201's real dates,
  EWMA λ/L, idle/rework percentages, staleness threshold — all exact matches, the most accurate
  external proposal this session has seen. Approved 4 of the proposal's items; declined a third
  Gantt trajectory layer and per-package float sparklines for the other 7 packages (both blocked
  on historical data that only exists for CP-201, not fabrication-adjacent invention of it) and a
  live "10-day Risk Review" countdown (no real trigger-date timestamp exists to count down from).
  Shipped: (1) a "Velocity Pulse" banner (Overview tab) aggregating 5 already-real drift signals
  for the first time — each pill's g/a/r state deliberately reuses that metric's OWN already-real
  signal (`eacDriftVelocity()`'s `$1.0M/mo` threshold, `floatErosionSeries()`/`revSvcDriftSeries()`'s
  own "every period moved the same direction" booleans, `deriveEwma()`'s real flag count and
  gap-trend direction, the same `T.spi>=1.00 && T.cpli<0.90` check the escalation matrix already
  uses) rather than the proposal's own uniform ±0.5σ/3-period/5-period sigma-based rule engine,
  which exists nowhere in this codebase for any of these five metrics and would have been a new,
  unverified statistical framework layered on top of five already-different real signals. The
  Non-Critical Progress Inflation "floating chip" folded into this same banner as its 5th pill
  rather than a second, competing standalone element. (2) The EAC Drift Velocity KPI's own drawer
  had nothing to show — `ESC_PAT.eacDrift` (the real "> $1.0M/month" escalation row) already
  existed but was never wired into `KPI_ESCALATION`; fixed with one line, plus a new jump button
  on the Cost tab's own drift card straight into that drawer (`data-jump-openkpi`, mirroring the
  `data-jump-cphdrill`/`data-jump-actstale` idiom). (3) Closed `docs/HANDOFF.md` §18 gap #1: the
  EWMA control chart is now a real SVG line+band chart (`renderEwmaChart()`), the band a filled
  polygon built directly from `deriveEwma()`'s own real per-point `ucl`/`lcl` values — the exact
  "per-point-varying-width uncertainty band" the gap named, not a separately-fitted curve; the
  z-score check was upgraded too, reusing `bars()`'s existing `center:true` mode rather than
  hand-rolling new geometry it didn't need. Two real bugs caught and fixed while updating the
  PRE-EXISTING tests these upgrades broke (not new bugs in the new code): a double-count (each
  `bars()` row renders its color twice — background and text — so counting a bare color-string
  match over-counted 2x), and the same static-markup-vs-rendered-innerHTML boundary this file has
  hit before (checking `#aiEwmaControl`'s own `_html` instead of the SVG's real container,
  `#ewmaSvgChart`, which the chart writes into via a second, separate `innerHTML=` call). `node
  stress.cjs` run fresh (`1541 passed, 0 failed` — 1508 baseline + 33 new assertions, all passing
  on the first run once the pre-existing tests were fixed), `node verify.cjs` unchanged (pure
  narrative/UI, zero `PKGS` touched), and live-browser confirmed all five pulse pills' real values
  and jump targets, the EAC drawer now showing the real escalation rule end to end through the new
  jump button, and the EWMA chart's real SVG geometry (6 circles, a 12-point band polygon, 4
  polylines) — at mobile (375px) and desktop width, zero console errors.
- **2026-08-21 tab-rail navigation round**: TJ shared a 5-section "Table of Contents wayfinding"
  brainstorm proposal (a "Transit Subway Line" wayfinder with pulsing nodes/hover mini-drawers/an
  animated train, multi-track guided playlists, a cross-tab "Connective Thread" story navigator, a
  Cmd+K command palette, and accessibility scaffolding). Grounding caught two invented facts from
  the proposal (a "24 Sep 2027" date matching nothing in `MILES`, and R-01's "70% × $18.5M =
  $12.9M" — no percentage field exists for R-01) and one regression the proposal's own ask would
  have introduced (`aria-current` on the tab rail, when `aria-selected` — already correctly used —
  is the right ARIA property for a `tablist`/`tab` component). Approved 3 items, scoped down from
  the proposal's own ask: (1) fix a genuine, previously-untested 320px mobile-overflow bug on the
  Delivery tab's Quality NCR register — found live during grounding, not literally in the proposal
  — root-caused through 3 successive live-browser probes (each pre-registered, two contradicted)
  to `renderNcr()`'s `grid-template-columns` using bare `Npx` fixed tracks (110+90+64=264px) that
  never shrink below their declared size, exceeding the row's real ~244px available width at
  320px; fixed with `minmax(0,Npx)`, the standard CSS Grid technique letting a track shrink under
  real pressure while still preferring `Npx` when there's room. (2) Hover/focus-preview
  mini-drawers on the tab rail — the scoped-down version of the proposal's SVG subway-line
  wayfinder, reusing the existing help-icon/`#helpPop` popover infrastructure (same
  position/flip-above geometry via a newly-factored `positionHelpPop()`, same `helpOpenKey`
  coordination) rather than the proposal's animated-train SVG; content is grounded, not fabricated
  — a tab that maps onto real `KPI_FAMILIES` entries reuses that family's own `q`/`why` fields
  verbatim and computes "system(s) of record" live from `KPIS[].src`, never hand-typed (the
  Delivery tab's own drawer correctly names both the Delivery and Compliance families, since
  `renderDelivery()` draws both). (3) A global 1-9 tab-jump plus a "?" keyboard-shortcuts overlay —
  the first place every real shortcut on the page (arrow-key tab-rail nav, N/P/Escape in
  Presentation Mode, arrow keys/Escape in the Tour) is gathered in one list, its tab-jump line
  built from the same `TAB_DRAWER` labels item 2 introduced rather than a second, hand-typed copy.
  Declined, not defaulted: the full SVG subway-line/animated-train redesign, a Cmd+K command
  palette, and a cross-tab root-cause filter/highlight mode — all left as TJ's call, not silently
  dropped.

  Two real bugs caught live in the browser, both fixed same-session: the 320px NCR-grid overflow
  above, and this browser-automation environment's own synthetic key-dispatch not computing the
  shifted "?" character for Shift+/ (it delivers `key:"/"` + `shiftKey:true` instead of `key:"?"`)
  — a genuine automation-tool limitation, fixed defensively in the app's own code by accepting
  both shapes rather than working around it only in the test harness. `node stress.cjs` run fresh
  (`1620 passed, 0 failed` — 1543 baseline (1541 + this round's own NCR-fix regression test) + 77
  new assertions across two new sections, D16/D17, each independently confirmed to throw/fail
  against pre-feature code before being confirmed passing against the fix), `node verify.cjs`
  unchanged (pure UI/nav, zero `PKGS` touched), and live-browser confirmed at 320px/375px/768px/
  desktop: the NCR fix holds across all 11 tabs at both mobile widths, the hover-drawer opens and
  closes correctly (including the already-selected-tab suppression and mutual exclusion with the
  glossary popover — with the tooltip/dialog `role` attribute correctly reset each way), and all
  nine digit shortcuts plus the "?" overlay work end to end (button click, keyboard, Escape,
  backdrop click) with zero horizontal overflow anywhere.
- **2026-08-21 altitude-grouped-rail round**: TJ shared a second nav-IA brainstorm proposal
  (5-tier tab grouping with status pills, sticky in-tab section anchors, a 3-playlist Guided Tour
  selector, two-way contextual breadcrumbs, and an a11y scaffold). Grounding corrected the
  proposal's own grouping on 2 counts before building anything — Data Strategy is governance/
  architecture content (CDE staging, ingestion guards, a rollout plan), not reference material, so
  it moved to Governance & Execution instead of Reference; Risk & Change is priced/commercial risk,
  not field-level telemetry, so it moved to Program Performance instead of being paired with
  Delivery. Also corrected: "38 live-computed terms" (real count is 53, already rendered live);
  "leverage the existing PRESENT_BEATS array and tour engine directly" (three separate arrays with
  different data shapes — Present beats are static bullets, Tour beats are live-narrated
  functions — not one reusable engine); "pure CSS `position:sticky; top:var(--nav-height)`, zero
  JS" (no such variable existed yet, and the horizontal tab bar isn't sticky at all below 1050px).
  TJ approved Tier 1 (grouping + Gate 5 pill; sticky anchor rail) and Tier 2 (return breadcrumb);
  the 3-playlist Tour selector was deferred pending a second grounding pass against `TOUR_BEATS`'
  actual content, not built this round.

  Same message also reported "something wrong with the dashboard that was updated last" with no
  specifics. Extensive synthetic + live-browser testing on the deployed site (all 11 tabs, digit
  shortcuts, the "?" overlay, Present/Tour, mobile width) found nothing — until checking the
  shortcuts overlay's *rendered CSS*, not just its `.hidden` JS property, surfaced a real, severe
  bug from the prior round: `.shortcuts-overlay{...display:flex...}` carried no `[hidden]`
  qualifier, and `[hidden]` and a bare class selector tie in specificity — an author-stylesheet
  rule wins that tie regardless of source order, so `display:flex` silently overrode the UA's own
  `[hidden]{display:none}` even while `el.hidden` correctly read `true`. Net effect: a full-
  viewport `rgba(0,0,0,.5)` backdrop — easy to miss by eye against this page's already-dark
  theme — permanently covered and click-blocked the *entire* dashboard the first time anyone
  opened the Shortcuts panel and closed it. The prior round's own verification only ever checked
  `.hidden` (correctly `true`) and the DOM-stub suite (no real CSS engine, structurally unable to
  see this class of bug) — never the actual computed `display` or a real click hit-test, which is
  exactly how it shipped undetected. Fixed with `.shortcuts-overlay:not([hidden])`; this is very
  likely the exact bug TJ was reporting.

  Two more real bugs caught live-browser *before* they ever shipped, both in this round's own new
  code: (1) the anchor rail's first version tried to force a closed `<details>` open at ≥600px via
  a pure-CSS `:not([open])>nav{display:flex}` override — the child DID paint (real computed
  `display:flex`, real height), but the closed `<details>`'s own generated box stayed 11px tall
  regardless, so the next sibling in normal flow overlapped and click-intercepted it — a real,
  invisible, unusable rail. Fixed by JS-setting the real `open` attribute instead
  (`syncAnchorRails()`, same `matchMedia`-driven pattern as the file's own `syncTabsOrientation()`)
  — a genuinely-open `<details>` sizes and hit-tests itself correctly with zero CSS override
  needed. (2) The return breadcrumb's first version was `top`-anchored at
  `calc(var(--nav-height)+12px)`, the same offset the anchor rail's sticky positioning uses — but
  `--nav-height` is only accurate at ≥1050px (the header wraps to several rows below that), so at
  mobile widths the pill visibly overlapped the still-wrapping header. Fixed by bottom-anchoring
  it instead, which needs no header-height knowledge at all. A fourth issue, a plain typo
  (`fromTab!==="act"` — four `=` characters where `!==` needed three), was a straightforward
  syntax-error catch via `node --check`/`acorn`, not a live-browser find.

  `node stress.cjs` run fresh (`1664 passed, 0 failed` — 1620 baseline + 44 new assertions across
  three new sections, D18/D19/D20, each independently confirmed to fail/throw against pre-round
  code via a git-stash round-trip before being confirmed passing against the fix), `node
  verify.cjs` unchanged (pure UI/nav, zero `PKGS` touched), and live-browser confirmed at 320px/
  375px/1400px: all 11 tabs switch correctly in the new grouped order, the Gate 5 pill shows/hides
  correctly, both anchor rails open/scroll/collapse correctly (mobile `<details>` toggle
  confirmed, `scroll-margin-top` clearance measured at ~120px against a computed ~120px target),
  and the return breadcrumb shows/returns/dismisses/auto-clears correctly at both the longest real
  tab label and at 375px with zero horizontal overflow anywhere. (One live-browser artifact worth
  naming for future sessions: this environment's tabs sometimes evaluate JS with
  `document.visibilityState==="hidden"`/`innerWidth:0` regardless of which tab is visually
  fronted, which also suppresses `scroll-behavior:smooth` animations specifically — `window.
  scrollTo({behavior:"instant"})` and `matchMedia` both still read correctly in that state,
  confirming it's this tool's own quirk, not a page bug; a `resize_window` + fresh `navigate`
  immediately before a check reliably clears it.)
- **2026-08-21 whole-repo `/stress-test` round**: TJ asked for a full adversarial pass across the
  repo, not just the just-shipped nav round. Two independent reviews: a direct pass (index.html's
  CSS/security/verify.cjs) plus a fresh-context agent (`pipeline/`, `otak.html`, `architecture.html`,
  doc-claim accuracy, a `stress.cjs` test-quality sample). 9 findings, ranked most severe first —
  all 9 driven to a resolution, one of the 9 turning out to be a false positive on reproduction:
  1. **HIGH, confirmed live**: `#cntGate5` (the Gate 5 status pill added last round) carried the
     exact same `[hidden]`-vs-class-selector CSS bug the `.shortcuts-overlay` fix addressed —
     `.tabs .cnt{display:inline-block}` (author origin, equal specificity) beat the UA's own
     `[hidden]{display:none}`. Forcing `hidden=true` live measured a real, painted 65×34px box
     regardless. Dormant only because Gate 5 is currently blocked (pill correctly shown); the
     moment it clears, an empty colored blob would have permanently rendered after "Operating
     Framework." Fixed with `.tabs .cnt:not([hidden])`, with a new structural regression guard
     (this DOM-stub harness has no real CSS engine and can't see the bug itself — same blind spot
     that let it ship in the first place, called out explicitly this time).
  2. **MEDIUM**: `pipeline/models/schema.yml` declared 10 guardrail tests `run_pipeline.py` never
     actually ran (only 4 were implemented, and one of those 4 had a mislabeled `check()` string —
     "ev <= pv" printed for what was actually testing `ev<=bac`). All 10 missing checks
     implemented (claim_id unique/not_null, package_id not_null + referential integrity to
     `dim_control_account`, pv/ev/ac_delta ≥0 on `stg_progress_claims`; package_id/bac not_null +
     bac≥1 on `fct_control_account`) and the mislabel fixed. Check count grew 54→64, confirmed live
     (`python3 pipeline/run_pipeline.py`, fresh venv, 64 PASS / 0 FAIL) — every "54/64 checks"
     reference across `index.html`, `architecture.html`, `README.md`, this doc, and `stress.cjs`
     updated in lockstep (current-state claims only — historical §19 entries citing the old count
     as accurate-at-the-time were correctly left untouched).
  3. **MEDIUM**: `architecture.html`'s self-reported "verified... on 2026-08-18" banner was stale
     (file edited again 2026-08-20/21 without bumping it) — updated to 2026-08-21, the date this
     round's `stress.cjs` `E.1` pass actually re-confirmed its counts live.
  4. **MEDIUM**: the Sound Transit R2026-11 citation (appears in both `otak.html` and `index.html`)
     self-reported "verified 19 Aug 2026," but the commit that wrote the claim landed 18 Aug — no
     real re-check on the 19th. Actually re-verified fresh via WebSearch against soundtransit.org's
     own resolution PDF (content confirmed accurate — real "adaptive program management framework,"
     December 2026 Board consideration) and re-dated 21 Aug, the date that real re-check happened.
     Two adjacent citations caught the same way while checking this one: the Flyvbjerg/PMI
     reference-class-forecasting citation was ALSO genuinely re-verified today (confirmed via a
     live PMI.org page) and re-dated 21 Aug; the Sound Transit P6-scheduling-spec citation could
     NOT be fully re-verified today (the source PDF exceeded WebFetch's 10MB limit) — dated back to
     18 Aug, matching the commit that did the real work, rather than falsely claiming a fresh check.
  5. *(meta, not independently fixable)* — the D18 test added for `#cntGate5` in the SAME commit
     that fixed the shortcuts-overlay bug checked only the `.hidden` JS property, the exact blind
     spot documented three paragraphs away in that commit's own D19 comments. The lesson from one
     instance hadn't generalized. Addressed by extending live-browser CSS verification to every
     `hidden`-toggled element this round (all were probed: `helpPop`/`presentBar`/`tourBar`/
     `cphDrill` confirmed correct; only `cntGate5` was broken), not just the one that broke.
  6. **LOW**: the pipeline's "SQL == dashboard" proof is partly circular by construction (raw
     claim rows are reverse-engineered from the JS totals via a residual-cents plug) — README/
     HANDOFF §12 now state this plainly rather than implying an independently-sourced dataset.
  7. **LOW**: 7 existence-only `stress.cjs` assertions (funding-tier `why` text, Galton bead
     colors, all 11 tab-drawer contents, 11 glossary-term resolutions) passed regardless of correct
     vs. garbled content. Strengthened with real independent-re-derivation checks for all of them
     except the architecture-node captions (already well-covered by an adjacent distinctness check
     + 2 specific spot-checks, left as-is rather than over-engineered).
  8. **LOW**: `verify.cjs` carried a comment claiming an "S-curve monotonicity invariant (EV≤PV,
     AC≥EV)" check existed — no such check was ever implemented anywhere. On inspection the
     invariant as stated isn't even valid (SPI/CPI can legitimately exceed 1 for a package ahead of
     schedule or under budget) — the comment described something that would have been WRONG to
     implement, not just missing. Removed rather than implemented.
  9. **FALSE POSITIVE, confirmed by reproduction**: flagged `state.textSize` restored from
     `localStorage` as unbounded, risking a throw on `TEXT_ZOOM[oob].zoom`. Live-browser
     reproduction (`localStorage.pccTextSize="999"`, fresh reload) contradicted the prediction —
     `applyTextSize()` already clamps `state.textSize` at its own top
     (`Math.max(0,Math.min(TEXT_ZOOM.length-1,...))`) before ever indexing `TEXT_ZOOM`, a guard
     missed on first static read. The redundant duplicate clamp initially added was reverted rather
     than left as dead-weight code — exactly the "never dismiss a finding as a false positive
     without reproducing it first" discipline this file's own `verify.md` states, applied to a
     finding of my own, not just an external one.

  `node stress.cjs` run fresh (`1692 passed, 0 failed` — 1665 baseline + 27 new/strengthened
  assertions; the `#cntGate5` regression guard and both pipeline-count tripwires independently
  confirmed to fail against pre-round `index.html` via a git-stash round-trip before confirmed
  passing against the fix). `node verify.cjs` exits 0. `python3 pipeline/run_pipeline.py` (fresh
  venv) confirmed 64 PASS / 0 FAIL live. Live-browser confirmed at 1280px: all 11 tabs switch
  cleanly, zero horizontal overflow, `#cntGate5` correctly shows "Gate 5 blocked" (real current
  state) and correctly collapses to `display:none`/0×0 when forced hidden.
  **Accepted limitations, stated explicitly**: the architecture-node caption existence check
  (finding #7's one un-strengthened instance) stays as-is — already well-covered by neighbors, not
  worth individually re-deriving. The Sound Transit P6-spec citation's exact sub-clause text
  (01 32 13.25) was not independently re-verified this round (10MB PDF, tool limit) — the document
  itself is confirmed real and the general claim (Sound Transit requires P6 scheduling) matches
  industry-standard practice for agencies this size, but the precise sub-clause detail rests on a
  PRIOR round's own verification pass, not this one's.

- **2026-08-21 Control Tower brainstorm round (items 1-4)**: an external, unverified UX blueprint
  ("Megaproject Float & Risk Control Tower") was ground against the live codebase line-by-line
  before anything was proposed — most of it was already built (the confidence slider, the
  Flyvbjerg reference-class card, the dark palette — hex-identical to the proposal's own choices,
  the idle-cost breakdown — already a real 3-way split, stronger than the proposal's 2-way donut,
  the guided Tour, click-driven glossary help). Two items in the proposal (a DCMA 14-Point full
  grid, a trade-stacking heatmap) were **declined outright, not deferred** — both require
  activity-level/per-trade schedule data this ledger's own on-page text already states it doesn't
  carry (`index.html` §Schedule tab, the existing 14-Point-Assessment caveat); building either
  would mean fabricating pass/fail states or crew-overlap data, the same standard that already
  declined EWMA-on-Earned-Schedule in the Kimi research-package round. Four items were real and
  buildable: (1) an FS&harr;SS toggle on D-04, using CP-101's own real +22d float and the delay's
  own real -7d impact — both numbers already existed, only the toggle is new; (2) a CPLI
  status-band summary strip, independently re-derived from `rows`, complementing rather than
  duplicating the existing per-package bars chart (a prior brainstorm claim that CPLI had "no
  visual treatment" was itself wrong — contradicted, per the project's own B35 discipline, by
  finding the existing `bars("cpli",...)` chart mid-implementation, so item 2's scope was narrowed
  accordingly, not built as originally proposed); (3) an AACE 57R-09 risk-driver layer — a real,
  separate Bernoulli-per-run event layer for each of the priced risk register's own named risks,
  additive on top of the existing cost-efficiency Monte Carlo, opt-in and starting empty so the
  canonical board-facing `MC` object is provably byte-identical before and after (asserted by
  direct object-identity check in `stress.cjs`, not inferred); a second prior brainstorm claim
  ("the Monte Carlo already carries per-risk contribution data") was also found wrong on inspection
  — that data belongs to the tri-point PERT playground's per-*control-account* contribution, not
  the separate `RISKS` register, which had never been wired into the simulation at all before this
  round; (4) Flyvbjerg's own published "trifecta" rate (0.5%, 80/15,920 projects) added to the
  existing reference-class card, independently recomputed (not just copied from the source
  blueprint) before being cited. `node stress.cjs`: 1692&rarr;1719 assertions. A following
  `/stress-test` pass on this same round (own review + an independent fresh-context reviewer,
  running concurrently — both converged on the same HIGH finding independently) caught and fixed
  five real issues before landing: (1) the D-04 badge itself was still `days(-7)`, hardcoded,
  despite the prose sentence beside it correctly reading `days(d.d)` — a direct on-screen
  contradiction, probed by mutating the live `DELAYS` entry and rendering; (2) the round's own new
  regression guard for that bug checked the whole rendered blob for the mutated value instead of
  the specific badge span, so it passed even with the badge still broken — the unrelated prose
  sentence satisfied the blob-wide search on its own, a textbook "assertion that would pass even if
  the feature were broken"; (3) the tab-rail hover-drawer's Glossary note, and (4) its
  `stress.cjs`-side expected-value comparison, both still hardcoded "53 terms" — this round's own
  53&rarr;54 glossary sweep should have caught both and didn't, and the comparison in (4) was
  providing zero real protection since it was checked against the equally-stale value in (3), not
  a live count; (5) a missing multi-risk toggle test, the aggregation-across-2+-risks branch having
  shipped with zero coverage. All five re-verified by reintroducing each bug individually and
  confirming the strengthened test now fails, then restoring and confirming green again. `node
  verify.cjs`: headline tie-out unchanged to the decimal (BAC/PV/EV/AC/SPI/CPI/EAC/VAC/TCPI all
  identical to the pre-round run, independently re-confirmed via a direct pre/post commit-boundary
  MC.p50/sims comparison, not just the object-identity check `stress.cjs` already asserted) —
  confirming the new risk-driver layer never touches the canonical board number unless a risk is
  explicitly checked on. **Accepted limitation:** one transient `1715 passed, 1 failed` run was
  observed mid-pass while this round's own edits and the independent reviewer's own `stress.cjs`
  runs were happening concurrently against the same working tree; not reproduced in dozens of
  subsequent runs, most plausibly a race against a mid-edit intermediate file state rather than a
  real product bug — noted rather than hidden, not chased further given non-reproduction.

- **2026-08-21 GBM/MLE brainstorm round (items 1-4)**: a second external blueprint (this one
  proposing a full "cone of uncertainty" fan chart, milestone-date PDF popups, and an EVM-vs-GBM
  P80-completion comparison) was ground against `deriveGbmParams()`'s own comment before anything
  was proposed — that comment already states n=6 (5 log-returns) is "genuinely too thin to trust
  as a fitted forecasting model" and already declined a smaller, closely related ask ("Stochastic
  TCPI") for exactly that reason. Nearly the entire blueprint required projecting that same
  fragile &sigma;&#770; forward in time — the fan chart, the PDF popups, the P80 comparison, a
  "High Confidence" convergence pulse (a **false claim**, directly contradicting the card's own
  finding) — all **declined outright, not deferred**, the same standard already applied to the
  Control Tower round's DCMA-14/trade-stacking declines. A "Historical Window Slider" was also
  declined: `AC_HISTORY` **is** 5 real points, full stop, nothing to slice into a longer/shorter
  lookback. "Outlier Scrubbing" tied to named historical events was declined too — `AC_HISTORY`
  carries only `{month, ac}`, no cause/event field; inventing "March 2026: utility relocation
  surge" would have been fabricated narrative, not real data. Four items were real and honest: (1)
  a log-return strip plot (5 real points, each labeled by its real month pair, not a histogram —
  n=5 can't honestly form one) with (2) a fitted Gaussian curve drawn over them, correctness-
  checked to center on `rbar` (the sample mean the 5 points actually distribute around) and NOT
  `muHatMle` (a different, Ito-adjusted quantity, `rbar + 0.5*sigma^2`) — verified as a real,
  checkable distinction (`rbar != muHatMle` whenever `sigmaHatMle > 0`), not a rounding artifact;
  (3) EVM-vs-GBM reframed as a methodology comparison (what CPI-extrapolation assumes vs. what GBM
  admits) rather than a forecast comparison, explicitly stating what was declined and why, right on
  the card; (4) a "Math unlocked" plain-language drift/volatility drawer, zero new computation.
  `node stress.cjs`: 1719&rarr;1740 assertions (21 new + 2 count-fix updates: `GLOSS` 54&rarr;55
  for the new `gbmvsevm` term, `details.dbox` panel count 12&rarr;13 for the new drawer). All
  passing, including a direct check that `renderGbmLogReturns()` — the one new render function
  baking literal `C()` colors into SVG — is wired into `redrawCharts()`, otherwise a theme toggle
  would leave it showing stale colors. `node verify.cjs`: headline tie-out unchanged (this round
  touches zero `PKGS`-derived value, pure visualization/narrative on numbers `deriveGbmParams()`
  already computed). Live-browser confirmed via direct DOM read (real CPI 0.956, real drift
  6.83%/month, real 5-point log-return geometry, zero `NaN` in the SVG path/circle coordinates) —
  **the Browser-pane screenshot tool itself malfunctioned this session** (blank captures across a
  fresh tab, ref-based clicks, and multiple wait/retry attempts, with zero console errors and valid
  DOM state throughout), so this round is verified by direct DOM inspection rather than a visual
  screenshot; stated as a real, accepted limitation, not silently substituted for the real thing.

- **2026-08-21 `/stress-test` pass on the GBM/MLE round**: own review + an independent
  fresh-context reviewer, both converging on the same real finding independently (a genuinely
  productive collision this time, not a duplicate-effort waste — the reviewer's report explicitly
  noted the in-progress fix mid-flight per this project's own `reconcile.md` doctrine and did not
  re-fix it). Own review caught first: `gaussPdf`'s divisor and the chart's `lo`/`hi` domain
  formula had no floor against a degenerate all-identical-log-returns input — not reachable with
  today's real data (&sigma;&#770;=0.017), but reproduced directly against a synthetic
  exact-doubling series (a first attempt using 10%/period compound growth did NOT trigger it,
  floating-point residue in `Math.log()` of decimal ratios kept &sigma;&#770; a tiny-but-nonzero
  float rather than a clean zero — a contradicted first prediction, corrected before writing the
  regression test rather than left in) and confirmed the ORIGINAL formula genuinely produces
  `NaN` on that exact input, then confirmed the fix (a `1e-4` spread floor, a `1e-6` sigma floor,
  local to the chart's own math, never touching the real `sigmaHatMle` the numeric tiles report)
  stays finite on the identical input. The independent reviewer found the same defect
  independently before seeing the fix, plus one genuinely new finding: the round's own new
  "no forward-projected P80 figure" test was itself tautological — reproduced with an adversarial
  fixture (a fake "GBM P80 completion estimate: March 2027" sentence) that passed both original
  assertions anyway, because "completion figure" already appears in the honest disclosure sentence
  itself and satisfied an unconditional OR. Fixed by requiring exactly one `P80` occurrence in the
  whole card AND that occurrence sitting within the disclosure sentence specifically (a bounded
  regex), re-verified against the exact same adversarial fixture, which now correctly fails the
  check. `node stress.cjs`: 1740&rarr;1745 assertions, all passing. `node verify.cjs`: headline
  tie-out unchanged throughout.

- **2026-08-21 Glossary brainstorm round (items 1-3)**: a third external blueprint ("Interactive
  Project Controls Glossary & Educational System") was ground against the live Glossary tab before
  anything was proposed — it described 38 terms; the real count is 55, three rounds past that
  number, and the blueprint's other claims (LaTeX formulas, Cmd/Ctrl+K, no existing cross-tab
  routing) were checked individually rather than trusted. Two items **declined outright**: a real
  LaTeX/MathJax renderer would be this file's first external dependency, contradicting the
  project's own stated zero-dependency architecture (README: "No build step, no framework, no
  dependencies, no CDN") through 20+ prior brainstorm rounds; Cmd/Ctrl+K directly violates an
  already-written rule in this file's own global keydown handler — `if(e.metaKey||e.ctrlKey||
  e.altKey) return; // never hijack a browser/OS shortcut sharing this key` — since Cmd/Ctrl+K is
  the browser's own address-bar-search shortcut in every major browser. Three items were real and
  buildable: (1) a "See it live" cross-tab jump button on every one of the 55 cards, each with a
  real, individually-verified `jT`/`jE` target (every one of the 55 checked against real tab codes
  and real element ids in markup, not assumed) — reusing the existing `data-jump-tab`/`data-jump-el`
  delegated-click mechanism already used 15+ places on this page, no new plumbing; (2) a bare `/`
  keyboard shortcut (GitHub-style) substituted for the declined Cmd/Ctrl+K, confirmed not bound
  anywhere else in the file before adding it; (3) a 5-category domain filter (Cost & EVM, Schedule
  & CPM, Risk/Commercial & Governance, Field Telemetry & Quality, Data Strategy & Architecture),
  each of the 55 terms individually categorized against the dashboard's own existing 6-family KPI
  system rather than freehand, with counts derived live from the real array. A real mid-build
  design decision, stated rather than silently made: category badges were deliberately left
  uncolored, NOT mapped onto this dashboard's existing `--c-ok`/`--c-warn`/`--c-bad` red/amber/green
  tokens as the source blueprint proposed — those three colors already mean pass/warn/fail
  everywhere else on this page, and a red "Field Telemetry" badge next to an actually-failing
  red pill would read as a false status signal, not a category label. A real self-caught bug fixed
  before it shipped: "Explore in Glossary" (the existing inline-help-icon jump) didn't reset the
  category filter, so a term from a different category than whatever filter was last active would
  have been silently hidden — reproduced, fixed (the jump now resets `state.glossCat` to "All"),
  and re-verified. `node stress.cjs`: 1745&rarr;1828 assertions (83 new — including an
  individually-checked jump-target audit across all 55 terms, category+search combined-as-AND
  behavior, the category-filter-reset regression guard, and the bare `/` shortcut's three real
  branches: switches tabs + focuses search, Shift+`/` correctly goes to the shortcuts panel
  instead, and it's a no-op while already typing in an input). `node verify.cjs`: headline tie-out
  unchanged (pure UI/categorization on already-real data). Live-browser confirmed end to end, not
  just the Node stub: clicked a category pill (correctly filtered from 55 to the real per-category
  count), clicked a "See it live" button (correctly jumped tabs and scrolled), and pressed the real
  `/` key (correctly switched to Glossary and focused the search box) — the screenshot tool that
  malfunctioned during the prior round's verification worked cleanly this time.

- **2026-08-22 `/stress-test` pass on the Glossary round**: own review + an independent
  fresh-context reviewer, both real and substantially non-overlapping this time. Own review caught
  3 jump-target specificity issues by spot-checking a handful of terms against where their
  concept is actually rendered: `contingency` was pointing at Gate 5's card (contingency coverage
  is only one of three checks there) when a purpose-built "Contingency vs. progress" chart already
  existed on the Cost tab; `ve`/`buyout` were pointing at the generic 4-method EAC table (which
  has no VE/Buyout line items at all) when the real baseline bridge — which literally names both
  as bridge rows — already existed. The independent reviewer, checking the same class of thing
  more exhaustively (10+ terms, read against the actual rendering code, not just existence),
  found 2 more of the same defect (`bac`/`tcpi` also pointed at the EAC table, which has no BAC or
  TCPI row) plus 3 findings this session's own review missed entirely: (1) a genuine category
  inconsistency — `gbm`/`gbmvsevm` and `fundingtier` were categorized `cost` while their direct
  conceptual siblings (`montecarlo`/`referenceclass`/`pertdist`/`riskdriver`, all uncertainty-
  modeling methods; `fundingtier`, a governance/prioritization framework, not an EVM formula) sat
  in `risk` — moved all three to match; (2) a real ARIA mismatch: the category filter shipped as
  `role="tablist"`/`role="tab"`, but it re-filters one shared list rather than swapping to a
  genuinely separate panel per selection — the actual APG tablist pattern, and what this page's
  own nav rail does — while every OTHER filter-button group already on this page
  (`mcFilter`/`mcRiskFilter`/`kfilters`/`phases`) correctly uses `role="group"`+`aria-pressed`;
  this session's own code comment had claimed the tablist pattern was correct, which the reviewer
  proved false by reading `renderGlossary()` directly, not by taking the comment's word for it;
  (3) a real, confirmed focus-loss bug baked into the tablist version's own ArrowKey handler —
  `to.focus(); to.click();` where the click handler immediately rebuilds the pill bar's entire
  `innerHTML`, destroying the exact button node `.focus()` had just targeted, so arrow-key nav
  worked exactly once per session and then silently stopped (confirmed by reading the code, not
  just the DOM-stub's own documented `querySelectorAll` limitation). Fixed by matching the
  established `role="group"`/`aria-pressed` convention exactly, which also eliminates the need for
  any custom ArrowKey handler at all — deleted, not patched. The reviewer separately caught a
  tautological test matching the exact pattern flagged in each of the two prior rounds' own
  stress-test fixes: `sumOfCats===55` is mathematically guaranteed to pass for ANY partition of 55
  items into any number of buckets, reproduced by mutating every single term's category to the
  same value and confirming the assertion still passed; replaced with a check that verifies all 5
  real categories are actually represented and each has at least one term, reproduced against the
  same mutation to confirm it now correctly fails. `node stress.cjs`: 1828&rarr;1834 assertions,
  all passing. `node verify.cjs`: headline tie-out unchanged. Live-browser re-confirmed the
  corrected `role="group"` markup and two of the retargeted jump buttons (BAC&rarr;baseline
  bridge, TCPI&rarr;Overview KPI board) actually work end to end.

- **2026-08-22 second whole-repo `/stress-test` pass** (own review + an independent
  fresh-context reviewer, genuinely non-overlapping this time — own review swept doc/data drift
  in sections neither of the last 3 narrowly-scoped stress-test rounds had re-touched, the
  reviewer swept code/pipeline/accessibility ground neither had). Own review found and fixed 4
  real stale figures in §2's at-a-glance table, none caught by the last 3 rounds because they only
  re-verified their OWN round's specific claims: SQL/DuckDB parity checks stated as 54 (real: 64,
  §12 elsewhere in this same file already said 64 — only the summary table had drifted), Glossary
  terms stated as 53 (real: 55), git history stated as 100 commits (real: 117), and Actions/RAID
  register items stated as "17 (6 Issue, 10 Task, 1 Decision)" — independently recounted directly
  from the `ACTIONS` array (real: 15 total, 4 Issue/10 Task/1 Decision; the original "17"/"6" both
  came from a regex that, unscoped to each object, picked up 2 extra "Issue"-shaped string matches
  elsewhere in the block). The independent reviewer, covering different ground, found: (1) a
  **systemic** focus-loss bug across 5 more controls (`mcFilter`, `mcRiskFilter`, `kfilters`,
  `audienceFilters`, the tour bar's Next button) — the SAME defect class the Glossary round's own
  stress-test pass had just fixed for the category filter specifically, but that fix relocated the
  bug rather than eliminating it (it matched the `mcFilter` pattern exactly, which turned out to
  have the identical issue); confirmed live in a real browser (not just read) that clicking each
  control dropped `document.activeElement` to `&lt;body&gt;`, and confirmed `#phases` — a sibling
  control mutating `aria-pressed` on existing nodes instead of rebuilding — correctly keeps focus,
  proving the fix pattern already existed in this file, just wasn't applied consistently. Fixed by
  adding one shared `refocusFilter()` helper and calling it after each of the 6 rebuild-then-lose-
  focus sites (5 filter groups + the tour's `goToTourStop()`), re-verified live in the browser for
  all 6 (real `BUTTON`, never `&lt;body&gt;`) since the DOM-stub's own `querySelector()` limitation
  (documented elsewhere in this file) makes the actual restoration unexercisable through
  `stress.cjs` — the new regression tests instead assert the source code still calls the
  restoration function at each site, proven to actually catch a reverted fix by reproducing one
  and confirming the test fails, then restoring; (2) a stale pipeline comment claiming "10 checks"
  when the real, already-correct count elsewhere in the same file is 14; (3) one genuinely dead
  CSS rule (`.inf`), confirmed via a full-file word-boundary sweep to have zero markup/JS
  consumers while its underlying color token remains genuinely in use elsewhere. The reviewer also
  independently hand-recomputed TCPI and both EAC methods from the raw ledger and confirmed the
  SQL pipeline's own arithmetic — not just its guardrail existence checks — matches the JS side
  exactly; confirmed zero `eval`/`exec`/shell-injection surface in `pipeline/run_pipeline.py`;
  exhaustively checked all 21 non-Glossary cross-tab jump targets (all resolve); confirmed
  `otak.html`'s own numeric claims (20 KPIs, 7 Partial + 1 Gap requirements) still match live
  reality; and found no named-function dead code across all ~260 top-level functions. `node
  stress.cjs`: 1834&rarr;1846 assertions, all passing. `node verify.cjs`: headline tie-out
  unchanged. `python3 pipeline/run_pipeline.py`: still ALL CHECKS PASSED, 14/14. Live-browser
  re-confirmed a clean console across a visual sweep of the 6 tabs (Risk & Change, Delivery, AI &
  Data, Operating Framework, Actions, Data Strategy) neither of the last 2 rounds' own live-browser
  checks had covered, plus the 6 focus-restoration fixes themselves.

Generated 2026-08-20, against the tip of the eleven-input-ledger-card engagement round; extended
2026-08-21 for the six-KPI-families card round, again 2026-08-21 for the Data Strategy tab UI/UX
round, again 2026-08-21 for the "96→100" brainstorm round's Tier 0/1 items, again 2026-08-21 for
the full-dashboard `/stress-test` visual pass, again 2026-08-21 for the Monte Carlo PERT
draw-shape round, again 2026-08-21 for the Monte Carlo run-count round, again 2026-08-21 for the
megaproject-controls-doc upgrade round, again 2026-08-21 for the Kimi research-package round, again
2026-08-21 for the second full-dashboard `/stress-test` pass, again 2026-08-21 for the Monte Carlo
mode-vs-bounds clarification, again 2026-08-21 for the EAC-spread live check, again 2026-08-21
for the total-float early-warning round, again 2026-08-21 for the Monte Carlo captivation round,
again 2026-08-21 for the Galton Engine round, again 2026-08-21 for the third full-dashboard
`/stress-test` pass, again 2026-08-21 for the "how the dashboard catches drift" round, again
2026-08-21 for the tab-rail navigation round, again 2026-08-21 for the altitude-grouped-rail
round, again 2026-08-21 for the whole-repo `/stress-test` round, again 2026-08-21 for the
Control Tower brainstorm round items 1-4, again 2026-08-21 for the GBM/MLE brainstorm round
items 1-4, again 2026-08-21 for the `/stress-test` pass on that same round, again 2026-08-21
for the Glossary brainstorm round items 1-3, again 2026-08-22 for the `/stress-test` pass on
that round, and again 2026-08-22 for the second whole-repo `/stress-test` pass (see git log for
exact commits — each document update was written before its own round's commit lands, per the
project's "verify, then document" ordering).
