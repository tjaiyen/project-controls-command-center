# Project Controls Command Center

A phase-gated operating framework for capital program controls — 20 derived KPIs across cost,
schedule, risk, change, delivery and compliance, each carrying its formula, threshold bands, the
phases it is meaningful in, and the play to run when it breaches. Built around a synthetic
multi-package capital transit program, plus a requirement-coverage fit brief.

**Live:** https://tjaiyen.github.io/project-controls-command-center/

| Page / path | What it is |
|---|---|
| [`index.html`](index.html) | The command center, 11 tabs — Overview (a "Six lenses, not one blended score" card explaining what each KPI family — Cost, Schedule, Risk, Change, Delivery, Compliance — actually asks and why it can't be folded into the others, a "Three layers, not one number" card naming this dashboard's own leading-telemetry / confirming-EVM / independent-assurance architecture for the first time, each layer real and already built on its own tab, a KPI board with drill-down detail including a live root-cause-to-owner trace and a float-specific companion panel connecting the worst-float account to its real linked delay fragnet and crew-level idle-time split, an eleven-input ledger card with a per-package inspector and a live "change one input, watch the KPIs move" demo, a 10-stop guided Tour with tab-jumping evidence links), Portfolio (agency-level rollup across 4 lines of business, one read live off this program's own totals, three summary-only), Cost (EVM S-curve and variance bridge, an estimate-to-budget baseline bridge reconciled to the ledger, four-method EAC with a live divergence check flagging when the methods disagree by more than ~5%, a forecast-reliability section — EAC trend, a forecast-accuracy scorecard, monthly cash flow — what-if forecasting with scenario comparison, Monte Carlo completion distribution with a Triangular/PERT draw-shape toggle, a drag-to-inspect percentile needle, a flashing "100% Contingency Breach" pill, an Optimism Gap tile against the Flyvbjerg reference class, and a tri-point Beta-PERT curve playground with draggable/arrow-key-editable min/mode/max pins per control account), Schedule (DCMA-style schedule health — the objective metric triad the DCMA 14-Point Assessment and ANSI/EIA-748 sit under, named explicitly: SPI(t)/Earned Schedule, CPLI, BEI, float erosion —, a tracking Gantt with a per-account hover tooltip that works the CPLI formula live, a fragnet-based delay & TIA register tied to package float, revenue-service forecast drift), Risk & Change (priced risk register, a contract commercial register — a third axis distinct from control accounts —, change pipeline with proposed-vs-settled pricing defense), Delivery (leading indicators — productivity factor, RFI/submittal aging, a quality NCR register with real open counts and per-item aging —, a crew cost-per-hour module), AI & Data (pipeline architecture, the SQL model, a live 28-check integrity gate, and narrative generation under a verification contract), Operating Framework (phase playbook, a WBS/CBS/OBS/ABS control-account mapping, Board phase-gate governance with a live Gate-5 hard stop, escalation matrix, a live Working-Backward/inversion worked example, reporting cadence, stakeholder interface map, KPI reference library), Actions (a RAID/CAPA register with proactive staleness detection and owner accountability rollup), Glossary (53 terms with live worked examples, plus a click-driven inline "i" help icon next to jargon anywhere on the page), and Data Strategy (a real-world plan for connecting scattered, multi-system data — staging architecture, a 4-tile IDS guardrail status grid with a live 2-check ingestion-validation panel embedded in it, a discrepancy-resolution decision flow, a Category/Trigger/Routing error-recovery table, a Dual-Stack Parity card citing this program's own real, live CPI against the actual SQL that independently re-derives it) — plus motion throughout (draw-in charts, staggered cards, growing histogram bars) with a `prefers-reduced-motion` guard |
| [`architecture.html`](architecture.html) | A drawing-schedule-style map of the dashboard's own upstream→downstream data flow — six source systems through the ledger, KPI board, integrity gate, governance, to the three published outputs. A verified snapshot, not a live render |
| [`otak.html`](otak.html) | Fit brief: requirement-by-requirement coverage against a Project Controls Manager posting, gaps included. Re-verified against live req #3775557 on 17 Aug 2026 |
| [`pipeline/`](pipeline/) | The data layer made executable — `run_pipeline.py` synthesizes raw monthly claims deterministically, builds the ledger through `models/fct_control_account.sql` in DuckDB, enforces the guardrails in `models/schema.yml`, and proves the SQL output identical to the browser's JavaScript derivation (54 checks). Requires `pip install duckdb` — no other dependencies |
| [`verify.cjs`](verify.cjs) | Tie-out harness — stubs the DOM, executes the dashboard's script, and independently re-derives every portfolio total (`node verify.cjs`) |
| [`stress.cjs`](stress.cjs) | Adversarial stress harness — 1,472 assertions across structure, runtime, simulated interactions (tabs, phases, filters, drawer, drill-down, what-if, scenarios, Monte Carlo, print brief, narrative generation, story walkthrough, glossary filter, inline help popover, presentation mode, KPI root-cause drill-down, working-backward/inversion component, the Data Strategy tab, nav-rail keyboard navigation), module reconciliations (baseline bridge, change pricing, delay/float tie-out, WBS/contract/portfolio/forecast tie-outs), narrative-vs-data consistency, content-correctness checks (not just counts — e.g. a firing escalation must carry its own rule text, not a neighbor's), and the fabrication/sanitization sweeps (`node stress.cjs`) |

## Synthetic data

**The program, packages, milestones and risks are invented.** No client, employer, or agency data
appears anywhere in this repository. The methods are the content.

## How the numbers work

The ledger holds eleven inputs per control account — BAC, PV, EV, AC, commitments, total float,
remaining critical-path duration, baseline and completed activity counts, and earned versus actual
hours. Everything else is derived in the browser; nothing is a stored result:

```
SV  = EV − PV            schedule variance ($)
CV  = EV − AC            cost variance ($)
SPI = EV / PV            <1 behind schedule (in dollars, not days)
CPI = EV / AC            <1 over cost
EAC = BAC / CPI          forecast at completion at current efficiency (one of four methods shown)
VAC = BAC − EAC          forecast over/(under) run
TCPI = (BAC−EV)/(BAC−AC) efficiency the remaining work must hit to land on budget
CPLI = (cpRemaining + totalFloat) / cpRemaining   DCMA: <0.95 flagged
BEI  = activitiesDone / activitiesPlanned          DCMA: <0.95 flagged
PF   = earnedHours / actualHours                   leading indicator; moves before CPI
```

Portfolio EAC is rolled up **bottom-up** as the sum of package EACs, because each package is its own
control account with its own cost efficiency. The independent check — portfolio `BAC / CPI` — is
displayed alongside it. The two legitimately differ; a single blended CPI hides the spread between
packages, and that spread is what a program manager needs to see.

Current tie-out (verifiable in the browser console via `__PCC__.totals`, or with `node verify.cjs`):

| | |
|---|---|
| BAC | $1,240.0M |
| PV / EV / AC | $847.0M / $819.7M / $857.6M |
| SPI / CPI | 0.968 / 0.956 |
| EAC (bottom-up) | $1,303.7M |
| EAC (independent, BAC/CPI) | $1,297.3M |
| VAC | −$63.7M |
| TCPI (to BAC) | 1.099 |
| Complete | 66.1% |

## Stack

Static HTML. No build step, no framework, no dependencies, no CDN — each page is a single
self-contained file with inline CSS and one IIFE. Served directly by GitHub Pages from `main`.

Theming follows the same three-layer pattern as the rest of my work: `:root` dark default →
`@media (prefers-color-scheme: light)` → `:root[data-theme=…]` manual override.

## Related

- [Finance & data portfolio](https://tjaiyen.github.io/tj-finance-portfolio/) — dbt/DuckDB projects,
  Airflow orchestration, a guardrailed LLM finance agent
- [github.com/tjaiyen](https://github.com/tjaiyen)
