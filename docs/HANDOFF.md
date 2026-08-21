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
| Primary file | `index.html` — 6,447 lines, one file, no build step |
| Top-level JS functions | 176 |
| Tabs | 11 |
| KPIs (with formula/threshold/phase/source/play each) | 20 |
| JS integrity-gate checks (`GUARDS`) | 28, re-run on every page load |
| Ingestion-validation checks (`INGEST_GUARDS`) | 2 |
| SQL/DuckDB parity checks (`pipeline/run_pipeline.py`) | 54, independently verified this session — see §12 |
| Glossary terms (each with a live-computed worked example) | 44 |
| Actions/RAID register items | 17 (6 Issue, 10 Task, 1 Decision) |
| Control accounts / packages | 8 |
| Contracts | 6 |
| Risks | 6 |
| Delay events | 4 |
| `stress.cjs` test assertions | 1,300, all passing |
| Companion pages | `otak.html` (fit brief), `architecture.html` (static pipeline map) |
| Hosting | GitHub Pages, served directly from `main`, zero build |
| Git history | 89 commits |

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
| `GLOSS` | 44 | Term/definition/live-computed worked example, each independently traceable to real data | Glossary tab + every inline "i" help icon site-wide |
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
| 1 | **Overview** (`over`) | The 20-KPI board with drill-down detail (formula/threshold/source/play per card, plus a "computed from the ledger" / "not from the ledger" provenance box, honestly stated per KPI), a live root-cause-to-owner trace, the eleven-input ledger card (all 11 raw fields, a per-package inspector, and a live "change one input, watch the KPIs move" demo — reads a local snapshot, never mutates the real ledger), a five-chapter guided story walkthrough with tab-jumping evidence links, an executive summary. |
| 2 | **Portfolio** (`port`) | Agency-level rollup across 4 lines of business — one reads live off this program's own totals (never duplicated, `GUARDS`-checked), three are summary-only illustrative peers. |
| 3 | **Cost** (`cost`) | EVM S-curve + variance bridge, an estimate-to-budget baseline bridge reconciled to the ledger, four-method EAC, a forecast-reliability section (EAC trend, forecast-accuracy scorecard, monthly cash flow), what-if forecasting with 3 live sliders + scenario comparison, Monte Carlo completion distribution (4,000 runs, seeded/reproducible), the cost-diffusion (GBM) card. |
| 4 | **Schedule** (`sched`) | DCMA-style schedule health (CPLI/BEI/float erosion), a Gantt-style bar with baseline vs. forecast, a fragnet-based delay & TIA register tied to package float, revenue-service forecast drift, statistical control charts (z-score + EWMA) over crew cost-per-hour. |
| 5 | **Risk & Change** (`risk`) | A priced risk register (probability × impact heat map + sensitivity tornado chart), a contract commercial register (a third axis distinct from control accounts), change pipeline with proposed-vs-settled pricing defense, the settle-vs-DRB EMV decision tree with an **interactive slider + chart** (§8). |
| 6 | **Delivery** (`del`) | Leading indicators (productivity factor by package), the crew cost-per-hour module with a drill-down into idle/rework/baseline attribution. |
| 7 | **AI & Data** (`ai`) | The pipeline architecture diagram (now interactive — §8), the SQL model, a live 28-check integrity gate + 2 ingestion-validation checks, statistical control (z-score/EWMA) with worked-math accordions, and AI narrative generation under a verification contract (§10). |
| 8 | **Operating Framework** (`fw`) | Phase playbook, the WBS/CBS/OBS control-account mapping (with a worked "100% Rule" proof), Board phase-gate governance with a live Gate-5 hard stop, escalation matrix, a live Working-Backward/inversion worked example, reporting cadence, stakeholder interface map, the 20-metric KPI reference library. |
| 9 | **Actions** (`act`) | A RAID/CAPA register with proactive staleness detection, owner accountability rollup, a worked-math accordion for `actionStatus()`'s threshold logic. |
| 10 | **Glossary** (`gloss`) | 44 terms, each with a live-computed worked example, filterable by search — the same content the inline "i" help icons pull from site-wide. |
| 11 | **Data Strategy** (`data`) | A real-world plan for connecting scattered, multi-system data — ISO 19650 CDE staging architecture as an interactive flow diagram (§8), automated guardrails, a discrepancy-resolution decision flow folded into that same diagram, proactive error recovery. |

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
- **44-term glossary** with live search filter, plus a click-driven inline "i" help icon next to
  jargon anywhere on the page — both read from the same `GLOSS` array, so there's one source of
  truth for every definition.
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
3. **`pipeline/run_pipeline.py`** (54 checks, SQL/DuckDB, offline) — the same ledger built twice,
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

**`stress.cjs`** (1,300 assertions, all passing) — stubs the DOM, loads `index.html`'s script
verbatim into that stub, and exercises it exactly like a user would: every tab switch, every
filter, every drawer, every slider drag, every keyboard interaction. 32 labeled sections:

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

54 PASS, 0 FAIL — matching both `index.html`'s own "54 checks" prose and `README.md`'s claim
exactly, and the portfolio totals match the JS-side tie-out in §2 to the decimal. Requires
`pip install duckdb`; no other dependency, no network access, no credentials.

---

## 13. Companion pages

- **`otak.html`** — "Fit Brief: requirement-by-requirement coverage against a Project Controls
  Manager posting, gaps included." A separate, self-contained HTML file (448 lines) built around
  the same design system, honestly naming shortfalls rather than only strengths. Re-verified
  against the live posting once already (per its own header, 17 Aug 2026) — re-verify against the
  current live posting before reuse, since job postings and TJ's own gap profile both change.
- **`architecture.html`** (598 lines) — a **static, hand-verified snapshot** of the pipeline
  diagram, distinct from `index.html`'s own interactive `#arch` diagram (§8). The README already
  flags this distinction explicitly ("A verified snapshot, not a live render"). Worth noting for a
  future maintainer: these two diagrams can drift apart if one is updated and the other isn't —
  there's no automated check tying them together the way `GUARDS`/`stress.cjs` tie the ledger
  together. If the pipeline architecture changes again, update both by hand.

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

1. **EWMA and z-score control charts as real SVG line charts.** Currently rendered as tables with
   per-row PASS/FLAG pills; a genuine dynamic-band chart (a per-point-varying-width uncertainty
   band) is real new chart geometry that deserves its own session where verifying the SVG path
   math is the only job, not one item alongside 13 others.
2. **A 4th independent drill-down drawer for the risk register** (`#risks`). Three drawer
   implementations already exist independently (KPI root-cause, crew cost-per-hour, Actions row
   detail); whether to extract a shared `renderDrillDrawer(config)` helper is a real question worth
   deciding once a 4th *and* 5th instance both exist, not mid-build on the 4th.
3. **`architecture.html` and `index.html`'s `#arch` diagram can drift** (§13) — no automated check
   ties them together the way `GUARDS`/`stress.cjs` tie the ledger together. Its own stale "27
   checks" text (2 locations) was resynced to 28 on 2026-08-20, but the structural risk — nothing
   catches the *next* drift automatically — is unchanged; still an open gap, just not a stale one.
4. ~~**`README.md`'s own stated counts lag behind this document**~~ — **Resolved 2026-08-20** (and
   re-synced the same day after the ledger-card round bumped the counts again): 1,300 assertions /
   44 glossary terms / 28-check integrity gate, matching §2 as of this writing.
5. **The eleven-input ledger card is new this round** (2026-08-20) and only covers the Overview
   tab's own `PKGS` provenance — it does not touch or resolve gap #2 above (the risk register still
   has no independent drill-down drawer of its own).

---

## 19. Document provenance

Every count and claim in this document was pulled fresh this session from the live code — not
carried over from memory or an earlier pass:

- Line counts: `wc -l` on the actual files.
- Array counts (`KPIS.length`, `GUARDS.length`, etc.): read live via `window.__PCC__` in a running
  browser instance, not grepped/estimated from source (a source-text grep for KPI category labels
  initially over-counted by 2, caught by cross-checking against the live array).
- Test counts: a fresh `node stress.cjs` run (`1300 passed, 0 failed`) and `node verify.cjs`
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

Generated 2026-08-20, against the tip of the eleven-input-ledger-card engagement round (see git log
for the exact commit — this document is written before that commit lands, per the project's own
"verify, then document" ordering).
