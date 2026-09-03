# Known gaps / deferred work — Project Controls Command Center

The volatile half of what used to be `docs/HANDOFF.md` §18-19: named deferred work, resolved
items kept for their reasoning (not deleted — a resolved gap's own history is often the best
evidence a fix actually works), and the full session-by-session provenance log every count/claim
in [`docs/HANDOFF.md`](HANDOFF.md) traces back to.

Split out 2026-09-03 (Claude Code workflow-leverage round) — `HANDOFF.md` had grown to 1,802 lines
by mixing durable architecture (rarely changes) with this log (grows every session). See
[`docs/HANDOFF.md`](HANDOFF.md) for the architecture/tab-by-tab/extension-points reference this
file assumes as background. Nothing below was reworded or re-derived — this is the original
content, moved verbatim.

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
6. ~~**"Top-level JS functions: 176" in §2 was not re-audited this round**~~ — **Resolved
   2026-08-26**: rather than continuing to guess at which of 176/204/169's narrower, undocumented
   methodologies to trust, §2/§4 now both cite one fresh, single, stated methodology
   (`grep -nE "^\s*function [a-zA-Z_]" index.html | wc -l` = 375) and drop the three-way
   disagreement instead of patching one of the old numbers. The prior mismatch was never actually
   investigated or reconciled — it's superseded, not solved.
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
   existed in the code; the real feature is the 11-stop `TOUR_BEATS`. Caught in passing during the
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
13. **`var TABS=[...]` (`index.html:11342`) no longer matches its own comment** — found while
    rebuilding §7 for this doc's 2026-08-26 comprehensive resync: the comment above it claims the
    array's order "matches the tab rail's own visual/DOM order," but the real DOM order (`.tabs`
    markup, `index.html:901-916`) puts `exec` (Executive Command) second, while the JS array lists
    it last. Surfaced, not silently fixed — this is a code comment/possible-latent-bug question,
    out of scope for a documentation pass (coding-discipline.md).
14. **§13 (Companion pages) and §3's file-by-file layout still don't cover `walters-wolf.html` or
    `facade.html`** — added 2026-09-02 on `feat/walters-wolf-fit-brief`, six days after this file's
    last full pass, and this document (which bills itself as "a complete technical blueprint of
    everything in this repository") never picked them up (found by an independent /stress-test
    reviewer: `git grep -i "walters\|facade" docs/HANDOFF.md` returned zero hits before this note).
    §2's table and this section's own bullet list have a stopgap one-line mention each; the real
    fix is a proper §13 entry per page (design, harness count, known limitations) the next time
    this file gets a full resync — deferred, not silently dropped.

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
  (`architecture.html`, `otak.html`), and the cross-tab overlays (11-stop Tour, Presentation Mode,
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
  elsewhere in the block).
  **Correction (whole-repo `/stress-test`, 2026-08-23): this Actions/RAID re-count was itself
  wrong.** A fresh, direct parse of the live `ACTIONS` array (one `{id:` object boundary per
  entry, `type:` field read per object, cross-checked against `stress.cjs`'s own passing
  `P.actions.length===17` assertions and `architecture.html`'s independently-stated "17 tracked
  items") confirms the real count is **17 total, 6 Issue / 10 Task / 1 Decision** — the ORIGINAL
  number this entry describes correcting away from, not the "15"/"4 Issue" this entry replaced it
  with. §2's at-a-glance table has been corrected back to 17/6/10/1. Left this paragraph in place
  rather than deleting it: it's a real, useful example of why a "re-verify a count" step must
  itself be checked (a regex over-matching "Issue"-shaped substrings elsewhere in the file), not
  proof this specific 15/4 number was ever right.
  The independent reviewer, covering different ground, found: (1) a
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

- **2026-08-24 Gate 5 solvency what-if sandbox round** (`gate5SandboxCalc()`/`renderGate5Sandbox()`):
  a brainstorm-mode brief proposing Gate 5 upgrades was independently fact-checked against source
  first — most of it (the LaTeX drawer, solid-hex "ruby" backgrounds, `role="region"` elsewhere,
  the "READY TO AUTHORIZE" label) was fabricated or already-shipped under different names ("one
  root cause, five instruments" already covered its "Thread Weaver" ask; "Working Backward from
  Gate 5" already covered its inversion-engine ask). Two items were real and new: a 3-lever what-if
  sandbox (sponsor capital, R-01 mitigation %, value engineering $) against the exact
  `contRemaining ÷ (overrun + riskExposure)` formula Gate 5 itself runs, and `aria-live="polite"` +
  `role="region"` on 4 containers confirmed genuinely missing it (`gate5Card`, `invCard`,
  `rootCauseThread`, the new sandbox card) while 15+ other places in the file already had the
  pattern. `stress.cjs` grew 2226&rarr;2260: pre-registered values for every lever (at all-zero the
  sandbox reduces exactly to live `T.contCoverage`; +$50M sponsor capital moves only the numerator;
  100% R-01 mitigation removes exactly R-01's own real exposure and nothing else; all-3-levers-at-max
  clears the gate against today's real ledger, stated as a prediction before checking) plus a
  source-string accessibility check (the DOM stub can't see static-HTML-only attributes, so a
  stub-attribute check would have silently passed on a missing one too — caught live, fixed to grep
  `indexSrc` instead). `node verify.cjs`: unchanged. Live-browser re-confirmed the real numbers
  (\$52.6M/\$89.4M/0.588 at baseline, \$102.6M/\$46.5M/2.208 CLEARED at max levers), the reset
  button, and a clean console. `README.md`'s "every tab, every feature named" section and this
  document's own headline test-assertion counts (§2, §11, both of which had drifted to 2,226
  despite 9 more feature rounds shipping since 2026-08-21 — Delivery, D-02 toggle, Actions Kanban,
  Data Strategy crosswalk, Portfolio LOB drill-down, AI & Data EWMA week drill-down, Risk & Change
  drill-down, Overview root-cause panel, global nav 3-track tour — were resynced the same pass this
  entry was written, per this project's "verify, then document" ordering) were updated in the same
  pass. **Known gap, stated not hidden:** those 9 rounds' own dedicated prose changelog entries were
  never individually backfilled into this section — their content lives in `git log` commit
  messages, not here; a future pass could write them up if that level of detail is ever needed.
- **2026-08-26 comprehensive resync** (requested directly by TJ: "generate a comprehensive full
  complete dashboard specifications"): this document had drifted furthest behind of the project's
  three doc surfaces — even `README.md` already knew about Ask AI and Executive Command before
  this file did. Every count in §2/§5/§7/§9/§11/§12/§13 was pulled fresh this pass, not carried
  over: `grep -nE "^\s*function [a-zA-Z_]" index.html | wc -l` (375), `wc -l` on `index.html`
  (12,249), `otak.html` (449), `architecture.html` (598, confirmed unchanged), `git log --oneline
  | wc -l` (178), `node stress.cjs` (**3,330 passed, 0 failed**, fresh this pass), a fresh
  `python3 pipeline/run_pipeline.py` run in a throwaway venv (**65 PASS, 0 FAIL**, fresh this
  pass — not assumed from the prior 64-check citation), `node worker/smoketest.js` (25 passed, 0
  failed), and `window.__PCC__` for `GLOSS.length` (61) and `ESCALATION.length` (12). The tab
  rail's real DOM order/grouping (`index.html:901-916`) was read directly rather than trusted from
  any prior doc, which is what surfaced §18 gap #13 (the `TABS` array's own comment no longer
  matching its own array). Content gaps closed, not just numbers: §3 gained the entire `worker/`
  directory (previously zero mentions anywhere in this 126KB file — confirmed via
  `grep -n "worker/\|Ask AI\|ASK_AI" docs/HANDOFF.md` returning nothing before this pass); §5
  gained the `ESCALATION` row; §7 was rebuilt from 11 rows to the real 13, with the altitude-group
  table added; §8 gained entries for the multivariate anomaly score, forecaster comparison, sticky
  nav, and Ask AI; §10 was renamed and expanded from narrative-only to cover both AI features; §11
  gained `worker/smoketest.js` as a documented 3rd test harness. `README.md` was found to have its
  own, independently-stale figures (still says "11 tabs," and cited a 4th different stale
  stress.cjs count, "2,974 assertions," distinct from both this file's stale 2,260 and the real
  3,330) — flagged here rather than silently left, fixed separately in that file, not folded into
  this document's own count trail. This pass touched only `docs/HANDOFF.md`; it did not re-verify
  or re-derive any KPI/EVM computation, so `verify.cjs`'s tie-out is unchanged from §2 above.
- **2026-08-26, later same day — consolidated resync after the 10-feature dashboard-upgrade
  round.** TJ asked directly to "move forward" and "proceed" through all 10 researched-but-unbuilt
  proactive-prevention mechanisms named in the vault's `11_STRATEGIC_CHALLENGES_AND_SOLUTIONS.md`
  (see that file's own revision history for the research side of this work). Rather than resync
  docs after each of the 10 individual feature commits, this is one consolidated pass covering
  everything: `index.html` 12,249→12,691 lines, top-level functions 375→392 (fresh
  `grep -cE "^\s*function [a-zA-Z_]"` count), git 178→190 commits, `stress.cjs` 3,330→3,469
  passed (fresh `node stress.cjs` run this pass), `GUARDS` 28→29 (a new QA/QC-to-critical-path
  closure gate), `RISKS` 6→7 (R-07, extreme-weather exposure — a real, cascading addition that
  also moved `T.riskExposure`/`T.contCoverage`/the Gate 5 funding gap, all independently
  reconfirmed via the same fresh `stress.cjs`/`verify.cjs` run). Five new data structures
  documented for the first time (§5): `OWNER_DECISIONS`, `SUB_HEALTH`, `LABOR_MOBILIZATION`,
  `CARBON_DISCLOSURE`, `AUDIT_LOG`. `architecture.html`'s own "28 checks" prose (diagram box,
  legend table, and the `#archSvg` aria-label's spoken-word "twenty-eight") was corrected to 29
  in the SAME commit that added the 29th guard, not deferred here — confirmed via
  `stress.cjs`'s own `E.1` sync section, which caught the exact drift live before this doc pass
  started. `README.md`'s headline tagline, its own `stress.cjs`/guard-count citations, and its
  "every tab, every feature named" section were also updated in this same consolidated pass, not
  left for a future one. This pass touched no `PKGS`/`derive()` logic itself; `node verify.cjs`
  tie-out is unchanged from the last real ledger-affecting change (R-07's own commit, already
  independently verified there).
- **2026-08-26, still later the same day — consolidated resync after the 10-item UX/UI upgrade
  round.** A separate brainstorm-mode request ("propose adding 10 more ux and UI features and
  upgrades"), distinct from the proactive-prevention round above; TJ chose "All 10" over the
  cheaper recommended subset. One consolidated pass again, not 10 separate ones: `index.html`
  12,691→12,936 lines, top-level functions 392→396 (same fresh `grep -cE "^\s*function
  [a-zA-Z_]"` count), git 190→200 commits, `stress.cjs` 3,469→3,536 passed (fresh `node
  stress.cjs` run this pass). `GUARDS` (29) and `RISKS` (7) both unchanged — this round was pure
  UX/navigation/presentation, no new ledger or register content. Ten items, each independently
  B27-gate-hole-proofed (temporarily broken, confirmed the new assertion caught it, restored,
  reconfirmed green) and live-browser-verified: (1) stagger-in animation + (2) 3-state severity
  icons on the 3 registers the prior round added; (3) a back-to-top button with a scroll-progress
  ring, (9) the tab-badge policy documented explicitly; (5) "changed since you last looked"
  extended to 4 new derived-count fields; (10) a light-theme QA sweep that found and fixed one
  real bug — `#backToTop` used `background:rgb(var(--c-elev))`, but `--c-elev` is a complete
  box-shadow value, not an RGB triplet, so the background silently resolved transparent; fixed to
  `rgb(var(--c-card))`; (7) the printable executive brief, found 10 features stale (it silently
  omitted every mechanism the prior round shipped), now carries a "Proactive watch" section
  reusing `changeWatchSnapshot()`/`materialUnabsorbedExposure()`; (8) the Guided Tour gained one
  new stop ("Catching it before it's a variance," index 5), re-indexing the 3 curated tour tracks
  around it; (4) all 10 sections on the AI & Data tab (the longest run, ~10 sections) are now
  collapsible via native `<details>`/`<summary>`, not hand-rolled JS; (6) a real, always-visible
  global search box in the top bar — deliberately not a hidden Cmd/Ctrl+K palette, which every
  major browser already reserves for its own address-bar search — indexing KPIS/RISKS/ACTIONS/
  GLOSS via each register's own existing jump mechanism. Two independently-verified diligence
  corrections landed mid-round, both from TJ's own standing instruction to verify unfamiliar
  claims/documents before using them: Washington's RCW 39.116 (Buy Clean Act) is disclosure-only,
  not a numeric threshold (corrected before the carbon-disclosure feature shipped, in the prior
  round); AGC's real 2025 statistic is "92% of firms **that are hiring**," not "92% of firms"
  (corrected before shipping). This pass touched no `PKGS`/`derive()` logic; `node verify.cjs`
  tie-out is unchanged from the last real ledger-affecting change (R-07's commit).
- **2026-08-27 — full `/stress-test` pass on the whole dashboard.** Own review + 2 independent
  fresh-context reviewers. Real findings, all fixed: the live "Compliance sweep" GUARDS check had
  been genuinely FAILING on the deployed page since the prior round (a real AGC citation
  allowlisted in `stress.cjs`'s own sweep but never in this LIVE guard's matching allowlist —
  `node stress.cjs` could never catch it, since its DOM stub has no `document.body` at all); 4 of
  29 GUARDS checks were pure algebraic tautologies (fixed to genuine re-derivations or real
  business-rule invariants, each proven by corrupting the exact input and watching the guard flip
  to FAIL); a dead branch in `subHealthTier()`; a keyboard-unreachable global-search dropdown; a
  ~1.8-billion-times-too-loose SQL/dashboard parity tolerance in `pipeline/run_pipeline.py`.
  `stress.cjs` 3,536→3,568.
- **2026-08-27, same day — 12-item deep-research build.** TJ asked for a deep-research pass
  ("run a deep research to identify best strategies that backed peer review") on project-controls
  best practices for large-scale heavy civil/transportation infrastructure — 4 parallel research
  agents (AACE/PMI/EVM standards; sustainability frameworks; AI/predictive tech; real transit
  megaproject case studies), then chose "All 12" of the proposed items. Every item traces to a
  real, cited, independently-verified source — AACE International RP 17R-97/56R-08/57R-09, CII's
  PDRI, a real Computers & Industrial Engineering paper (Hotelling's T² for correlated EVM metrics), the
  Washington State Auditor's real Sound Transit findings, California's real Buy Clean Act GWP
  caps (with the comparable federal program correctly flagged as rescinded/defunded in 2025), the
  real Cantarelli/Flyvbjerg overrun-taxonomy and ASCE stakeholder-attribution papers, FTA's real
  Standard Cost Category worksheet, the real Envision (ISI) rating structure, FHWA's real LCCA
  methodology, and GAO's real cost-estimate credibility framework (GAO-20-195G). Every fabrication
  risk was resolved toward honesty over completeness — PDRI's exact 68-element checklist wasn't
  reproduced verbatim, Envision's score was left unfabricated (a real gap, stated plainly), LCCA
  was applied to a real rail-industry decision with explicitly illustrative inputs rather than
  invented pavement data. `stress.cjs` 3,568→3,790, `index.html` 12,936→13,738 lines, functions
  397→420, git 200→218 commits, glossary 61→73 terms. `GUARDS` (29) and `RISKS` (7) unchanged —
  every item added a leading indicator/comparison/checklist, none touched `PKGS`/`derive()`
  logic; `node verify.cjs` tie-out unchanged throughout both rounds.
- **2026-08-27, same day — cost-code / unit-rate granularity round.** TJ asked for the dashboard's
  cost structure to go one level below the FTA SCC categories, down to real, unit-priced bid-item
  granularity with multi-level cost-driver indicators — 2 research passes (one flagged a
  fabricated premise in the request's own framing: no real "CSI MasterFormat Heavy Civil
  Construction Supplement" exists; a follow-up specifically hunted rail-track/TBM-tunnel unit
  costs). Built: a 6-line cost-code breakdown (WSDOT Standard Item Number convention, real
  TxDOT-sourced concrete/excavation unit rates on 3 lines, 3 honest "no verified public source"
  gaps on reinforcing steel/track/tunnel-excavation rather than invented numbers), the real
  quantity-variance/price-variance decomposition (AACE RP 86R-14 pointer, the identity proven
  independently), a real 25%-quantity-overrun contract-adjustment flag (Caltrans/Iowa DOT/FAR
  52.211-18), a Pareto cost-driver ranking (real ASCE 2022 methodology) one level below the
  existing package-level variance bridge, an AACE estimating-method column on the existing
  estimate-classification card (Class 3/2/1 verbatim-confirmed, Class 4/5 stated at lower
  confidence, not overclaimed), and 2 real reference benchmarks (Sound Transit U-Link, LA Metro
  SCC-10) explicitly labeled as bundled/all-in figures, never conflated with the atomic cost-code
  rates. `stress.cjs` 3,825→3,882, `index.html` 13,759→13,947 lines, functions 420→425, glossary
  73→76 terms. `GUARDS`/`RISKS` unchanged (29/7) — the feature adds a new layer below `PKGS`,
  doesn't touch `derive()` or any existing KPI logic; `node verify.cjs` unchanged throughout.
- **2026-08-27, same day — UX/UI upgrade round.** TJ asked to make the dashboard "more
  interactive, engaging, lively, entertainment, educational, insightful." A fresh-context reviewer
  audited the live page cold (not from source alone) and found the site already unusually mature
  on interactivity, then flagged which specific elements were still static and which existing
  mechanisms could cover them without inventing anything new. Built all 9: (1) page-wide
  cross-chart hover-highlight (`data-acc`) wired into the PDRI/AACE maturity tables; (2) the risk
  heat-grid's click now opens the one real risk directly (or scrolls the register into view for
  multiple) instead of repeating the hover tooltip; (3) a per-row "See it live" jump link on all
  20 KPI-reference-library rows, reusing the existing `data-jump-openkpi` idiom; (4) "how this is
  actually computed" disclosures on all 29 integrity-gate checks — each one shows its own real
  `run()` function source verbatim, not a hand-authored paraphrase that could drift; (5) a live
  numeric trace-back on 3 of 12 escalation rules (CPLI, VAC-vs-contingency, EAC drift velocity),
  deliberately not all 12, matching this dashboard's own cited Pareto stance; (6) the Milestone
  Variance list moved onto the shared `bars()` component already used for float/CPLI; (7) the new
  cost-code table cross-linked to its own Pareto ranking via a generalized `data-code` highlight
  (the account-highlight listener was refactored into one shared, parameterized function rather
  than duplicated); (8) the Circuit-breaker "try it" demo pattern extended to Quarantine and
  Self-healing (previously prose-only); (9) read-only hover-highlight on the WBS/CBS/OBS/ABS table
  (both instances), deliberately keeping its existing `cursor:default` — no click behavior added
  where none was wanted. One real regression fixed along the way: adding
  `wireDetailsAnimation()` to a `fire()`-triggered event handler surfaced a genuine gap in
  `stress.cjs`'s own multi-`runPage()` document-stub pattern (a minimal stub, restored for a
  different reason in an earlier section, was missing `querySelectorAll`) — fixed in the harness,
  not worked around in the app. `stress.cjs` 3,882→3,993, `index.html` 13,947→14,120 lines,
  functions 425→432. `GUARDS`/`RISKS`/glossary unchanged (29/7/76) — every item reused an existing
  mechanism, none added new data or computation. `node verify.cjs` unchanged throughout.
  Live-browser-verified item by item (hover cross-highlight, click-to-drawer, jump links, gate
  disclosures, live traces, both demos) in both themes — the one class of check the Node DOM stub
  cannot exercise at all.
- **2026-08-27, same day — Estimate Maturity cards stacked (TJ's own reported friction).** The
  PDRI/AACE cards sat side by side in a 2-column `.grid.g2`; the AACE card's extra Method column
  makes it meaningfully taller (750px vs 606px real, live-measured heights), and CSS grid's
  default row-stretch left visible void space under the shorter FEP card. Switched to a plain
  `.grid` (stacked, one full-width row each) — the same single-column pattern already used a few
  sections below. Live-browser-verified: both cards now render at identical width (967px at
  1280px viewport), a normal 29px gap between them, no stretched void. `stress.cjs` 3,993→3,997,
  `index.html` 14,120→14,126 lines. `node verify.cjs` unchanged (pure presentational).

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
that round, again 2026-08-22 for the second whole-repo `/stress-test` pass, and again 2026-08-24
for the Gate 5 solvency what-if sandbox round (see git log for exact commits — each document
update was written before its own round's commit lands, per the project's "verify, then document"
ordering; the 9 brainstorm-mode rounds shipped 2026-08-23 between those two dates are reflected in
this document's headline counts and in `README.md`'s per-tab feature list, but do not each have
their own dedicated prose entry here — see the gap noted in the entry just above); again 2026-08-26
for the comprehensive resync round (see the entry immediately above this paragraph) covering
everything shipped between 2026-08-24 and 2026-08-26 — the Gate 5 solvency sandbox `/stress-test`
fixes, the Enterprise Command Center blueprint harvest (temporal-fence guardrail + DCMA glossary
entry), the multivariate anomaly score, the forecaster comparison, Executive Command + Attention &
Triage (2 new tabs), the Ask AI feature, and the sticky nav fix; again 2026-08-26, later the same
day, for the consolidated 10-feature dashboard-upgrade resync (see the entry two above this
paragraph) — the pending owner/agency decisions register, subcontractor financial-health watch,
escalation-matrix rationale field, R-07 extreme-weather risk, labor-availability leading
indicator, forward material-price exposure trigger, QA/QC closure gate, embodied-carbon
disclosure readiness, shadow-ledger framing, and the session activity/audit trail.

---

## 2026-09-03 additions (Claude Code workflow-leverage round)

- **This file's own split from `docs/HANDOFF.md`**: §18-19 (this file's entire content above this
  entry) moved verbatim out of `HANDOFF.md`, which had grown to 1,802 lines mixing durable
  architecture with this volatile log. `HANDOFF.md` §1-17 unchanged in substance, just no longer
  weighed down by this file's own growth. New `CLAUDE.md`, `.claude/skills/stress-test/SKILL.md`,
  `.claude/hooks/pre-push-verify.mjs` + `.claude/settings.json` added the same round — see
  `CLAUDE.md` for what each does.
- **Schedule-risk composite fix (d6f642a → 5cbad4f, same day, 2026-09-02/03)**: the composite score
  feature shipped with a hand-authored `pkg` field on `RISKS[]` that contradicted this codebase's
  own `riskLinkedActions()` design principle and was factually wrong for 3 of 4 mappings — see the
  fix commit and `index.html`'s own block comment above `pkgRiskExposure()` for the full story.
  **A real concurrency incident happened mid-fix, worth recording on its own**: this repo is a
  plain checkout, not a git worktree, and another active Claude Code session silently checked out a
  different branch (`feat/shop-field-hours-split`) in this same directory while the fix was still
  uncommitted — discovered only because a routine pre-push `git status --branch` check showed the
  wrong branch. Traced via `git reflog`/`git show --stat` before touching anything further: the
  original commit was safely preserved in `main`'s ancestry, neither session's files had been
  touched by the other (the other session's own commit messages explicitly scoped themselves away
  from `index.html`/`pipeline/`), and the fix was moved back onto `main` cleanly once confirmed safe
  to do so. Nothing was lost — but it was luck plus a careful re-check, not a structural guarantee.
  This is the concrete incident `CLAUDE.md`'s concurrency section refers to; **read that section
  before any commit if this repo has been open a while.**
- **Stale-count drift, again, on the very commit meant to demonstrate fixing it — twice, once found
  by the same `/stress-test` pass**: while correcting the schedule-risk composite's own stale-count
  drift (pipeline check count 66→101→103, `stress.cjs`'s own assertion count 3,997→4,019 across the
  same round), the fix pass itself missed 4 more citations of the *old* pipeline-check figure
  elsewhere in `docs/HANDOFF.md` (§2's table, §9, §13) and never updated the 4 `stress.cjs`-
  assertion-count citations in `README.md`/`docs/HANDOFF.md` at all — they had **zero** live-
  verification mechanism, unlike the pipeline count, which is why they drifted silently. Fixed, and
  closed structurally this time: `stress.cjs`'s new `D62` section (added 2026-09-03) is a self-
  referential check — it runs last, compares its own final `pass` count against the literal prose in
  both files, and fails loudly if they ever drift again.

  The SAME `/stress-test` pass, while verifying that fix, found a **second, independent instance of
  the identical gap in a completely different test harness**: `docs/HANDOFF.md` cited
  `worker/smoketest.js`'s assertion count four different, mutually-inconsistent ways (28 in §2, 25
  in three other places) against a real, live count of 40 — a drift that predates today's session
  entirely and had gone unnoticed since whenever it first happened. Closed the same way: a matching
  self-check added directly to `worker/smoketest.js` itself (it has no shared file with `stress.cjs`,
  so it needed its own copy of the pattern, not a shared helper — each of this project's independent
  test processes now self-checks its own count). The honest lesson, reinforced twice in one pass:
  even a session actively fixing this exact bug class can both reintroduce a fresh instance of it
  *and* discover an older, unrelated instance nobody had ever caught — the fix has to be structural
  (a live check per process), not "be more careful," and "we already fixed this class of bug" is
  not evidence there isn't a second, older instance still sitting undetected somewhere else.
