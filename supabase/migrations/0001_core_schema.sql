-- 0001_core_schema.sql
-- SearchOS core schema. Plain, boring, normalised Postgres (ADR-002).
-- Person-centric model (ADR-004); intelligence lives around the database, not in it.

-- Extensions (ADR-002: pgcrypto, pgvector, pg_trgm, citext — nothing else)
create extension if not exists pgcrypto;
create extension if not exists citext;
create extension if not exists pg_trgm;
create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- Enums — stable state machines only (ADR-002). Extending is one ALTER TYPE.
-- ---------------------------------------------------------------------------

create type company_status as enum ('prospect', 'client', 'target', 'source');

create type deal_stage as enum
  ('lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost');

create type candidacy_stage as enum
  ('identified', 'approached', 'screening', 'shortlisted',
   'client_interview', 'offer', 'placed', 'rejected', 'withdrawn');

create type mandate_status as enum ('open', 'on_hold', 'completed', 'cancelled');

create type activity_type as enum
  ('email', 'meeting', 'call', 'note', 'linkedin_message');

create type document_kind as enum ('cv', 'spec', 'terms', 'other');

create type queue_status as enum ('pending', 'approved', 'ignored', 'rejected');

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------

create table person (
  id               uuid primary key default gen_random_uuid(),
  full_name        text not null,
  linkedin_url     citext unique,
  location         text,
  profile          text,
  lawful_basis     text not null default 'legitimate_interest',
  consent_override text,
  embedding        vector(1024),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Emails are globally unique (ADR-006: email is the resolution key).
-- A shared address wrongly claimed by one person poisons resolution forever,
-- which is why generic mailboxes never become people (CLAUDE.md).
create table person_email (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null references person(id) on delete cascade,
  email      citext not null unique,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create table company (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  status     company_status not null default 'target',
  sectors    text[] not null default '{}',  -- taxonomy validated at MCP layer (ADR-004)
  notes      text,
  embedding  vector(1024),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Known domains let ingestion link mail to a company without creating people
-- (ADR-011 match-based creation; generic-mailbox rule).
create table company_domain (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id) on delete cascade,
  domain     citext not null unique,
  created_at timestamptz not null default now()
);

create table employment (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null references person(id) on delete cascade,
  company_id uuid not null references company(id) on delete cascade,
  title      text,
  start_date date,
  end_date   date,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A mandate is a search assignment for a client company.
-- on delete restrict: mandates carry statutory fee lineage (ADR-012);
-- a client company cannot be casually deleted out from under them.
create table mandate (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id) on delete restrict,
  title      text not null,
  status     mandate_status not null default 'open',
  brief      text,
  fee_terms  text,
  opened_at  date,
  closed_at  date,
  embedding  vector(1024),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table candidacy (
  id               uuid primary key default gen_random_uuid(),
  person_id        uuid not null references person(id) on delete cascade,
  mandate_id       uuid not null references mandate(id) on delete restrict,
  stage            candidacy_stage not null default 'identified',
  stage_changed_at timestamptz not null default now(),
  placed_at        timestamptz,
  fee_amount       numeric(12,2),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (person_id, mandate_id)
);

-- Track stage transitions; 'placed' stamps placed_at, which drives the
-- statutory-retention clock (ADR-012). Never set 'placed' as shorthand.
create function candidacy_track_stage() returns trigger
language plpgsql as $$
begin
  if new.stage is distinct from old.stage then
    new.stage_changed_at = now();
    if new.stage = 'placed' and new.placed_at is null then
      new.placed_at = now();
    end if;
  end if;
  return new;
end;
$$;

create table deal (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references company(id) on delete restrict,
  primary_contact_id uuid references person(id) on delete set null,
  name               text not null,
  stage              deal_stage not null default 'lead',
  value              numeric(12,2),
  next_step          text,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Every ingested item is idempotent via unique(source, source_ref) (ADR-005).
-- Manual/conversational captures use source 'manual' with a generated ref.
create table activity (
  id         uuid primary key default gen_random_uuid(),
  type       activity_type not null,
  occurred_at timestamptz not null,
  subject    text,
  body_raw   text,
  summary    text,
  source     text not null,
  source_ref text not null,
  company_id uuid references company(id) on delete set null,  -- generic-mailbox linkage
  deal_id    uuid references deal(id) on delete set null,
  mandate_id uuid references mandate(id) on delete set null,
  embedding  vector(1024),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_ref)
);

create table activity_participant (
  activity_id uuid not null references activity(id) on delete cascade,
  person_id   uuid not null references person(id) on delete cascade,
  role        text,  -- 'from' | 'to' | 'cc' | 'attendee' | 'organiser'
  primary key (activity_id, person_id)
);

create table document (
  id           uuid primary key default gen_random_uuid(),
  kind         document_kind not null default 'other',
  filename     text,
  storage_path text not null,
  mime_type    text,
  parsed_text  text,
  person_id    uuid references person(id) on delete cascade,
  company_id   uuid references company(id) on delete set null,
  mandate_id   uuid references mandate(id) on delete set null,
  deal_id      uuid references deal(id) on delete set null,
  embedding    vector(1024),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Operational tables — resolution, hygiene, ingestion (ADRs 006, 011, 013)
-- ---------------------------------------------------------------------------

create table merge_queue (
  id          uuid primary key default gen_random_uuid(),
  person_a    uuid not null references person(id) on delete cascade,
  person_b    uuid not null references person(id) on delete cascade,
  reason      text,
  confidence  numeric(4,3),
  status      queue_status not null default 'pending',
  resolved_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Audit log of merges. No FKs: the removed person no longer exists, and the
-- kept person may itself be merged away later. The snapshot is the recovery
-- path for a false merge (ADR-013 rule 4).
create table merge_log (
  id                uuid primary key default gen_random_uuid(),
  kept_person_id    uuid not null,
  removed_person_id uuid not null,
  removed_snapshot  jsonb not null,
  merged_at         timestamptz not null default now()
);

-- Unknown email counterparties accumulate here for conversational review;
-- they never auto-create person records (ADR-011).
create table counterparty_queue (
  id               uuid primary key default gen_random_uuid(),
  email            citext not null unique,
  display_name     text,
  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  occurrence_count integer not null default 1,
  status           queue_status not null default 'pending',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- SHA-256 hex of the lowercased email address. Erased people can never be
-- resurrected by ingestion (ADR-008).
create table suppression_list (
  id            uuid primary key default gen_random_uuid(),
  email_hash    text not null unique,
  reason        text,
  suppressed_at timestamptz not null default now()
);

create table ingestion_state (
  source     text primary key,
  cursor     text,
  updated_at timestamptz not null default now()
);

-- Nothing is silently dropped (ADR-013 rule 5).
create table ingestion_dead_letter (
  id          uuid primary key default gen_random_uuid(),
  source      text not null,
  source_ref  text,
  payload     jsonb,
  error       text not null,
  occurred_at timestamptz not null default now(),
  resolved    boolean not null default false
);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create trigger person_updated_at before update on person
  for each row execute function set_updated_at();
create trigger company_updated_at before update on company
  for each row execute function set_updated_at();
create trigger employment_updated_at before update on employment
  for each row execute function set_updated_at();
create trigger mandate_updated_at before update on mandate
  for each row execute function set_updated_at();
create trigger candidacy_updated_at before update on candidacy
  for each row execute function set_updated_at();
create trigger deal_updated_at before update on deal
  for each row execute function set_updated_at();
create trigger activity_updated_at before update on activity
  for each row execute function set_updated_at();
create trigger document_updated_at before update on document
  for each row execute function set_updated_at();
create trigger merge_queue_updated_at before update on merge_queue
  for each row execute function set_updated_at();
create trigger counterparty_queue_updated_at before update on counterparty_queue
  for each row execute function set_updated_at();

create trigger candidacy_stage_tracking before update on candidacy
  for each row execute function candidacy_track_stage();

-- ---------------------------------------------------------------------------
-- Functions — resolution, merge, erasure
-- ---------------------------------------------------------------------------

-- Trigram name search, company-scoped when known (ADR-006 fallback step).
create function similar_people(p_name text, p_company uuid default null)
returns table (person_id uuid, full_name text, similarity real)
language sql stable as $$
  select p.id, p.full_name, similarity(p.full_name, p_name)
  from person p
  where p.full_name % p_name
    and (p_company is null or exists (
      select 1 from employment e
      where e.person_id = p.id and e.company_id = p_company))
  order by 3 desc
  limit 10;
$$;

-- The only sanctioned way to merge two people (ADR-013 rule 4).
-- Snapshots the removed record and all its children to merge_log BEFORE
-- anything moves, repoints every child, coalesces scalar fields, deletes.
create function merge_people(p_keep uuid, p_remove uuid)
returns void
language plpgsql as $$
declare
  v_keep   person%rowtype;
  v_remove person%rowtype;
begin
  if p_keep = p_remove then
    raise exception 'merge_people: keep and remove are the same person (%)', p_keep;
  end if;

  select * into v_keep from person where id = p_keep for update;
  if not found then
    raise exception 'merge_people: keep person % not found', p_keep;
  end if;
  select * into v_remove from person where id = p_remove for update;
  if not found then
    raise exception 'merge_people: remove person % not found', p_remove;
  end if;

  insert into merge_log (kept_person_id, removed_person_id, removed_snapshot)
  values (p_keep, p_remove, jsonb_build_object(
    'person', to_jsonb(v_remove),
    'emails', coalesce((select jsonb_agg(to_jsonb(e)) from person_email e
                        where e.person_id = p_remove), '[]'::jsonb),
    'employment', coalesce((select jsonb_agg(to_jsonb(e)) from employment e
                            where e.person_id = p_remove), '[]'::jsonb),
    'candidacies', coalesce((select jsonb_agg(to_jsonb(c)) from candidacy c
                             where c.person_id = p_remove), '[]'::jsonb),
    'activity_participation', coalesce((select jsonb_agg(to_jsonb(ap))
                                        from activity_participant ap
                                        where ap.person_id = p_remove), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(to_jsonb(d)) from document d
                           where d.person_id = p_remove), '[]'::jsonb)
  ));

  -- The kept person's primary email wins; the removed person's primary is
  -- demoted before repointing so the one-primary-per-person index holds.
  update person_email set is_primary = false
  where person_id = p_remove
    and is_primary
    and exists (select 1 from person_email k
                where k.person_id = p_keep and k.is_primary);
  update person_email set person_id = p_keep where person_id = p_remove;
  update employment set person_id = p_keep where person_id = p_remove;

  -- Same-mandate duplicate candidacies: a 'placed' row always survives
  -- (statutory lineage, ADR-012); otherwise the most recently progressed
  -- row wins, tie broken in favour of the kept person's row.
  delete from candidacy c
  using candidacy k
  where c.mandate_id = k.mandate_id
    and c.person_id in (p_keep, p_remove)
    and k.person_id in (p_keep, p_remove)
    and c.person_id <> k.person_id
    and (
      (k.stage = 'placed' and c.stage <> 'placed')
      or ((k.stage = 'placed') = (c.stage = 'placed')
          and (c.stage_changed_at < k.stage_changed_at
               or (c.stage_changed_at = k.stage_changed_at
                   and c.person_id = p_remove)))
    );
  update candidacy set person_id = p_keep where person_id = p_remove;

  delete from activity_participant ap
  using activity_participant kp
  where ap.person_id = p_remove
    and kp.person_id = p_keep
    and ap.activity_id = kp.activity_id;
  update activity_participant set person_id = p_keep where person_id = p_remove;

  update document set person_id = p_keep where person_id = p_remove;
  update deal set primary_contact_id = p_keep where primary_contact_id = p_remove;

  -- Delete first so unique fields (linkedin_url) can move without conflict.
  delete from person where id = p_remove;

  update person set
    linkedin_url     = coalesce(v_keep.linkedin_url, v_remove.linkedin_url),
    location         = coalesce(v_keep.location, v_remove.location),
    profile          = coalesce(v_keep.profile, v_remove.profile),
    consent_override = coalesce(v_keep.consent_override, v_remove.consent_override),
    embedding        = coalesce(v_keep.embedding, v_remove.embedding)
  where id = p_keep;
end;
$$;

-- GDPR erasure (ADR-008). Hard delete with cascades; activities where the
-- erased person was the sole participant are deleted outright, multi-party
-- activities keep content with the person's link removed. Email hashes go to
-- suppression_list so ingestion can never resurrect them.
-- NOTE: superseded by the two-path version in 0002 (statutory carve-out).
create function erase_person(p_person uuid)
returns void
language plpgsql as $$
begin
  perform 1 from person where id = p_person for update;
  if not found then
    raise exception 'erase_person: person % not found', p_person;
  end if;

  insert into suppression_list (email_hash, reason)
  select encode(digest(lower(e.email::text), 'sha256'), 'hex'), 'erased'
  from person_email e
  where e.person_id = p_person
  on conflict (email_hash) do nothing;

  delete from activity a
  where exists (select 1 from activity_participant ap
                where ap.activity_id = a.id and ap.person_id = p_person)
    and not exists (select 1 from activity_participant ap2
                    where ap2.activity_id = a.id and ap2.person_id <> p_person);

  delete from person where id = p_person;
end;
$$;

-- ---------------------------------------------------------------------------
-- Views — the read contract (ADR-017 builds the UI on these)
-- ---------------------------------------------------------------------------

create view v_pipeline as
select
  c.id           as candidacy_id,
  p.id           as person_id,
  p.full_name,
  m.id           as mandate_id,
  m.title        as mandate,
  co.name        as client,
  c.stage,
  c.stage_changed_at,
  now() - c.stage_changed_at as time_in_stage
from candidacy c
join person p   on p.id = c.person_id
join mandate m  on m.id = c.mandate_id
join company co on co.id = m.company_id
where m.status = 'open';

create view v_deal_board as
select
  d.id          as deal_id,
  d.name,
  d.stage,
  d.value,
  d.next_step,
  co.name       as company,
  p.full_name   as primary_contact,
  d.updated_at
from deal d
join company co on co.id = d.company_id
left join person p on p.id = d.primary_contact_id;

create view v_relationship_freshness as
select
  p.id   as person_id,
  p.full_name,
  max(a.occurred_at) as last_activity_at,
  extract(day from now() - max(a.occurred_at))::int as days_since_contact
from person p
left join activity_participant ap on ap.person_id = p.id
left join activity a on a.id = ap.activity_id
group by p.id, p.full_name;

-- People untouched for 24 months with no live candidacy or deal,
-- reviewed quarterly (ADR-008).
create view v_retention_review as
select
  p.id  as person_id,
  p.full_name,
  f.last_activity_at
from person p
join v_relationship_freshness f on f.person_id = p.id
where coalesce(f.last_activity_at, p.created_at) < now() - interval '24 months'
  and not exists (
    select 1 from candidacy c
    where c.person_id = p.id
      and c.stage not in ('rejected', 'withdrawn', 'placed'))
  and not exists (
    select 1 from deal d
    where d.primary_contact_id = p.id
      and d.stage not in ('won', 'lost'));

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- Trigram (ADR-006 fuzzy fallback)
create index person_full_name_trgm_idx on person using gin (full_name gin_trgm_ops);
create index company_name_trgm_idx on company using gin (name gin_trgm_ops);

-- Embeddings: HNSW, cosine (ADR-007)
create index person_embedding_idx on person using hnsw (embedding vector_cosine_ops);
create index company_embedding_idx on company using hnsw (embedding vector_cosine_ops);
create index mandate_embedding_idx on mandate using hnsw (embedding vector_cosine_ops);
create index activity_embedding_idx on activity using hnsw (embedding vector_cosine_ops);
create index document_embedding_idx on document using hnsw (embedding vector_cosine_ops);

-- Foreign keys and hot paths
create index person_email_person_idx on person_email (person_id);
create unique index person_email_one_primary_idx on person_email (person_id) where is_primary;
create index company_domain_company_idx on company_domain (company_id);
create index employment_person_idx on employment (person_id);
create index employment_company_idx on employment (company_id);
create index mandate_company_idx on mandate (company_id);
create index candidacy_mandate_idx on candidacy (mandate_id);
create index deal_company_idx on deal (company_id);
create index deal_primary_contact_idx on deal (primary_contact_id);
create index activity_company_idx on activity (company_id);
create index activity_deal_idx on activity (deal_id);
create index activity_mandate_idx on activity (mandate_id);
create index activity_occurred_at_idx on activity (occurred_at);
create index activity_participant_person_idx on activity_participant (person_id);
create index document_person_idx on document (person_id);
create index document_company_idx on document (company_id);
create index document_mandate_idx on document (mandate_id);
create index document_deal_idx on document (deal_id);
create index merge_queue_status_idx on merge_queue (status) where status = 'pending';
create index counterparty_queue_status_idx on counterparty_queue (status) where status = 'pending';
create index dead_letter_unresolved_idx on ingestion_dead_letter (occurred_at) where not resolved;
