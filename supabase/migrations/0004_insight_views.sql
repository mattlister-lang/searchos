-- 0004_insight_views.sql
-- The SQL insight layer (ADR-018): reporting and attention-management views
-- that need no AI spend. All views run with caller permissions (ADR-020).

-- Candidacy counts per stage per open mandate — the funnel report.
create view v_funnel with (security_invoker = on) as
select
  m.id      as mandate_id,
  m.title   as mandate,
  co.name   as client,
  c.stage,
  count(*)  as candidates
from mandate m
join company co on co.id = m.company_id
join candidacy c on c.mandate_id = m.id
where m.status = 'open'
group by m.id, m.title, co.name, c.stage;

-- Days each live candidacy has sat in its current stage, stale ones flagged.
-- (True historical time-in-stage becomes derivable from audit_log, 0005.)
create view v_stage_dwell with (security_invoker = on) as
select
  c.id       as candidacy_id,
  p.full_name,
  m.title    as mandate,
  c.stage,
  extract(day from now() - c.stage_changed_at)::int as days_in_stage,
  extract(day from now() - c.stage_changed_at) > 14 as stale
from candidacy c
join person p on p.id = c.person_id
join mandate m on m.id = c.mandate_id
where m.status = 'open'
  and c.stage not in ('placed', 'rejected', 'withdrawn');

-- The morning to-do, computed: things that need a decision or a nudge.
create view v_next_actions with (security_invoker = on) as
select
  'deal_missing_next_step' as reason,
  d.name                   as item,
  co.name                  as context,
  d.updated_at             as since
from deal d
join company co on co.id = d.company_id
where d.next_step is null
  and d.stage not in ('won', 'lost')
union all
select
  'candidacy_stalled',
  p.full_name || ' — ' || m.title,
  co.name,
  c.stage_changed_at
from candidacy c
join person p on p.id = c.person_id
join mandate m on m.id = c.mandate_id
join company co on co.id = m.company_id
where m.status = 'open'
  and c.stage not in ('placed', 'rejected', 'withdrawn')
  and c.stage_changed_at < now() - interval '14 days'
union all
select
  'relationship_going_stale',
  p.full_name,
  null,
  f.last_activity_at
from v_relationship_freshness f
join person p on p.id = f.person_id
where p.erased_at is null
  and coalesce(f.last_activity_at, p.created_at) < now() - interval '90 days'
  and (exists (select 1 from candidacy c
               join mandate m on m.id = c.mandate_id
               where c.person_id = p.id and m.status = 'open'
                 and c.stage not in ('placed', 'rejected', 'withdrawn'))
       or exists (select 1 from deal d
                  where d.primary_contact_id = p.id
                    and d.stage not in ('won', 'lost')));

-- Contact volume per company, last 30 days vs the 30 before — cooling deals
-- become visible before they are cold.
create view v_activity_pulse with (security_invoker = on) as
select
  co.id   as company_id,
  co.name as company,
  count(*) filter (where a.occurred_at >= now() - interval '30 days') as last_30d,
  count(*) filter (where a.occurred_at >= now() - interval '60 days'
                     and a.occurred_at <  now() - interval '30 days') as prior_30d
from company co
left join activity a
  on a.company_id = co.id
  or a.deal_id in (select id from deal where company_id = co.id)
  or a.mandate_id in (select id from mandate where company_id = co.id)
group by co.id, co.name;

-- Placement fee income by month (statutory lineage doing double duty).
create view v_fee_income with (security_invoker = on) as
select
  date_trunc('month', c.placed_at)::date as month,
  count(*)          as placements,
  sum(c.fee_amount) as fees
from candidacy c
where c.placed_at is not null
group by 1
order by 1 desc;
