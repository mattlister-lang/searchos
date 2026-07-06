-- 0012_dashboard_link_ids.sql
-- R7 (the workflow spine), the SQL half. The dashboard is the morning routine
-- and every row on it must be one click from acting (docs/ux.md Journey E,
-- E-002). Two attention views return names but no ids, so the dashboard renders
-- them as dead strings — a "bare string where a link belongs" defect
-- (engineering.md §4). This is the 0007 lesson applied again: views expose the
-- ids the UI links on. A pure link-id RETROFIT — the existing row logic and
-- filters are preserved verbatim; only nullable id columns are appended.
--
--   v_next_actions (0004) — the morning to-do. Its three UNION branches named a
--     deal, a candidacy (person + mandate + company) and a going-stale person
--     as free text with no ids (E-002, the single most important dead end).
--     Gains target_type + the ids each row renders.
--   v_upcoming_interviews (0006) — carried candidate/mandate/client NAMES only;
--     the dashboard's upcoming-interviews rows were plain text too (ux.md
--     Journey E delta: "Link upcoming-interview rows (person/job)"). Same
--     surface, same defect class; gains the four ids while the migration is open
--     so phase 2 renders links, not a fresh IA defect (see the ship note).
--
-- v_activity_pulse (0004) already carries company_id — pulse linking is pure UI,
-- NO SQL. No new tables, columns, functions or enums: nothing here touches the
-- audit/erase/merge surface (views are read-only projections over tables whose
-- person ids are already governed). erased people stay filtered exactly as
-- before (v_next_actions branch 3 keeps `p.erased_at is null`; the candidacy
-- branch cannot surface an erased person — a redacted person's non-placed
-- candidacies are deleted and 'placed' is filtered out). Both views keep
-- security_invoker (ADR-020), re-declared because a bare CREATE OR REPLACE would
-- otherwise be an owner-rights view.
--
-- CREATE OR REPLACE (not DROP+CREATE): the change is append-compatible — the
-- original output columns keep their name, type and order and the new id columns
-- are added at the END, which is the only shape CREATE OR REPLACE VIEW allows.
-- No downstream view depends on either, but append-compatible is the minimal,
-- 0007-shaped change regardless.

-- ---------------------------------------------------------------------------
-- v_next_actions — link ids. target_type names the row's primary entity; the
-- per-branch id columns are the ids the row's rendered text references (so
-- every named reference links, engineering.md §4). Columns null where the
-- branch does not name that entity. Row logic UNCHANGED from 0004.
-- ---------------------------------------------------------------------------

create or replace view v_next_actions with (security_invoker = on) as
select
  'deal_missing_next_step' as reason,
  d.name                   as item,
  co.name                  as context,
  d.updated_at             as since,
  'deal'                   as target_type,
  null::uuid               as person_id,
  co.id                    as company_id,
  null::uuid               as mandate_id,
  null::uuid               as candidacy_id,
  d.id                     as deal_id
from deal d
join company co on co.id = d.company_id
where d.next_step is null
  and d.stage not in ('won', 'lost')
union all
select
  'candidacy_stalled',
  p.full_name || ' — ' || m.title,
  co.name,
  c.stage_changed_at,
  'candidacy',
  p.id,
  co.id,
  m.id,
  c.id,
  null::uuid
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
  f.last_activity_at,
  'person',
  p.id,
  null::uuid,
  null::uuid,
  null::uuid,
  null::uuid
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

comment on view v_next_actions is
  'The morning to-do (docs/ux.md Journey E). Each row carries target_type '
  '(deal | candidacy | person) + the ids it renders (deal_id/company_id/'
  'mandate_id/candidacy_id/person_id, nullable per branch) so the dashboard '
  'links every row (E-002; the 0007 link-id lesson). Row logic unchanged from '
  '0004; erased people stay filtered.';

-- ---------------------------------------------------------------------------
-- v_upcoming_interviews — link ids. Appends person/mandate/candidacy/company
-- ids so the dashboard's upcoming-interviews rows link (ux.md Journey E delta).
-- Filters and existing columns UNCHANGED from 0006.
-- ---------------------------------------------------------------------------

create or replace view v_upcoming_interviews with (security_invoker = on) as
select
  i.id          as interview_id,
  i.round,
  i.kind,
  i.scheduled_at,
  i.consultant,
  p.full_name   as candidate,
  m.title       as mandate,
  co.name       as client,
  p.id          as person_id,
  m.id          as mandate_id,
  c.id          as candidacy_id,
  co.id         as company_id
from interview i
join candidacy c on c.id = i.candidacy_id
join person p on p.id = c.person_id
join mandate m on m.id = c.mandate_id
join company co on co.id = m.company_id
where i.outcome = 'scheduled'
  and i.scheduled_at >= now() - interval '1 day'
order by i.scheduled_at;

comment on view v_upcoming_interviews is
  'Scheduled interviews from now on (0006), now carrying person/mandate/'
  'candidacy/company ids so the dashboard rows link (ux.md Journey E; the 0007 '
  'link-id lesson). Filters and name columns unchanged from 0006.';
