-- 0006_recruitment_core.sql
-- Phase B of the product brief: variable client-interview rounds, the
-- placed → boarded → invoiced → paid money flow, approach outcomes,
-- BD activity types, matching taxonomy, deal↔mandate linking, and
-- consultant attribution ready for multi-seat.

-- ---------------------------------------------------------------------------
-- Interviews: a mandate's client process runs 2-6+ rounds; each is a record,
-- not an enum value. "Interviews arranged per consultant" falls out for free.
-- ---------------------------------------------------------------------------

create type interview_kind as enum
  ('consultant', 'phone', 'video', 'in_person', 'panel', 'final');

create type interview_outcome as enum
  ('scheduled', 'passed', 'failed', 'cancelled', 'no_show');

create table interview (
  id            uuid primary key default gen_random_uuid(),
  candidacy_id  uuid not null references candidacy(id) on delete cascade,
  round         integer not null default 1,
  kind          interview_kind not null default 'video',
  scheduled_at  timestamptz,
  location      text,
  notes         text,
  feedback      text,
  outcome       interview_outcome not null default 'scheduled',
  consultant    text not null default 'matt',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index interview_candidacy_idx on interview (candidacy_id);
create index interview_scheduled_idx on interview (scheduled_at);
alter table interview enable row level security;

create trigger interview_updated_at before update on interview
  for each row execute function set_updated_at();
create trigger interview_audit after insert or update or delete on interview
  for each row execute function audit_row_change();

-- ---------------------------------------------------------------------------
-- Money: offer accepted + start date agreed = boarded (sales board);
-- invoiced per negotiated terms; paid after start. Lives on candidacy —
-- the statutory lineage row (ADR-012) — plus an invoice table.
-- ---------------------------------------------------------------------------

alter table candidacy add column offer_accepted_at timestamptz;
alter table candidacy add column start_date date;
alter table candidacy add column salary numeric(12,2);
alter table candidacy add column boarded_at timestamptz;
alter table candidacy add column outcome_reason text; -- why withdrawn/rejected — approach outcomes are data

create type invoice_status as enum ('draft', 'issued', 'paid', 'void');

create table invoice (
  id           uuid primary key default gen_random_uuid(),
  candidacy_id uuid not null references candidacy(id) on delete restrict,
  amount       numeric(12,2) not null,
  terms        text,
  issued_at    date,
  due_date     date,
  paid_at      date,
  status       invoice_status not null default 'draft',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index invoice_candidacy_idx on invoice (candidacy_id);
create index invoice_status_idx on invoice (status) where status <> 'paid';
alter table invoice enable row level security;

create trigger invoice_updated_at before update on invoice
  for each row execute function set_updated_at();
create trigger invoice_audit after insert or update or delete on invoice
  for each row execute function audit_row_change();

-- ---------------------------------------------------------------------------
-- BD activity types + consultant attribution (multi-seat ready, ADR-019)
-- ---------------------------------------------------------------------------

alter type activity_type add value if not exists 'linkedin_post';
alter type activity_type add value if not exists 'event';

alter table activity add column consultant text not null default 'matt';
alter table deal add column consultant text not null default 'matt';
alter table mandate add column consultant text not null default 'matt';

-- ---------------------------------------------------------------------------
-- Matching taxonomy — mirrored on person and mandate so "new job → surface
-- candidates" can score structured overlap before keywords and AI.
-- Values validated at the action/MCP layer (ADR-004 pattern), not in the DB.
-- ---------------------------------------------------------------------------

alter table person add column seniority text;
alter table person add column functions text[] not null default '{}';
alter table person add column skills text[] not null default '{}';
alter table person add column sectors text[] not null default '{}';

alter table mandate add column seniority text;
alter table mandate add column functions text[] not null default '{}';
alter table mandate add column skills text[] not null default '{}';
alter table mandate add column location text;
alter table mandate add column salary_range text;

-- BD deal ↔ delivery mandate: one job lifecycle, two linked records
-- (product brief §7 decision 1: link, don't merge).
alter table mandate add column deal_id uuid references deal(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------

-- The sales board: boarded / invoiced / paid by month.
create view v_sales_board with (security_invoker = on) as
with boarded as (
  select date_trunc('month', boarded_at)::date as month,
         count(*)        as placements_boarded,
         sum(fee_amount) as fees_boarded
  from candidacy
  where boarded_at is not null
  group by 1
), issued as (
  select date_trunc('month', issued_at)::date as month, sum(amount) as invoiced
  from invoice
  where status in ('issued', 'paid') and issued_at is not null
  group by 1
), settled as (
  select date_trunc('month', paid_at)::date as month, sum(amount) as paid
  from invoice
  where status = 'paid' and paid_at is not null
  group by 1
)
select
  coalesce(b.month, i.month, s.month) as month,
  coalesce(b.placements_boarded, 0)   as placements_boarded,
  coalesce(b.fees_boarded, 0)         as fees_boarded,
  coalesce(i.invoiced, 0)             as invoiced,
  coalesce(s.paid, 0)                 as paid
from boarded b
full join issued i using (month)
full join settled s using (month)
order by 1 desc;

create view v_upcoming_interviews with (security_invoker = on) as
select
  i.id          as interview_id,
  i.round,
  i.kind,
  i.scheduled_at,
  i.consultant,
  p.full_name   as candidate,
  m.title       as mandate,
  co.name       as client
from interview i
join candidacy c on c.id = i.candidacy_id
join person p on p.id = c.person_id
join mandate m on m.id = c.mandate_id
join company co on co.id = m.company_id
where i.outcome = 'scheduled'
  and i.scheduled_at >= now() - interval '1 day'
order by i.scheduled_at;
