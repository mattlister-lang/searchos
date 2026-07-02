-- 0002_operational_hardening.sql
-- AI cost visibility (ADR-015) and the statutory-retention carve-out for
-- erasure (ADR-012, amending ADR-008).

-- ---------------------------------------------------------------------------
-- AI usage logging — every unattended API call lands here (ADR-015).
-- £20/month alert, £50 hard stop are enforced by the pipeline, surfaced here.
-- ---------------------------------------------------------------------------

create table ai_usage_log (
  id            uuid primary key default gen_random_uuid(),
  provider      text not null,   -- 'anthropic' | 'voyage'
  model         text not null,
  purpose       text not null,   -- 'summarise' | 'embed' | ...
  input_tokens  integer,
  output_tokens integer,
  cost_gbp      numeric(10,6) not null default 0,
  source        text,
  source_ref    text,
  occurred_at   timestamptz not null default now()
);

create index ai_usage_log_occurred_at_idx on ai_usage_log (occurred_at);

create view v_ai_spend as
select
  date_trunc('month', occurred_at)::date as month,
  provider,
  sum(cost_gbp) as cost_gbp,
  count(*)      as calls
from ai_usage_log
group by 1, 2
order by 1 desc, 2;

-- ---------------------------------------------------------------------------
-- Two-path erasure (ADR-012). Placed candidates get redacted erasure: the
-- candidacy → mandate → fee lineage survives as an anonymised statutory
-- record; everything identifying is stripped. Never-placed people are hard
-- deleted exactly as before.
-- ---------------------------------------------------------------------------

alter table person add column erased_at timestamptz;

create or replace function erase_person(p_person uuid)
returns void
language plpgsql as $$
declare
  v_placed boolean;
begin
  perform 1 from person where id = p_person for update;
  if not found then
    raise exception 'erase_person: person % not found', p_person;
  end if;

  -- Both paths: hash every known email into the suppression list so
  -- ingestion can never resurrect this person (ADR-008).
  insert into suppression_list (email_hash, reason)
  select encode(digest(lower(e.email::text), 'sha256'), 'hex'), 'erased'
  from person_email e
  where e.person_id = p_person
  on conflict (email_hash) do nothing;

  -- Both paths: activities where this person was the sole participant are
  -- deleted outright; multi-party activities keep their content.
  delete from activity a
  where exists (select 1 from activity_participant ap
                where ap.activity_id = a.id and ap.person_id = p_person)
    and not exists (select 1 from activity_participant ap2
                    where ap2.activity_id = a.id and ap2.person_id <> p_person);

  -- placed_at is the durable placement marker: a later stage correction or
  -- regression must not route a real placement to the hard-delete path.
  select exists (
    select 1 from candidacy c
    where c.person_id = p_person
      and (c.stage = 'placed' or c.placed_at is not null)
  ) into v_placed;

  if not v_placed then
    -- Never placed: full hard delete with cascades, as in 0001.
    delete from person where id = p_person;
  else
    -- Placed: redacted erasure. Only the placement lineage survives.
    delete from activity_participant where person_id = p_person;
    delete from document where person_id = p_person;
    delete from person_email where person_id = p_person;
    delete from employment where person_id = p_person;
    delete from candidacy
    where person_id = p_person and stage <> 'placed' and placed_at is null;
    -- The surviving rows are an anonymised statutory record: free-text notes
    -- can identify the person, so they do not survive (ADR-012).
    update candidacy set notes = null where person_id = p_person;
    delete from merge_queue where person_a = p_person or person_b = p_person;
    update deal set primary_contact_id = null where primary_contact_id = p_person;

    update person set
      full_name        = '[erased]',
      linkedin_url     = null,
      location         = null,
      profile          = null,
      consent_override = null,
      embedding        = null,
      erased_at        = now()
    where id = p_person;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Retention views (quarterly review now has two lists, ADR-012)
-- ---------------------------------------------------------------------------

-- Redacted statutory records 6 years past placement, due final hard deletion.
create view v_statutory_purge as
select
  p.id        as person_id,
  c.mandate_id,
  c.placed_at,
  p.erased_at
from person p
join candidacy c on c.person_id = p.id and c.placed_at is not null
where p.erased_at is not null
  and c.placed_at < now() - interval '6 years';

-- Erased-but-retained records are statutory shells, not stale relationships;
-- keep them off the 24-month review list.
create or replace view v_retention_review as
select
  p.id  as person_id,
  p.full_name,
  f.last_activity_at
from person p
join v_relationship_freshness f on f.person_id = p.id
where p.erased_at is null
  and coalesce(f.last_activity_at, p.created_at) < now() - interval '24 months'
  and not exists (
    select 1 from candidacy c
    where c.person_id = p.id
      and c.stage not in ('rejected', 'withdrawn', 'placed'))
  and not exists (
    select 1 from deal d
    where d.primary_contact_id = p.id
      and d.stage not in ('won', 'lost'));
