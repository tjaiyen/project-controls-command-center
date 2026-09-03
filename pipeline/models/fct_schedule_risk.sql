-- fct_schedule_risk.sql — composite schedule leading-indicator score per control account.
-- DuckDB dialect; written dbt-style, same as fct_control_account.sql.
--
-- Blends three real, already-existing signals into one ranked score instead of adding a fourth,
-- trained-model claim this pipeline can't defend:
--   (1) CPLI erosion — reuses the same (cp_remaining_days + float_days) / cp_remaining_days ratio
--       fct_control_account's sibling dashboard logic already computes, not a new formula.
--   (2) Package-scoped risk exposure — probability-weighted (same P_BAND convention the dashboard
--       uses for its portfolio-level risk exposure), summed only over risks carrying this pkg.
--   (3) Change-order cycle overrun — real, but program-wide, so it lands identically on every
--       package; a stated design choice, not an oversight (see index.html's card caption).
--
-- Weights (50/35/15) and saturation bounds (erosion 0.20, exposure $10M, overrun 15 days) are
-- STATED, illustrative choices — not calibrated against real outcome data. Same honesty standard
-- MATERIAL_ESCALATION_BASELINE_PCT already sets in index.html.
--
-- Determinism contract: same source rows in -> same score out, always.

with cpli as (
  select
    package_id,
    float_days,
    cp_remaining_days,
    case when cp_remaining_days > 0
      then (cp_remaining_days + float_days) / cp_remaining_days
      else 1.0
    end as cpli
  from dim_control_account
),
risk_rollup as (
  -- p_weight is inlined here (self-contained, same as fct_control_account.sql's own math) rather
  -- than stored on stg_risk_register — it's a lookup, not a fact about the risk. Must match
  -- index.html's P_BAND object verbatim: {1:0.10, 2:0.30, 3:0.50, 4:0.70, 5:0.90}.
  select pkg as package_id,
    sum((case p when 1 then 0.10 when 2 then 0.30 when 3 then 0.50
                 when 4 then 0.70 when 5 then 0.90 end) * cost) as risk_exposure_score
  from stg_risk_register
  where pkg is not null
  group by pkg
),
program as (
  select greatest(0, co_cycle_days - co_cycle_target_days) as co_cycle_overrun_days
  from dim_program
)

select
  c.package_id,
  c.cpli,
  greatest(0, 1.0 - c.cpli)                          as cpli_erosion,
  coalesce(r.risk_exposure_score, 0)                  as risk_exposure_score,
  p.co_cycle_overrun_days,
  -- Raw (unrounded) score kept alongside the rounded one on purpose: a raw value that lands
  -- exactly on a .x5 boundary (CP-701 does, at 31.45) rounds differently under DuckDB's
  -- round-half-away-from-zero than Python's round-half-to-even -- neither is wrong, they're
  -- just different tie-breaking rules. The parity proof compares raw-to-raw (real arithmetic
  -- equivalence); only the final display step ever calls a language's own round().
  least(100, greatest(0,
    50 * least(1, greatest(0, 1.0 - c.cpli) / 0.20) +
    35 * least(1, coalesce(r.risk_exposure_score, 0) / 10) +
    15 * least(1, p.co_cycle_overrun_days / 15)
  )) as schedule_risk_score_raw,
  round(least(100, greatest(0,
    50 * least(1, greatest(0, 1.0 - c.cpli) / 0.20) +
    35 * least(1, coalesce(r.risk_exposure_score, 0) / 10) +
    15 * least(1, p.co_cycle_overrun_days / 15)
  )), 1) as schedule_risk_score
from cpli c
left join risk_rollup r using (package_id)
cross join program p
order by schedule_risk_score desc
