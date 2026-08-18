-- fct_control_account.sql — the model that builds the control-account ledger
-- from raw monthly progress claims. DuckDB dialect; written dbt-style so the
-- same file drops into a dbt project (swap the plain table refs for ref()).
--
-- Determinism contract: same source rows in -> same ledger out, always.
-- No window over run order, no clock-dependent filters, no sampling.

with monthly as (
  select
    package_id,
    sum(pv_delta) as pv,
    sum(ev_delta) as ev,
    sum(ac_delta) as ac
  from stg_progress_claims
  where claim_month <= date '2026-07-31'          -- data date, explicit
  group by package_id
)

select
  m.package_id,
  b.package_name,
  b.bac,
  m.pv,
  m.ev,
  m.ac,
  m.ev - m.pv                              as sv,
  m.ev - m.ac                              as cv,
  m.ev / nullif(m.pv, 0)                   as spi,
  m.ev / nullif(m.ac, 0)                   as cpi,
  b.bac / (m.ev / nullif(m.ac, 0))         as eac,      -- at current efficiency
  b.bac - b.bac / (m.ev / nullif(m.ac, 0)) as vac,
  m.ev / b.bac                             as pct_complete
from monthly m
join dim_control_account b using (package_id)
order by m.package_id
