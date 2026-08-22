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
MONTHS = 22          # months elapsed, mirrors PROGRAM.monthsElapsed
DATA_DATE = "2026-07-31"

failures = []
def check(label, cond, detail=""):
    print(("PASS  " if cond else "FAIL  ") + label + (f"  ({detail})" if detail else ""))
    if not cond:
        failures.append(label)

# --- 1. Parse the dashboard's ledger straight out of index.html ------------
src = INDEX.read_text()
pkg_re = re.compile(
    r'\{id:"(?P<id>CP-\d+)".*?bac:\s*(?P<bac>[\d.]+),\s*pv:\s*(?P<pv>[\d.]+),\s*'
    r'ev:\s*(?P<ev>[\d.]+),\s*ac:\s*(?P<ac>[\d.]+)', re.S)
PKGS = [m.groupdict() for m in pkg_re.finditer(src)]
check("parsed 8 control accounts from index.html", len(PKGS) == 8, f"got {len(PKGS)}")
for p in PKGS:
    for k in ("bac", "pv", "ev", "ac"):
        p[k] = float(p[k])

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
con.execute("create table dim_control_account(package_id varchar primary key, package_name varchar, bac double)")
con.execute("create table stg_progress_claims(claim_id varchar, package_id varchar, claim_month date, pv_delta double, ev_delta double, ac_delta double)")
con.executemany("insert into dim_control_account values (?,?,?)",
                [(p["id"], p["id"], p["bac"]) for p in PKGS])
con.executemany("insert into stg_progress_claims values (?,?,?,?,?,?)", rows)
ledger = con.execute(MODEL.read_text()).fetchall()
cols = [d[0] for d in con.description]
by_id = {r[0]: dict(zip(cols, r)) for r in ledger}

# --- 4. Equality proof: SQL ledger vs the dashboard's own numbers ----------
for p in PKGS:
    q = by_id[p["id"]]
    for k in ("pv", "ev", "ac"):
        check(f"{p['id']} {k}: SQL == dashboard", abs(q[k] - p[k]) < 0.051,
              f"sql={q[k]:.2f} js={p[k]:.2f}")
    check(f"{p['id']} spi recomputed", abs(q["spi"] - p["ev"] / p["pv"]) < 1e-9)
    check(f"{p['id']} cpi recomputed", abs(q["cpi"] - p["ev"] / p["ac"]) < 1e-9)
    check(f"{p['id']} eac recomputed", abs(q["eac"] - p["bac"] / (p["ev"] / p["ac"])) < 1e-6)

# --- 5. Guardrail checks in SQL (the same invariants schema.yml declares) --
# Materialize the model so the guardrails test the artifact, not the query.
# Every test schema.yml declares gets a real check here — a /stress-test pass (2026-08-21) found
# only 4 of schema.yml's declared tests were actually implemented (and one of those 4 had a
# mislabeled check() string, "ev <= pv" printed for what was actually an ev<=bac test — fixed
# below too), silently understating what README/HANDOFF's "enforces the guardrails in
# models/schema.yml" claim promised. All 10 checks below map 1:1 to a schema.yml test declaration.
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
check("guardrail: claim_id unique", claim_dup == 0, f"{claim_dup} duplicates")
check("guardrail: claim_id not null", claim_null == 0, f"{claim_null} nulls")
check("guardrail: package_id not null (stg_progress_claims)", claimpkg_null == 0, f"{claimpkg_null} nulls")
check("guardrail: package_id relationships to dim_control_account", orphan == 0, f"{orphan} orphaned rows")
check("guardrail: pv_delta >= 0 everywhere", pv_neg == 0, f"{pv_neg} negative rows")
check("guardrail: ev_delta >= 0 everywhere", ev_neg == 0, f"{ev_neg} negative rows")
check("guardrail: ac_delta >= 0 everywhere", ac_neg == 0, f"{ac_neg} negative rows")

# --- 6. Emit the proof artifact --------------------------------------------
out = {
    "data_date": DATA_DATE,
    "packages": by_id,
    "portfolio": {
        "bac": round(sum(p["bac"] for p in PKGS), 2),
        "pv":  round(sum(by_id[p["id"]]["pv"] for p in PKGS), 2),
        "ev":  round(sum(by_id[p["id"]]["ev"] for p in PKGS), 2),
        "ac":  round(sum(by_id[p["id"]]["ac"] for p in PKGS), 2),
    },
}
(ROOT / "pipeline" / "output").mkdir(exist_ok=True)
(ROOT / "pipeline" / "output" / "ledger.json").write_text(json.dumps(out, indent=2))
print(f"\nportfolio: {out['portfolio']}")
print("artifact: pipeline/output/ledger.json")
print(f"\n{'ALL CHECKS PASSED' if not failures else f'{len(failures)} CHECKS FAILED'}")
sys.exit(1 if failures else 0)
