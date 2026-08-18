# Project Controls Command Center

An interactive earned-value and schedule-health dashboard for a multi-package capital transit program,
plus a requirement-coverage fit brief.

**Live:** https://tjaiyen.github.io/project-controls-command-center/

| Page | What it is |
|---|---|
| [`index.html`](index.html) | The command center — EVM portfolio position, S-curve, contract-package ledger with drill-down, schedule float, milestone variance, priced risk register |
| [`otak.html`](otak.html) | Fit brief: requirement-by-requirement coverage against a Project Controls Manager posting, gaps included |

## Synthetic data

**The program, packages, milestones and risks are invented.** No client, employer, or agency data
appears anywhere in this repository. The methods are the content.

## How the numbers work

The ledger holds exactly four inputs per contract package — BAC, PV, EV, AC. Everything else is
derived in the browser:

```
SV  = EV − PV        schedule variance ($)
CV  = EV − AC        cost variance ($)
SPI = EV / PV        <1 behind schedule
CPI = EV / AC        <1 over cost
EAC = BAC / CPI      forecast at completion at current efficiency
VAC = BAC − EAC      forecast over/(under) run
```

Portfolio EAC is rolled up **bottom-up** as the sum of package EACs, because each package is its own
control account with its own cost efficiency. The independent check — portfolio `BAC / CPI` — is
displayed alongside it. The two legitimately differ; a single blended CPI hides the spread between
packages, and that spread is what a program manager needs to see.

Current tie-out (verifiable in the browser console via `__PCC__.totals`):

| | |
|---|---|
| BAC | $1,240.0M |
| PV / EV / AC | $847.0M / $819.7M / $857.6M |
| SPI / CPI | 0.968 / 0.956 |
| EAC (bottom-up) | $1,303.7M |
| EAC (independent, BAC/CPI) | $1,297.3M |
| VAC | −$63.7M |
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
