#!/usr/bin/env python3
"""Pipeline proof: synthesize deterministic raw source rows, build the
control-account ledger in SQL (DuckDB), and prove the result identical to
the ledger the browser dashboard derives in JavaScript.

Two independent stacks — SQL here, JS in index.html — must produce the same
numbers. That equality is the data-integrity argument.

Usage:  python3 pipeline/run_pipeline.py
Exit:   0 if every check passes, 1 otherwise. No network, no credentials.
"""
import json
import math
import re
import sys
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"
MODEL = ROOT / "pipeline" / "models" / "fct_control_account.sql"
SCHED_MODEL = ROOT / "pipeline" / "models" / "fct_schedule_risk.sql"
PROGRESS_MODEL = ROOT / "pipeline" / "models" / "fct_progress_verify.sql"
MONTHS = 22          # months elapsed, mirrors PROGRAM.monthsElapsed
DATA_DATE = "2026-07-31"

failures = []
total_checks = 0
def check(label, cond, detail=""):
    global total_checks
    total_checks += 1
    print(("PASS  " if cond else "FAIL  ") + label + (f"  ({detail})" if detail else ""))
    if not cond:
        failures.append(label)

# --- 0. DATA_DATE consistency guardrail (/stress-test finding, 2026-09-02) -
# MODEL is executed verbatim (see MODEL.read_text() below) and hardcodes its own
# `date '...'` literal to stay genuinely dbt-style, rather than templating it in from Python --
# but that means this Python DATA_DATE and the SQL file's own literal are two independent sources
# of truth that could silently drift if one is edited without the other. This does not eliminate
# that (the fix would compromise the "reads like a real dbt file" design goal), but it makes any
# drift fail loudly here, in the very first check, instead of silently producing a ledger built
# against the wrong data-date while the "no future-dated claims" guardrail below keeps passing.
check(f"pipeline/models/fct_control_account.sql's date literal matches DATA_DATE ({DATA_DATE})",
      f"date '{DATA_DATE}'" in MODEL.read_text(),
      "update BOTH the SQL file's literal and this script's DATA_DATE together")

# --- 1. Parse the dashboard's ledger straight out of index.html ------------
src = INDEX.read_text()
pkg_re = re.compile(
    r'\{id:"(?P<id>CP-\d+)".*?bac:\s*(?P<bac>[\d.]+),\s*pv:\s*(?P<pv>[\d.]+),\s*'
    r'ev:\s*(?P<ev>[\d.]+),\s*ac:\s*(?P<ac>[\d.]+).*?float:\s*(?P<float>-?\d+),'
    r'cpRem:\s*(?P<cpRem>\d+)', re.S)
PKGS = [m.groupdict() for m in pkg_re.finditer(src)]
check("parsed 8 control accounts from index.html", len(PKGS) == 8, f"got {len(PKGS)}")
for p in PKGS:
    for k in ("bac", "pv", "ev", "ac"):
        p[k] = float(p[k])
    for k in ("float", "cpRem"):
        p[k] = int(p[k])

# --- 1b. Parse the risk register and change-order cycle inputs -------------
# (schedule-risk composite, 2026-09-02) — capture each risk object's own body up to its closing
# brace (these are flat literals, no nested `{`), then parse fields from within that one block —
# avoids a chained field-order regex silently drifting onto the wrong risk's fields if an
# unrelated field sits between two others, as genuinely happens in this source.
# NO pkg field parsed here (schedule-risk composite, CORRECTED /stress-test finding, same day as
# the original add): RISKS[] itself carries no pkg field -- see index.html's own
# riskLinkedActions() comment ("no hand-authored R-id -> package map"). The real risk-to-package
# link is derived below from ACTIONS[]'s own real pkg field, mirroring index.html's corrected
# pkgRiskExposure(), not from a static column on the risk register itself.
risk_block_re = re.compile(r'\{id:"(R-\d+)".*?\}', re.S)
risks_start = src.index("var RISKS")
risks_end = src.index("];", risks_start)   # the array's own closing bracket, not a magic window
RISKS_PY = []
for block_m in risk_block_re.finditer(src[risks_start:risks_end]):
    block = block_m.group(0)
    p_m = re.search(r'\bp:\s*(\d)', block)
    cost_m = re.search(r'\bcost:\s*([\d.]+)', block)
    RISKS_PY.append({"id": block_m.group(1), "p": int(p_m.group(1)), "cost": float(cost_m.group(1))})
check("parsed 7 risks from index.html RISKS[]", len(RISKS_PY) == 7, f"got {len(RISKS_PY)}")

# ACTIONS[] entries whose src names a risk register entry ("Risk register · R-01") -- the real
# link, same one riskLinkedActions() reads. Only 4 of 7 risks have one at all (per index.html's
# own comment); of those 4, only R-01's actually carries a pkg field today -- both counts are
# asserted below so a change in either direction (source drift) is caught, not silently absorbed.
action_block_re = re.compile(r'\{id:"(A-\d+)".*?\}', re.S)
actions_start = src.index("var ACTIONS")
actions_end = src.index("\n];", actions_start)
STG_ACTIONS = []
for block_m in action_block_re.finditer(src[actions_start:actions_end]):
    block = block_m.group(0)
    src_m = re.search(r'src:"([^"]*)"', block)
    if not src_m or "Risk register" not in src_m.group(1):
        continue   # only risk-linked actions matter for this join -- matches riskLinkedActions()'s
                    # own ACTIONS.filter(a => a.src.indexOf(k.id) >= 0) scope
    pkg_m = re.search(r'\bpkg:"(CP-\d+)"', block)
    STG_ACTIONS.append({"id": block_m.group(1), "src": src_m.group(1),
                         "pkg": pkg_m.group(1) if pkg_m else None})
check("parsed 4 risk-linked actions from index.html ACTIONS[]", len(STG_ACTIONS) == 4, f"got {len(STG_ACTIONS)}")
pkg_carrying = [a for a in STG_ACTIONS if a["pkg"]]
check("exactly 1 of those 4 actions carries a real pkg (only R-01's does, today)",
      len(pkg_carrying) == 1 and pkg_carrying[0]["pkg"] == "CP-201", f"got {pkg_carrying}")

co_re = re.search(r'coCycleDays:\s*(\d+),\s*coCycleTarget:\s*(\d+)', src)
check("parsed PROGRAM.coCycleDays/coCycleTarget from index.html", co_re is not None)
CO_CYCLE_DAYS, CO_CYCLE_TARGET = (int(co_re.group(1)), int(co_re.group(2))) if co_re else (0, 0)

# Progress verification (brainstorm-mode round, 2026-09-03): regex-parsed straight out of
# index.html's own CLAIMED_PROGRESS object/threshold literal, same discipline as PKGS/RISKS/
# ACTIONS above -- no hand-retyped copy of the 8 values to silently drift from the JS source.
claimed_re = re.search(r'var CLAIMED_PROGRESS\s*=\s*\{(.*?)\};', src, re.S)
check("parsed CLAIMED_PROGRESS object from index.html", claimed_re is not None)
CLAIMED_PROGRESS = {m.group(1): float(m.group(2))
                     for m in re.finditer(r'"(CP-\d+)":\s*([\d.]+)', claimed_re.group(1))} if claimed_re else {}
check("parsed 8 claimed-progress values from index.html", len(CLAIMED_PROGRESS) == 8, f"got {len(CLAIMED_PROGRESS)}")
flag_re = re.search(r'var CLAIMED_PROGRESS_FLAG_PCT\s*=\s*([\d.]+);', src)
check("parsed CLAIMED_PROGRESS_FLAG_PCT from index.html", flag_re is not None)
CLAIMED_PROGRESS_FLAG_PCT = float(flag_re.group(1)) if flag_re else 0.05

P_BAND = {1: 0.10, 2: 0.30, 3: 0.50, 4: 0.70, 5: 0.90}  # must match index.html's P_BAND verbatim

# --- 2. Deterministic synthesis of raw monthly claims ----------------------
# Bell-shaped spend curve (same family as the dashboard's S-curve weights).
# Integer cents, residual plugged into the final month -> sums are exact,
# reproducible, and seed-free by construction.
def bell_weights(n, peak, spread):
    return [math.exp(-((i - peak) / spread) ** 2) + 0.06 for i in range(n)]

def distribute(total_dollars, weights):
    cents_total = round(total_dollars * 100)
    wsum = sum(weights)
    raw = [cents_total * w / wsum for w in weights]
    cents = [math.floor(r) for r in raw]
    cents[-1] += cents_total - sum(cents)     # plug: exact by construction
    return [c / 100 for c in cents]

W = bell_weights(MONTHS, 17, 9)
rows = []
seq = 0
for p in PKGS:
    pv_m = distribute(p["pv"], W)
    ev_m = distribute(p["ev"], W)
    ac_m = distribute(p["ac"], W)
    for i in range(MONTHS):
        seq += 1
        # 22 elapsed months ending at the data date: 2024-10 .. 2026-07
        idx_abs = (2026 * 12 + 6) - (MONTHS - 1) + i   # Jul 2026 = index 2026*12+6
        month = f"{idx_abs // 12}-{idx_abs % 12 + 1:02d}-28"
        rows.append((f"CLM-{seq:04d}", p["id"], month, pv_m[i], ev_m[i], ac_m[i]))
check("synthesized 176 raw claim rows (8 accounts x 22 months)", len(rows) == 176,
      f"got {len(rows)}")

# --- 3. Build the ledger in SQL --------------------------------------------
con = duckdb.connect(":memory:")
con.execute("create table dim_control_account(package_id varchar primary key, package_name varchar, bac double, "
            "float_days integer, cp_remaining_days integer)")
con.execute("create table stg_progress_claims(claim_id varchar, package_id varchar, claim_month date, pv_delta double, ev_delta double, ac_delta double)")
con.executemany("insert into dim_control_account values (?,?,?,?,?)",
                [(p["id"], p["id"], p["bac"], p["float"], p["cpRem"]) for p in PKGS])
con.executemany("insert into stg_progress_claims values (?,?,?,?,?,?)", rows)
ledger = con.execute(MODEL.read_text()).fetchall()
cols = [d[0] for d in con.description]
by_id = {r[0]: dict(zip(cols, r)) for r in ledger}

# --- 3b. Schedule-risk composite: build risk register + actions + program tables, run the model
con.execute("create table stg_risk_register(id varchar, p integer, cost double)")
con.executemany("insert into stg_risk_register values (?,?,?)",
                [(r["id"], r["p"], r["cost"]) for r in RISKS_PY])
con.execute("create table stg_actions(id varchar, src varchar, pkg varchar)")
con.executemany("insert into stg_actions values (?,?,?)",
                [(a["id"], a["src"], a["pkg"]) for a in STG_ACTIONS])
con.execute("create table dim_program(co_cycle_days integer, co_cycle_target_days integer)")
con.execute("insert into dim_program values (?,?)", (CO_CYCLE_DAYS, CO_CYCLE_TARGET))
sched_ledger = con.execute(SCHED_MODEL.read_text()).fetchall()
sched_cols = [d[0] for d in con.description]
sched_by_id = {r[0]: dict(zip(sched_cols, r)) for r in sched_ledger}
check("fct_schedule_risk returned 8 rows", len(sched_ledger) == 8, f"got {len(sched_ledger)}")

# --- 4. Equality proof: SQL ledger vs the dashboard's own numbers ----------
# Tolerance tightened 2026-08-27 (/stress-test finding, independent reviewer): the real diffs are
# pure floating-point noise (~2.8e-14, empirically measured), not the ~0.05 the old 0.051
# tolerance implied was an acceptable margin -- that was ~1.8 billion times looser than the actual
# reconstruction error, silently able to mask a real ~$50K/field drift. 1e-6 matches this file's
# own eac-recomputed tolerance below and comfortably covers the real noise floor with a wide but
# honest safety margin.
for p in PKGS:
    q = by_id[p["id"]]
    for k in ("pv", "ev", "ac"):
        check(f"{p['id']} {k}: SQL == dashboard", abs(q[k] - p[k]) < 1e-6,
              f"sql={q[k]:.2f} js={p[k]:.2f}")
    check(f"{p['id']} spi recomputed", abs(q["spi"] - p["ev"] / p["pv"]) < 1e-9)
    check(f"{p['id']} cpi recomputed", abs(q["cpi"] - p["ev"] / p["ac"]) < 1e-9)
    check(f"{p['id']} eac recomputed", abs(q["eac"] - p["bac"] / (p["ev"] / p["ac"])) < 1e-6)

# --- 4b. Schedule-risk score: SQL vs. an independent Python re-implementation --------------
# A DIFFERENT KIND of proof than section 4 above, stated plainly: float/cpRem/RISKS/coCycle are
# themselves base-level inputs in this dataset (nothing finer-grained exists to synthesize them
# from, same honest limitation the "other 12 DCMA checks" comment in index.html already states),
# so there is no raw-claims reconstruction to run here. What this DOES prove: the SQL model's
# arithmetic matches a hand-written, independent Python implementation of the identically-stated
# formula (weights 50/35/15, saturation bounds 0.20/$10M/15d) — a formula-equivalence check, not
# a data-reconstruction check. Not a substitute for section 4's proof; a different, real one.
def py_pkg_risk_exposure(pkg_id):
    # Mirrors index.html's corrected pkgRiskExposure(): a risk counts toward pkg_id's exposure
    # only if it has a REAL linked action (src contains the risk id) whose OWN pkg field matches
    # -- not a static field on the risk itself. `any(...)` matches JS's `.some(...)` semantics.
    total = 0.0
    for r in RISKS_PY:
        linked = [a for a in STG_ACTIONS if r["id"] in a["src"]]
        if any(a["pkg"] == pkg_id for a in linked):
            total += P_BAND[r["p"]] * r["cost"]
    return total

def py_schedule_risk_raw(pkg_id, float_days, cp_rem):
    cpli = (cp_rem + float_days) / cp_rem if cp_rem > 0 else 1.0
    erosion = max(0.0, 1.0 - cpli)
    risk_exp = py_pkg_risk_exposure(pkg_id)
    co_overrun = max(0, CO_CYCLE_DAYS - CO_CYCLE_TARGET)
    raw = 50 * min(1, erosion / 0.20) + 35 * min(1, risk_exp / 10) + 15 * min(1, co_overrun / 15)
    return min(100, max(0, raw))

for p in PKGS:
    py_raw = py_schedule_risk_raw(p["id"], p["float"], p["cpRem"])
    sql_raw = sched_by_id[p["id"]]["schedule_risk_score_raw"]
    # Real arithmetic equivalence — compared BEFORE rounding, since DuckDB's round() and Python's
    # round() break an exact .x5 tie with different, equally valid rules (CP-701's raw score DID
    # land exactly on one, at 31.45, under the original hand-authored pkg mapping; the same-day
    # riskLinkedActions() correction changed its real risk term to 0, so it's now an exact 15.0,
    # no tie -- kept as defensive general practice regardless, not because today's data needs it).
    # Widening the post-round tolerance would have masked that instead of explaining it.
    check(f"{p['id']} schedule_risk_score_raw: SQL == independent Python", abs(sql_raw - py_raw) < 1e-9,
          f"sql={sql_raw} py={py_raw}")
    # The rounded, on-screen value must still land within 0.05 of the raw score in BOTH
    # implementations — proves round() didn't silently do something else entirely, without
    # demanding the two languages break the same half-way tie the same direction.
    sql_rounded = sched_by_id[p["id"]]["schedule_risk_score"]
    py_rounded = round(py_raw, 1)
    # 0.05 + 1e-9: an exact .x5 tie sits precisely at the 0.05 boundary, and a value like 31.45
    # (CP-701's raw score under the pre-correction hand-authored pkg mapping; superseded by the
    # same-day riskLinkedActions() fix) has no exact binary float representation, so a strict
    # <= 0.05 can spuriously fail on float noise around 5e-16 -- same class of epsilon this file
    # already applies at 1e-6/1e-9 elsewhere, not a loosened tolerance masking a real gap.
    check(f"{p['id']} schedule_risk_score (SQL, rounded) within 0.05 of raw",
          abs(sql_rounded - sql_raw) <= 0.05 + 1e-9, f"rounded={sql_rounded} raw={sql_raw}")
    check(f"{p['id']} schedule_risk_score (Python, rounded) within 0.05 of raw",
          abs(py_rounded - py_raw) <= 0.05 + 1e-9, f"rounded={py_rounded} raw={py_raw}")

# --- 5. Guardrail checks in SQL (the same invariants schema.yml declares) --
# Materialize the model so the guardrails test the artifact, not the query.
# Every test schema.yml declares gets a real check here — a /stress-test pass (2026-08-21) found
# only 4 of schema.yml's declared tests were actually implemented (and one of those 4 had a
# mislabeled check() string, "ev <= pv" printed for what was actually an ev<=bac test — fixed
# below too), silently understating what README/HANDOFF's "enforces the guardrails in
# models/schema.yml" claim promised. All 29 checks below map 1:1 to a schema.yml test declaration.
# (/stress-test finding, 2026-08-22: this comment itself still said "10" after later rounds grew
# the real count to 14 — the exact class of drift this comment already exists to warn against.
# 2026-08-26: grew to 15 with the claim_month temporal-fence check below.
# 2026-09-02: grew to 21 with the 6 fct_schedule_risk/stg_risk_register guardrails below (schema.yml's
# schedule-risk block), then to 23 with 2 stg_actions guardrails added the same day when a
# /stress-test finding forced the risk-to-package link to route through a real stg_actions join
# instead of a hand-authored column. 2026-09-03: grew to 29 with the 6 stg_claimed_progress/
# fct_progress_verify guardrails below (progress-verification feature) -- update this count again
# the next time a check is added, or this becomes the same stale-number bug it warns against.)
con.execute("create table fct_control_account as " + MODEL.read_text())

# fct_control_account model-level invariants (schema.yml's 3 dbt_utils.expression_is_true tests)
bad1 = con.execute("select count(*) from fct_control_account where ev > bac + 0.000001").fetchone()[0]
bad2 = con.execute("select count(*) from fct_control_account where pct_complete > 1").fetchone()[0]
bad3 = con.execute("select count(*) from fct_control_account where spi not between 0.5 and 1.5").fetchone()[0]
check("guardrail: ev <= bac everywhere", bad1 == 0, f"{bad1} violations")
check("guardrail: pct_complete <= 1 everywhere", bad2 == 0, f"{bad2} violations")
check("guardrail: spi within [0.5, 1.5]", bad3 == 0, f"{bad3} violations")

# fct_control_account.package_id: [unique, not_null]; fct_control_account.bac: [not_null, >=1]
dup       = con.execute("select count(*) - count(distinct package_id) from fct_control_account").fetchone()[0]
pkg_null  = con.execute("select count(*) from fct_control_account where package_id is null").fetchone()[0]
bac_null  = con.execute("select count(*) from fct_control_account where bac is null").fetchone()[0]
bac_low   = con.execute("select count(*) from fct_control_account where bac < 1").fetchone()[0]
check("guardrail: package_id unique", dup == 0, f"{dup} duplicates")
check("guardrail: package_id not null (fct_control_account)", pkg_null == 0, f"{pkg_null} nulls")
check("guardrail: bac not null", bac_null == 0, f"{bac_null} nulls")
check("guardrail: bac >= 1 everywhere", bac_low == 0, f"{bac_low} violations")

# stg_progress_claims.claim_id: [unique, not_null]; .package_id: [not_null, relationships to
# dim_control_account]; .pv_delta/.ev_delta/.ac_delta: each >= 0
claim_dup   = con.execute("select count(*) - count(distinct claim_id) from stg_progress_claims").fetchone()[0]
claim_null  = con.execute("select count(*) from stg_progress_claims where claim_id is null").fetchone()[0]
claimpkg_null = con.execute("select count(*) from stg_progress_claims where package_id is null").fetchone()[0]
orphan      = con.execute("""select count(*) from stg_progress_claims s
                              left join dim_control_account d on s.package_id = d.package_id
                              where d.package_id is null""").fetchone()[0]
pv_neg      = con.execute("select count(*) from stg_progress_claims where pv_delta < 0").fetchone()[0]
ev_neg      = con.execute("select count(*) from stg_progress_claims where ev_delta < 0").fetchone()[0]
ac_neg      = con.execute("select count(*) from stg_progress_claims where ac_delta < 0").fetchone()[0]
# Temporal fence (brainstorm-mode round, 2026-08-26, harvested from a pasted external blueprint
# after fact-checking it) -- the model's own WHERE clause already EXCLUDES a future-dated claim
# from the ledger silently; this is the separate, explicit guardrail that treats one existing at
# all as a reportable violation, same as every other check in this section. claim_month is the
# real per-claim date field this dashboard's client-side PKGS[] array doesn't carry (aggregated,
# no per-claim dates) -- this is the one place in the whole repo that field genuinely exists, so
# this is the one place the check can be real rather than invented.
future_dated = con.execute(f"select count(*) from stg_progress_claims where claim_month > DATE '{DATA_DATE}'").fetchone()[0]
check("guardrail: claim_id unique", claim_dup == 0, f"{claim_dup} duplicates")
check("guardrail: claim_id not null", claim_null == 0, f"{claim_null} nulls")
check("guardrail: package_id not null (stg_progress_claims)", claimpkg_null == 0, f"{claimpkg_null} nulls")
check("guardrail: package_id relationships to dim_control_account", orphan == 0, f"{orphan} orphaned rows")
check("guardrail: pv_delta >= 0 everywhere", pv_neg == 0, f"{pv_neg} negative rows")
check("guardrail: ev_delta >= 0 everywhere", ev_neg == 0, f"{ev_neg} negative rows")
check("guardrail: ac_delta >= 0 everywhere", ac_neg == 0, f"{ac_neg} negative rows")
check("guardrail: claim_month <= data date everywhere (no future-dated claims)", future_dated == 0, f"{future_dated} claims after {DATA_DATE}")

# fct_schedule_risk + stg_risk_register guardrails (schema.yml's schedule-risk block, 2026-09-02)
con.execute("create table fct_schedule_risk as select * from " + f"({SCHED_MODEL.read_text()})")
score_bad = con.execute("select count(*) from fct_schedule_risk where schedule_risk_score not between 0 and 100").fetchone()[0]
sr_dup    = con.execute("select count(*) - count(distinct package_id) from fct_schedule_risk").fetchone()[0]
sr_null   = con.execute("select count(*) from fct_schedule_risk where package_id is null").fetchone()[0]
risk_dup  = con.execute("select count(*) - count(distinct id) from stg_risk_register").fetchone()[0]
risk_p_bad = con.execute("select count(*) from stg_risk_register where p not between 1 and 5").fetchone()[0]
risk_cost_neg = con.execute("select count(*) from stg_risk_register where cost < 0").fetchone()[0]
check("guardrail: schedule_risk_score within [0, 100]", score_bad == 0, f"{score_bad} violations")
check("guardrail: fct_schedule_risk.package_id unique", sr_dup == 0, f"{sr_dup} duplicates")
check("guardrail: fct_schedule_risk.package_id not null", sr_null == 0, f"{sr_null} nulls")
check("guardrail: stg_risk_register.id unique", risk_dup == 0, f"{risk_dup} duplicates")
check("guardrail: stg_risk_register.p within [1, 5]", risk_p_bad == 0, f"{risk_p_bad} violations")
check("guardrail: stg_risk_register.cost >= 0 everywhere", risk_cost_neg == 0, f"{risk_cost_neg} negative rows")
act_dup = con.execute("select count(*) - count(distinct id) from stg_actions").fetchone()[0]
act_null = con.execute("select count(*) from stg_actions where id is null").fetchone()[0]
check("guardrail: stg_actions.id unique", act_dup == 0, f"{act_dup} duplicates")
check("guardrail: stg_actions.id not null", act_null == 0, f"{act_null} nulls")

# fct_progress_verify + stg_claimed_progress (progress verification, 2026-09-03) -- claimed_pct
# is a genuinely separate source from the earned-value ledger (fct_control_account, already
# materialized above), same "two independent numbers, one join" shape as everything else in this
# section. fct_progress_verify.sql is a real mart-on-mart reference (joins the already-materialized
# fct_control_account table), not an inline re-derivation.
con.execute("create table stg_claimed_progress(package_id varchar primary key, claimed_pct double)")
con.executemany("insert into stg_claimed_progress values (?,?)", list(CLAIMED_PROGRESS.items()))
con.execute("create table fct_progress_verify as " + PROGRESS_MODEL.read_text())
pv_rows = con.execute("select * from fct_progress_verify").fetchall()
pv_cols = [d[0] for d in con.description]
pv_by_id = {r[0]: dict(zip(pv_cols, r)) for r in pv_rows}
check("fct_progress_verify returned 8 rows", len(pv_rows) == 8, f"got {len(pv_rows)}")

# Parity: SQL's progress_gap == claimed_pct minus the SAME verified pct fct_control_account already
# proved correct in section 4 above (by_id[...]["pct_complete"]) -- an independent Python
# recomputation, not a second read of the same SQL result.
for pkg_id, claimed in CLAIMED_PROGRESS.items():
    verified = by_id[pkg_id]["pct_complete"]
    py_gap = claimed - verified
    sql_gap = pv_by_id[pkg_id]["progress_gap"]
    check(f"{pkg_id} progress_gap: SQL == independent Python", abs(sql_gap - py_gap) < 1e-9,
          f"sql={sql_gap:.4f} py={py_gap:.4f}")

# Threshold check mirrors index.html's own GUARDS entry exactly (same CLAIMED_PROGRESS_FLAG_PCT,
# parsed above, not hand-retyped) -- proves the two independently-run stacks agree on WHICH
# package(s) breach it, not just that the raw numbers match.
flagged = [pid for pid, r in pv_by_id.items() if r["progress_gap"] > CLAIMED_PROGRESS_FLAG_PCT]
check(f"exactly 1 package exceeds the {CLAIMED_PROGRESS_FLAG_PCT:.0%} claimed-vs-verified threshold, matching index.html's GUARDS check",
      len(flagged) == 1 and flagged[0] == "CP-501", f"flagged={flagged}")

# fct_progress_verify / stg_claimed_progress guardrails (schema.yml's progress-verification block)
claimed_dup   = con.execute("select count(*) - count(distinct package_id) from stg_claimed_progress").fetchone()[0]
claimed_null  = con.execute("select count(*) from stg_claimed_progress where package_id is null").fetchone()[0]
claimed_orphan = con.execute("""select count(*) from stg_claimed_progress s
                                 left join dim_control_account d on s.package_id = d.package_id
                                 where d.package_id is null""").fetchone()[0]
claimed_bad   = con.execute("select count(*) from stg_claimed_progress where claimed_pct not between 0 and 1").fetchone()[0]
pv_dup        = con.execute("select count(*) - count(distinct package_id) from fct_progress_verify").fetchone()[0]
pv_null       = con.execute("select count(*) from fct_progress_verify where package_id is null").fetchone()[0]
check("guardrail: stg_claimed_progress.package_id unique", claimed_dup == 0, f"{claimed_dup} duplicates")
check("guardrail: stg_claimed_progress.package_id not null", claimed_null == 0, f"{claimed_null} nulls")
check("guardrail: stg_claimed_progress.package_id relationships to dim_control_account", claimed_orphan == 0, f"{claimed_orphan} orphaned rows")
check("guardrail: stg_claimed_progress.claimed_pct within [0, 1]", claimed_bad == 0, f"{claimed_bad} violations")
check("guardrail: fct_progress_verify.package_id unique", pv_dup == 0, f"{pv_dup} duplicates")
check("guardrail: fct_progress_verify.package_id not null", pv_null == 0, f"{pv_null} nulls")

# --- 6. Emit the proof artifact --------------------------------------------
# checks{} added (/stress-test finding, 2026-08-27): index.html's own "65 parity checks" claim
# (the GAO-credibility-checklist card, the architecture-diagram card) previously had no live
# source to verify against inside stress.cjs -- only a hardcoded literal compared to another
# hardcoded literal, a documented accepted limitation. This makes the real count a structured,
# machine-readable field on the proof artifact stress.cjs can read after actually running this
# script, closing that gap whenever a Python+DuckDB environment is available.
out = {
    "data_date": DATA_DATE,
    "packages": by_id,
    "portfolio": {
        "bac": round(sum(p["bac"] for p in PKGS), 2),
        "pv":  round(sum(by_id[p["id"]]["pv"] for p in PKGS), 2),
        "ev":  round(sum(by_id[p["id"]]["ev"] for p in PKGS), 2),
        "ac":  round(sum(by_id[p["id"]]["ac"] for p in PKGS), 2),
    },
    "schedule_risk": sched_by_id,
    "progress_verify": pv_by_id,
    "checks": {
        "total": total_checks,
        "passed": total_checks - len(failures),
        "failed": len(failures),
    },
}
(ROOT / "pipeline" / "output").mkdir(exist_ok=True)
(ROOT / "pipeline" / "output" / "ledger.json").write_text(json.dumps(out, indent=2))
print(f"\nportfolio: {out['portfolio']}")
print("artifact: pipeline/output/ledger.json")
print(f"\n{'ALL CHECKS PASSED' if not failures else f'{len(failures)} CHECKS FAILED'}")
sys.exit(1 if failures else 0)
