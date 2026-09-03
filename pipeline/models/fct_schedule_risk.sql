-- fct_schedule_risk.sql — composite schedule leading-indicator score per control account.
-- DuckDB dialect; written dbt-style, same as fct_control_account.sql.
--
-- Blends three real, already-existing signals into one ranked score instead of adding a fourth,
-- trained-model claim this pipeline can't defend:
--   (1) CPLI erosion — reuses the same (cp_remaining_days + float_days) / cp_remaining_days ratio
--       fct_control_account's sibling dashboard logic already computes, not a new formula.
--   (2) Package-scoped risk exposure — probability-weighted (same P_BAND convention the dashboard
--       uses for its portfolio-level risk exposure), summed only over risks a REAL linked action
--       (stg_actions, sourced from ACTIONS[]'s own real pkg field) resolves to this package.
--       CORRECTED (/stress-test finding, same day): the first version carried a hand-authored
--       `pkg` column directly on stg_risk_register — index.html's own riskLinkedActions() comment
--       states plainly "no hand-authored R-id -> package map", and the hand-typed version was
--       factually wrong against that real derivation for 3 of 4 risks. This joins through the
--       real action-to-package link instead, same as index.html's pkgRiskExposure() now does.
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
risk_pkg as (
  -- distinct (risk, pkg) pair before summing: mirrors index.html's riskLinkedActions(k).some(...)
  -- semantics exactly -- a risk with two linked actions pointing at the SAME package must still
  -- count once, not twice, even though none of today's real risks actually have more than one.
  select distinct rr.id, rr.p, rr.cost, a.pkg
  from stg_risk_register rr
  join stg_actions a on a.src like '%' || rr.id || '%'
  where a.pkg is not null
),
risk_rollup as (
  -- p_weight is inlined here (self-contained, same as fct_control_account.sql's own math) rather
  -- than stored on stg_risk_register — it's a lookup, not a fact about the risk. Must match
  -- index.html's P_BAND object verbatim: {1:0.10, 2:0.30, 3:0.50, 4:0.70, 5:0.90}.
  select pkg as package_id,
    sum((case p when 1 then 0.10 when 2 then 0.30 when 3 then 0.50
                 when 4 then 0.70 when 5 then 0.90 end) * cost) as risk_exposure_score
  from risk_pkg
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
  -- Raw (unrounded) score kept alongside the rounded one on purpose: a raw value landing exactly
  -- on a .x5 boundary rounds differently under DuckDB's round-half-away-from-zero than Python's
  -- round-half-to-even -- neither is wrong, they're just different tie-breaking rules. (CP-701's
  -- raw score DID land exactly there, at 31.45, under the original hand-authored pkg mapping;
  -- the same-day riskLinkedActions() correction below changed CP-701's real risk-exposure term to
  -- 0, so its raw score is now an exact 15.0, no tie -- the defensive raw-vs-raw comparison and
  -- the epsilon below stay correct general practice regardless, so they're kept, not removed.)
  -- The parity proof compares raw-to-raw (real arithmetic equivalence); only the final display
  -- step ever calls a language's own round().
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
