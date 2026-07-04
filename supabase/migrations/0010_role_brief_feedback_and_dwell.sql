-- 0010_role_brief_feedback_and_dwell.sql
-- UAT round R4 (product brief §11), the SQL half. The job page becomes the
-- workspace: the role brief, per-candidacy feedback, and proactive dwell nudges.
--
--   F1  Candidacy feedback — client/consultant feedback captured against a
--       candidacy (person-in-job), OUTSIDE interviews (interview.feedback,
--       0006, already covers interview outcomes). A dedicated child of
--       candidacy, NOT an extension of `activity`: candidacy already links
--       person + mandate, so ONE feedback row surfaces on BOTH the job page
--       (mandate → candidacy → feedback) and the person page (person →
--       candidacy → feedback) — the "one entry, two views" the brief demands,
--       for free. `activity` is event-shaped (typed, source/source_ref
--       idempotent, participant-linked) and would need a new type + a
--       candidacy link it doesn't have; the boring answer (ADR-002) is a table.
--   F2  The role brief on the mandate — team + package detail Matt is briefed
--       on, and the hiring manager as a REAL person link. salary and location
--       REUSE existing mandate columns (salary_range, location — 0006); only
--       genuinely new fields are added, never duplicated.
--   F4  Stage-dwell nudges — a new link-id-carrying view of live candidacies
--       past a chase threshold, so "X has been at <stage> N days — chase"
--       surfaces proactively.
--   F3  JD file to hand — NO SQL: `document` already carries mandate_id + kind
--       'spec' (0001). Phase 2 generalises persistDocument to mandate docs and
--       adds a signed-URL download server action.
--   F5  Activity log on the job page — NO SQL: activity.mandate_id (0001) is
--       already queried and rendered on the job page.
--
-- The person-referencing hiring_manager FK springs BOTH classic traps at once,
-- and both are closed here with tests: merge_people must repoint it (L-009) and
-- erase_person must purge audit rows that reference the erased person through it
-- (L-010). Adding candidacy_feedback (person-derived, audited) re-opens the
-- L-010 trap a third way — its audit rows carry candidacy_id, not person_id, so
-- the person-keyed purge never matches them; the SAME latent leak already
-- existed for interview (0006) and is closed here too. See learnings L-026/L-027.

-- ---------------------------------------------------------------------------
-- F2 · The role brief on the mandate.
-- salary  -> reuse mandate.salary_range (text, 0006) — the briefed band.
-- location-> reuse mandate.location (text, 0006).
-- New: team + four discrete package columns (bonus, car allowance, pension,
-- notice period) + hiring_manager as a real person link. Discrete text columns,
-- not one JSON blob: a small, stable, known briefing set — "no JSON blobs where
-- a column will do" (ADR-002) — each individually labelled and editable on the
-- brief form. Text (not numeric): these are briefing notes in varied shapes
-- ("20% of base", "company car or £6k", "3 months").
-- ---------------------------------------------------------------------------

alter table mandate add column team          text;
alter table mandate add column bonus         text;
alter table mandate add column car_allowance text;
alter table mandate add column pension       text;
alter table mandate add column notice_period text;

-- Hiring manager: a real person (a client contact), on delete set null so
-- erasing/deleting that person never destroys the mandate. Feeds future
-- company/talent maps (product brief §1, §11).
alter table mandate add column hiring_manager_id uuid references person(id) on delete set null;

create index mandate_hiring_manager_idx on mandate (hiring_manager_id);

comment on column mandate.hiring_manager_id is
  'F2: the role''s hiring manager as a real person link (a client contact). '
  'on delete set null; repointed by merge_people; nulled + audit-purged by '
  'erase_person. salary and location are NOT here — reuse salary_range/location.';
comment on column mandate.team is 'F2: which team inside the client the role sits in (free text).';
comment on column mandate.notice_period is 'F2: notice period as briefed (free text, e.g. "3 months").';

-- ---------------------------------------------------------------------------
-- F1 · Candidacy feedback. Feedback given outside interviews, attributed to a
-- source (who it came from). Person-derived (it is about a candidate), so:
-- RLS on + no policies (ADR-020), audited (0005), and — because it hangs off
-- candidacy, which carries the person link — its erasure path is verified in
-- behaviour tests (the L-010/L-020 trap). on delete cascade: feedback dies with
-- its candidacy (which itself cascades from person on the hard-delete path).
-- ---------------------------------------------------------------------------

create type feedback_source as enum ('client', 'consultant');

create table candidacy_feedback (
  id           uuid primary key default gen_random_uuid(),
  candidacy_id uuid not null references candidacy(id) on delete cascade,
  source       feedback_source not null default 'client',
  author       text,          -- who gave it (free text, e.g. "Jane, GeoPura")
  body         text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index candidacy_feedback_candidacy_idx on candidacy_feedback (candidacy_id);

alter table candidacy_feedback enable row level security;

create trigger candidacy_feedback_updated_at before update on candidacy_feedback
  for each row execute function set_updated_at();
create trigger candidacy_feedback_audit after insert or update or delete on candidacy_feedback
  for each row execute function audit_row_change();

comment on table candidacy_feedback is
  'F1: client/consultant feedback against a candidacy, outside interviews. One '
  'row surfaces on both the job page (via mandate→candidacy) and the person '
  'page (via person→candidacy). Person-derived: audited (0005) and purged by '
  'erase_person via the owning person''s candidacy ids (L-010/L-027).';

-- ---------------------------------------------------------------------------
-- F2 · merge_people gains one line: repoint mandate.hiring_manager_id, exactly
-- as it already repoints deal.primary_contact_id. Without this, merging the
-- hiring manager into their canonical person would orphan the reference on the
-- old id (L-009 class). Recreated verbatim from 0001 + that line; the SET
-- search_path pin (0003/0009) is re-declared here because CREATE OR REPLACE
-- drops proconfig not restated (would re-trip the mutable-search-path advisor).
-- ---------------------------------------------------------------------------

create or replace function merge_people(p_keep uuid, p_remove uuid)
returns void
language plpgsql
set search_path = public, extensions, pg_temp
as $$
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
  -- F2 (L-009): repoint the hiring-manager reference, same as the deal contact.
  update mandate set hiring_manager_id = p_keep where hiring_manager_id = p_remove;

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

-- ---------------------------------------------------------------------------
-- F1 + F2 · erase_person: the 0005/0009 body, extended to close the audit-vs-
-- erasure collision for the two new person-derived surfaces. Two additions:
--
--   1. hiring_manager_id. On the hard-delete path the FK on-delete-set-null
--      fires a mandate UPDATE whose audit row carries the erased id under
--      hiring_manager_id; on the redacted path the person survives so we null
--      it explicitly (as with deal.primary_contact_id). Either way the purge
--      must match hiring_manager_id.
--   2. candidacy-child free text (candidacy_feedback F1, and interview 0006).
--      Their audit rows key on candidacy_id, NOT person_id, so the person-keyed
--      purge never matched them — a latent L-010 leak for interview since 0006,
--      which candidacy_feedback would repeat. We capture the person's candidacy
--      ids and purge those two tables' audit rows by them. Scoped by table so
--      invoice audit (candidacy_id, but fee lineage — statutory, non-
--      identifying) is preserved. The redacted path also deletes the live
--      feedback/interview rows on the SURVIVING placed candidacy: identifying
--      process detail, not fee lineage (same rationale as nulling notes).
-- Everything else is unchanged. SET search_path re-declared (CREATE OR REPLACE).
-- ---------------------------------------------------------------------------

create or replace function erase_person(p_person uuid)
returns void
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  v_placed boolean;
  v_sole_activities uuid[];
  v_candidacy_ids uuid[];
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

  -- Candidacy ids owned by this person. Their child tables carrying the
  -- candidate's identifying free text (candidacy_feedback, interview) audit
  -- under candidacy_id, not person_id, so the person-keyed purge below cannot
  -- reach them without this list (the L-010 trap, generalised — L-027).
  select coalesce(array_agg(id), '{}') into v_candidacy_ids
  from candidacy where person_id = p_person;

  -- Both paths: activities where this person was the sole participant are
  -- deleted outright; multi-party activities keep their content. Their ids
  -- are kept so the audit purge below can also remove their audit entries —
  -- activity rows carry no person_id for the purge to match on.
  select coalesce(array_agg(a.id), '{}') into v_sole_activities
  from activity a
  where exists (select 1 from activity_participant ap
                where ap.activity_id = a.id and ap.person_id = p_person)
    and not exists (select 1 from activity_participant ap2
                    where ap2.activity_id = a.id and ap2.person_id <> p_person);

  delete from activity where id = any(v_sole_activities);

  -- placed_at is the durable placement marker: a later stage correction or
  -- regression must not route a real placement to the hard-delete path.
  select exists (
    select 1 from candidacy c
    where c.person_id = p_person
      and (c.stage = 'placed' or c.placed_at is not null)
  ) into v_placed;

  if not v_placed then
    -- Never placed: full hard delete with cascades, as in 0001. candidacy
    -- cascades to candidacy_feedback and interview automatically.
    delete from person where id = p_person;
  else
    -- Placed: redacted erasure. Only the placement lineage survives.
    delete from activity_participant where person_id = p_person;
    delete from document where person_id = p_person;
    delete from person_email where person_id = p_person;
    delete from employment where person_id = p_person;
    -- Identifying process detail on every candidacy of this person, including
    -- the surviving placed one — not fee lineage, so it goes (cf. notes below).
    delete from candidacy_feedback where candidacy_id = any(v_candidacy_ids);
    delete from interview where candidacy_id = any(v_candidacy_ids);
    delete from candidacy
    where person_id = p_person and stage <> 'placed' and placed_at is null;
    -- The surviving rows are an anonymised statutory record: free-text notes
    -- can identify the person, so they do not survive (ADR-012).
    update candidacy set notes = null where person_id = p_person;
    delete from merge_queue where person_a = p_person or person_b = p_person;
    update deal set primary_contact_id = null where primary_contact_id = p_person;
    -- The hiring-manager relationship is not statutory lineage — drop it, as
    -- with the deal contact above (F2).
    update mandate set hiring_manager_id = null where hiring_manager_id = p_person;

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

  -- GDPR over audit retention (ADR-020): remove every audit entry that
  -- references the erased person, including entries generated above. The
  -- candidacy-child clause is table-scoped so statutory invoice audit (also
  -- keyed on candidacy_id, but non-identifying fee lineage) is preserved.
  delete from audit_log
  where row_id = p_person
     or row_id = any(v_sole_activities)
     or old_row ->> 'person_id' = p_person::text
     or new_row ->> 'person_id' = p_person::text
     or old_row ->> 'primary_contact_id' = p_person::text
     or new_row ->> 'primary_contact_id' = p_person::text
     or old_row ->> 'hiring_manager_id' = p_person::text
     or new_row ->> 'hiring_manager_id' = p_person::text
     or old_row ->> 'person_a' = p_person::text
     or new_row ->> 'person_a' = p_person::text
     or old_row ->> 'person_b' = p_person::text
     or new_row ->> 'person_b' = p_person::text
     or (table_name in ('candidacy_feedback', 'interview')
         and (old_row ->> 'candidacy_id' = any(v_candidacy_ids::text[])
           or new_row ->> 'candidacy_id' = any(v_candidacy_ids::text[])));
end;
$$;

-- ---------------------------------------------------------------------------
-- F4 · Stage-dwell nudges. Live candidacies on open mandates that have sat in
-- one stage past the chase threshold (7 days) — gentler and earlier than the
-- 14-day "stalled" signal in v_next_actions, per Matt's "surface it at the
-- right time". Carries the person/mandate/company ids AND names so every cell
-- links (the 0007 lesson: views expose the ids the UI links on). Terminal
-- stages and non-open mandates are excluded. security_invoker (ADR-020).
-- ---------------------------------------------------------------------------

create view v_stale_candidacies with (security_invoker = on) as
select
  c.id             as candidacy_id,
  p.id             as person_id,
  p.full_name      as person_name,
  m.id             as mandate_id,
  m.title          as mandate,
  co.id            as company_id,
  co.name          as client,
  c.stage,
  c.stage_changed_at,
  extract(day from now() - c.stage_changed_at)::int as days_in_stage
from candidacy c
join person p   on p.id = c.person_id
join mandate m  on m.id = c.mandate_id
join company co on co.id = m.company_id
where m.status = 'open'
  and c.stage not in ('placed', 'rejected', 'withdrawn')
  and c.stage_changed_at < now() - interval '7 days'
order by c.stage_changed_at;

comment on view v_stale_candidacies is
  'F4: live candidacies past the 7-day chase threshold on open mandates, with '
  'person/mandate/company ids + names for linking (0007). Terminal stages and '
  'non-open mandates excluded. Powers the dashboard stage-dwell nudges.';
