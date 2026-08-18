# Project Controls Command Center

A phase-gated operating framework for capital program controls — 20 derived KPIs across cost,
schedule, risk, change, delivery and compliance, each carrying its formula, threshold bands, the
phases it is meaningful in, and the play to run when it breaches. Built around a synthetic
multi-package capital transit program, plus a requirement-coverage fit brief.

**Live:** https://tjaiyen.github.io/project-controls-command-center/

| Page / path | What it is |
|---|---|
| [`index.html`](index.html) | The command center — KPI board with drill-down detail, EVM S-curve and variance bridge, four-method EAC, what-if forecasting with scenario comparison, Monte Carlo completion distribution, DCMA-style schedule health (CPLI / BEI / float erosion), priced risk register, change pipeline, delivery leading indicators, an AI & data layer (pipeline architecture, the SQL model, a live 14-check integrity gate, and narrative generation under a verification contract), and the operating framework (phase playbook, escalation matrix, reporting cadence, KPI reference library) |
| [`otak.html`](otak.html) | Fit brief: requirement-by-requirement coverage against a Project Controls Manager posting, gaps included. Re-verified against live req #3775557 on 17 Aug 2026 |
| [`pipeline/`](pipeline/) | The data layer made executable — `run_pipeline.py` synthesizes raw monthly claims deterministically, builds the ledger through `models/fct_control_account.sql` in DuckDB, enforces the guardrails in `models/schema.yml`, and proves the SQL output identical to the browser's JavaScript derivation (55 checks) |
| [`verify.cjs`](verify.cjs) | Tie-out harness — stubs the DOM, executes the dashboard's script, and independently re-derives every portfolio total (`node verify.cjs`) |
| [`stress.cjs`](stress.cjs) | Adversarial stress harness — 272 assertions across structure, runtime, simulated interactions (tabs, phases, filters, drawer, drill-down, what-if, scenarios, Monte Carlo, print brief, narrative generation), narrative-vs-data consistency, and the fabrication/sanitization sweeps (`node stress.cjs`) |

## Synthetic data

**The program, packages, milestones and risks are invented.** No client, employer, or agency data
appears anywhere in this repository. The methods are the content.

## How the numbers work

The ledger holds twelve inputs per control account — BAC, PV, EV, AC, commitments, total float,
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
