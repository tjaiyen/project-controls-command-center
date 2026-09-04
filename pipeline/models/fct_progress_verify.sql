-- fct_progress_verify.sql — GC-claimed vs. ledger-verified progress, per control account.
-- DuckDB dialect; written dbt-style, downstream of fct_control_account (a real mart-on-mart
-- reference, not an inline re-derivation).
--
-- claimed_pct comes from stg_claimed_progress -- a genuinely separate source from the earned-
-- value ledger fct_control_account already builds. In reality this is the GC's own
-- pay-application (Schedule of Values) submission, not derived from owner-side quantities at all
-- -- the whole point of this model is that the two sources can disagree. progress_gap is claimed
-- minus verified (fct_control_account.pct_complete): positive means the GC's own claim runs ahead
-- of what the ledger can independently support. Method: Cost Value Reconciliation (CVR) plus
-- independent physical-progress verification.
--
-- Determinism contract: same source rows in -> same gap out, always.

select
  c.package_id,
  c.pct_complete                    as verified_pct,
  s.claimed_pct,
  s.claimed_pct - c.pct_complete    as progress_gap
from fct_control_account c
join stg_claimed_progress s using (package_id)
order by c.package_id
