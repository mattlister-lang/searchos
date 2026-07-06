-- SearchOS migration behaviour tests. Runs inside a transaction and rolls
-- back; every assertion raises on failure.
\set ON_ERROR_STOP 1
begin;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into company (id, name, status, sectors) values
  ('00000000-0000-0000-0000-00000000c001', 'Kraken Test', 'prospect', '{flexibility}'),
  ('00000000-0000-0000-0000-00000000c002', 'GeoPura Test', 'client', '{hydrogen}');

insert into company_domain (company_id, domain) values
  ('00000000-0000-0000-0000-00000000c001', 'kraken-test.example');

insert into person (id, full_name, linkedin_url, location) values
  ('00000000-0000-0000-0000-00000000f001', 'Stephen Burrell', null, 'London'),
  ('00000000-0000-0000-0000-00000000f002', 'S. Burrell', 'linkedin.com/in/sburrell', null),
  ('00000000-0000-0000-0000-00000000f003', 'Amy Park Test', null, null),
  ('00000000-0000-0000-0000-00000000f004', 'Solo Deleteme', null, null),
  ('00000000-0000-0000-0000-00000000f005', 'Placed Candidate', 'linkedin.com/in/placed', 'Leeds'),
  ('00000000-0000-0000-0000-00000000f006', 'Regressed Placement', null, 'Bristol');

insert into person_email (person_id, email, is_primary) values
  ('00000000-0000-0000-0000-00000000f001', 'stephen@kraken-test.example', true),
  ('00000000-0000-0000-0000-00000000f002', 's.burrell@other.example', true),
  ('00000000-0000-0000-0000-00000000f004', 'solo@delete.example', true),
  ('00000000-0000-0000-0000-00000000f005', 'placed@geopura-test.example', true),
  ('00000000-0000-0000-0000-00000000f006', 'regressed@geopura-test.example', true);

insert into employment (person_id, company_id, title, is_current) values
  ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000c001', 'Head of Flexibility', true),
  ('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-00000000c001', 'Head of Flex', true),
  ('00000000-0000-0000-0000-00000000f005', '00000000-0000-0000-0000-00000000c002', 'Ops Director', true);

insert into mandate (id, company_id, title, status) values
  ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000c002', 'Test Search A', 'open'),
  ('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-00000000c002', 'Test Search B', 'open');

-- Duplicate people sit on the same mandate at different stages.
insert into candidacy (person_id, mandate_id, stage, stage_changed_at) values
  ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000e001', 'screening', now() - interval '10 days'),
  ('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-00000000e001', 'shortlisted', now() - interval '2 days'),
  ('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-00000000e002', 'approached', now() - interval '1 day'),
  ('00000000-0000-0000-0000-00000000f005', '00000000-0000-0000-0000-00000000e002', 'offer', now()),
  ('00000000-0000-0000-0000-00000000f006', '00000000-0000-0000-0000-00000000e001', 'offer', now());

insert into activity (id, type, occurred_at, subject, source, source_ref) values
  ('00000000-0000-0000-0000-0000000000a1', 'email', now() - interval '5 days', 'Shared thread', 'gmail', 'msg-001'),
  ('00000000-0000-0000-0000-0000000000a2', 'call', now() - interval '3 days', 'Solo call', 'manual', 'ref-002'),
  ('00000000-0000-0000-0000-0000000000a3', 'meeting', now() - interval '1 day', 'Placed catchup', 'granola', 'ref-003');

insert into activity_participant (activity_id, person_id, role) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000f001', 'to'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000f002', 'cc'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000f003', 'from'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000f004', 'from'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000f005', 'attendee'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000f003', 'attendee');

insert into document (person_id, kind, storage_path) values
  ('00000000-0000-0000-0000-00000000f002', 'cv', 'docs/sburrell-cv.pdf'),
  ('00000000-0000-0000-0000-00000000f005', 'cv', 'docs/placed-cv.pdf');

insert into deal (id, company_id, primary_contact_id, name, stage) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000c001',
   '00000000-0000-0000-0000-00000000f002', 'Test Deal', 'proposal');

-- ---------------------------------------------------------------------------
-- Test 1: idempotency — duplicate (source, source_ref) must be rejected
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    insert into activity (type, occurred_at, subject, source, source_ref)
    values ('email', now(), 'dupe', 'gmail', 'msg-001');
    raise exception 'TEST 1 FAILED: duplicate source_ref was accepted';
  exception when unique_violation then
    raise notice 'TEST 1 OK: unique(source, source_ref) enforced';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Test 2: similar_people trigram, unscoped and company-scoped
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  select count(*) into n from similar_people('Steven Burrell');
  if n < 2 then
    raise exception 'TEST 2 FAILED: expected >=2 trigram candidates, got %', n;
  end if;
  select count(*) into n from similar_people('Steven Burrell', '00000000-0000-0000-0000-00000000c002');
  if n <> 0 then
    raise exception 'TEST 2 FAILED: company scope not applied (got %)', n;
  end if;
  raise notice 'TEST 2 OK: similar_people works, company scoping works';
end $$;

-- ---------------------------------------------------------------------------
-- Test 3: candidacy stage trigger — stage_changed_at moves, placed stamps placed_at
-- ---------------------------------------------------------------------------
do $$
declare c candidacy%rowtype;
begin
  update candidacy set stage = 'client_interview'
  where person_id = '00000000-0000-0000-0000-00000000f005';
  select * into c from candidacy where person_id = '00000000-0000-0000-0000-00000000f005';
  if c.stage_changed_at < now() - interval '1 minute' then
    raise exception 'TEST 3 FAILED: stage_changed_at not refreshed';
  end if;
  if c.placed_at is not null then
    raise exception 'TEST 3 FAILED: placed_at set on non-placed move';
  end if;

  update candidacy set stage = 'placed'
  where person_id = '00000000-0000-0000-0000-00000000f005';
  select * into c from candidacy where person_id = '00000000-0000-0000-0000-00000000f005';
  if c.placed_at is null then
    raise exception 'TEST 3 FAILED: placed_at not stamped on placement';
  end if;
  raise notice 'TEST 3 OK: stage trigger maintains stage_changed_at and placed_at';
end $$;

-- Direct insert as 'placed' (historical backfill) must stamp placed_at too.
do $$
declare c candidacy%rowtype;
begin
  insert into candidacy (person_id, mandate_id, stage)
  values ('00000000-0000-0000-0000-00000000f003', '00000000-0000-0000-0000-00000000e001', 'placed')
  returning * into c;
  if c.placed_at is null then
    raise exception 'TEST 3c FAILED: placed_at not stamped on direct placed insert';
  end if;
  delete from candidacy where id = c.id;
  raise notice 'TEST 3c OK: direct placed insert stamps placed_at';
end $$;

-- ---------------------------------------------------------------------------
-- Test 4: merge_people — snapshot, repointing, dedupe, coalesce
-- Keep Stephen (p001), remove S. Burrell (p002).
-- ---------------------------------------------------------------------------
select merge_people('00000000-0000-0000-0000-00000000f001',
                    '00000000-0000-0000-0000-00000000f002');

do $$
declare
  v_person person%rowtype;
  n int;
begin
  if exists (select 1 from person where id = '00000000-0000-0000-0000-00000000f002') then
    raise exception 'TEST 4 FAILED: removed person still exists';
  end if;

  select count(*) into n from merge_log
  where kept_person_id = '00000000-0000-0000-0000-00000000f001'
    and removed_person_id = '00000000-0000-0000-0000-00000000f002'
    and removed_snapshot ? 'person'
    and jsonb_array_length(removed_snapshot->'candidacies') = 2;
  if n <> 1 then
    raise exception 'TEST 4 FAILED: merge_log snapshot missing or incomplete';
  end if;

  -- Emails from both people now on keep.
  select count(*) into n from person_email
  where person_id = '00000000-0000-0000-0000-00000000f001';
  if n <> 2 then
    raise exception 'TEST 4 FAILED: expected 2 emails on kept person, got %', n;
  end if;

  -- Same-mandate duplicate: shortlisted (newer) beat screening; both mandates covered, no dupes.
  select count(*) into n from candidacy
  where person_id = '00000000-0000-0000-0000-00000000f001';
  if n <> 2 then
    raise exception 'TEST 4 FAILED: expected 2 candidacies after merge, got %', n;
  end if;
  if not exists (select 1 from candidacy
                 where person_id = '00000000-0000-0000-0000-00000000f001'
                   and mandate_id = '00000000-0000-0000-0000-00000000e001'
                   and stage = 'shortlisted') then
    raise exception 'TEST 4 FAILED: most-recent candidacy row did not survive merge';
  end if;

  -- Shared activity deduped to one participant row for keep.
  select count(*) into n from activity_participant
  where activity_id = '00000000-0000-0000-0000-0000000000a1'
    and person_id = '00000000-0000-0000-0000-00000000f001';
  if n <> 1 then
    raise exception 'TEST 4 FAILED: activity participation not deduped';
  end if;

  -- Scalar coalesce: keep had no linkedin, remove did; keep's location wins.
  select * into v_person from person where id = '00000000-0000-0000-0000-00000000f001';
  if v_person.linkedin_url is distinct from 'linkedin.com/in/sburrell' then
    raise exception 'TEST 4 FAILED: linkedin_url not coalesced from removed person';
  end if;
  if v_person.location is distinct from 'London' then
    raise exception 'TEST 4 FAILED: kept person location overwritten';
  end if;

  -- Document and deal repointed.
  if not exists (select 1 from document where person_id = '00000000-0000-0000-0000-00000000f001') then
    raise exception 'TEST 4 FAILED: document not repointed';
  end if;
  if not exists (select 1 from deal where primary_contact_id = '00000000-0000-0000-0000-00000000f001') then
    raise exception 'TEST 4 FAILED: deal primary contact not repointed';
  end if;

  raise notice 'TEST 4 OK: merge_people snapshots, repoints, dedupes, coalesces';
end $$;

-- merge_people must refuse self-merge.
do $$
begin
  begin
    perform merge_people('00000000-0000-0000-0000-00000000f001',
                         '00000000-0000-0000-0000-00000000f001');
    raise exception 'TEST 4b FAILED: self-merge accepted';
  exception when raise_exception then
    if sqlerrm like '%same person%' then
      raise notice 'TEST 4b OK: self-merge refused';
    else
      raise;
    end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Test 5: erase_person, never-placed path — hard delete + suppression;
-- sole-participant activity deleted, multi-party activity retained.
-- ---------------------------------------------------------------------------
select erase_person('00000000-0000-0000-0000-00000000f004');

do $$
declare n int;
begin
  if exists (select 1 from person where id = '00000000-0000-0000-0000-00000000f004') then
    raise exception 'TEST 5 FAILED: never-placed person not hard deleted';
  end if;
  if exists (select 1 from activity where id = '00000000-0000-0000-0000-0000000000a2') then
    raise exception 'TEST 5 FAILED: sole-participant activity not deleted';
  end if;
  if not exists (select 1 from suppression_list
                 where email_hash = encode(digest('solo@delete.example', 'sha256'), 'hex')) then
    raise exception 'TEST 5 FAILED: email hash not on suppression_list';
  end if;
  raise notice 'TEST 5 OK: never-placed erasure hard-deletes and suppresses';
end $$;

-- ---------------------------------------------------------------------------
-- Test 6: erase_person, placed path — redacted erasure; lineage survives.
-- p005 was placed in test 3. Their multi-party meeting (a3) must survive
-- with the link removed, and the surviving statutory row's notes must not.
-- ---------------------------------------------------------------------------
update candidacy set notes = 'Interview feedback: identifying detail'
where person_id = '00000000-0000-0000-0000-00000000f005';

select erase_person('00000000-0000-0000-0000-00000000f005');

do $$
declare v_person person%rowtype;
begin
  select * into v_person from person where id = '00000000-0000-0000-0000-00000000f005';
  if not found then
    raise exception 'TEST 6 FAILED: placed person hard-deleted instead of redacted';
  end if;
  if v_person.erased_at is null or v_person.full_name <> '[erased]'
     or v_person.linkedin_url is not null or v_person.location is not null then
    raise exception 'TEST 6 FAILED: identity fields not stripped';
  end if;
  if exists (select 1 from person_email where person_id = v_person.id)
     or exists (select 1 from employment where person_id = v_person.id)
     or exists (select 1 from document where person_id = v_person.id)
     or exists (select 1 from activity_participant where person_id = v_person.id) then
    raise exception 'TEST 6 FAILED: children not removed on redaction';
  end if;
  if not exists (select 1 from candidacy
                 where person_id = v_person.id and stage = 'placed') then
    raise exception 'TEST 6 FAILED: placed candidacy lineage lost';
  end if;
  if exists (select 1 from candidacy
             where person_id = v_person.id and notes is not null) then
    raise exception 'TEST 6 FAILED: surviving statutory row kept identifying notes';
  end if;
  if not exists (select 1 from activity where id = '00000000-0000-0000-0000-0000000000a3') then
    raise exception 'TEST 6 FAILED: multi-party activity deleted on redaction';
  end if;
  if not exists (select 1 from suppression_list
                 where email_hash = encode(digest('placed@geopura-test.example', 'sha256'), 'hex')) then
    raise exception 'TEST 6 FAILED: placed person email not suppressed';
  end if;
  raise notice 'TEST 6 OK: redacted erasure preserves statutory lineage';
end $$;

-- ---------------------------------------------------------------------------
-- Test 6b: a placement later regressed must still take the redacted path —
-- placed_at is the durable marker, not the current stage.
-- ---------------------------------------------------------------------------
update candidacy set stage = 'placed'
where person_id = '00000000-0000-0000-0000-00000000f006';
update candidacy set stage = 'withdrawn'
where person_id = '00000000-0000-0000-0000-00000000f006';

select erase_person('00000000-0000-0000-0000-00000000f006');

do $$
declare v_person person%rowtype;
begin
  select * into v_person from person where id = '00000000-0000-0000-0000-00000000f006';
  if not found then
    raise exception 'TEST 6b FAILED: regressed placement hard-deleted — statutory lineage destroyed';
  end if;
  if v_person.erased_at is null or v_person.full_name <> '[erased]' then
    raise exception 'TEST 6b FAILED: regressed placement not redacted';
  end if;
  if not exists (select 1 from candidacy
                 where person_id = v_person.id and placed_at is not null) then
    raise exception 'TEST 6b FAILED: placed_at lineage row lost';
  end if;
  raise notice 'TEST 6b OK: regressed placement still routed to redacted erasure';
end $$;

-- ---------------------------------------------------------------------------
-- Test 6c: erasure purges every audit reference to the erased people —
-- including sole-participant activity content (a2) — for both paths.
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  select count(*) into n from audit_log
  where row_id in ('00000000-0000-0000-0000-00000000f004',
                   '00000000-0000-0000-0000-00000000f005',
                   '00000000-0000-0000-0000-00000000f006',
                   '00000000-0000-0000-0000-0000000000a2')
     or old_row ->> 'person_id' in ('00000000-0000-0000-0000-00000000f004',
                                    '00000000-0000-0000-0000-00000000f005',
                                    '00000000-0000-0000-0000-00000000f006')
     or new_row ->> 'person_id' in ('00000000-0000-0000-0000-00000000f004',
                                    '00000000-0000-0000-0000-00000000f005',
                                    '00000000-0000-0000-0000-00000000f006');
  if n <> 0 then
    raise exception 'TEST 6c FAILED: % audit rows still reference erased people', n;
  end if;
  raise notice 'TEST 6c OK: erasure leaves no audit references behind';
end $$;

-- ---------------------------------------------------------------------------
-- Test 7: views parse and statutory purge surfaces 6-year-old placements
-- ---------------------------------------------------------------------------
update candidacy set placed_at = now() - interval '7 years'
where person_id in ('00000000-0000-0000-0000-00000000f005',
                    '00000000-0000-0000-0000-00000000f006')
  and placed_at is not null;

do $$
declare n int;
begin
  perform * from v_pipeline;
  perform * from v_deal_board;
  -- 0007: the board exposes link ids
  if not exists (select 1 from v_deal_board where company_id is not null) then
    raise exception 'TEST 7 FAILED: v_deal_board missing company_id link';
  end if;
  perform * from v_relationship_freshness;
  perform * from v_retention_review;
  perform * from v_ai_spend;

  select count(*) into n from v_statutory_purge
  where person_id = '00000000-0000-0000-0000-00000000f005';
  if n <> 1 then
    raise exception 'TEST 7 FAILED: statutory purge did not surface 7-year-old placement';
  end if;

  -- The regressed placement (stage now 'withdrawn') must surface too:
  -- the view keys off placed_at, not the mutable stage.
  select count(*) into n from v_statutory_purge
  where person_id = '00000000-0000-0000-0000-00000000f006';
  if n <> 1 then
    raise exception 'TEST 7 FAILED: purge view missed regressed placement (keyed on stage?)';
  end if;

  -- Redacted people stay off the retention review list.
  if exists (select 1 from v_retention_review
             where person_id = '00000000-0000-0000-0000-00000000f005') then
    raise exception 'TEST 7 FAILED: erased person on retention review list';
  end if;
  raise notice 'TEST 7 OK: views parse; statutory purge and retention exclusion correct';
end $$;

-- ---------------------------------------------------------------------------
-- Test 8: audit trail — inserts and updates are captured with before/after
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  -- Exactly the 3 non-erased people (f001-f003) should retain INSERT rows:
  -- f004/f005/f006 were erased in tests 5/6/6b and their audit rows purged.
  select count(*) into n from audit_log where table_name = 'person' and op = 'INSERT';
  if n <> 3 then
    raise exception 'TEST 8 FAILED: expected exactly 3 surviving person INSERT audit rows, got %', n;
  end if;

  update company set notes = 'audit probe' where name = 'Kraken Test';
  if not exists (select 1 from audit_log
                 where table_name = 'company' and op = 'UPDATE'
                   and new_row ->> 'notes' = 'audit probe'
                   and old_row ->> 'notes' is distinct from 'audit probe') then
    raise exception 'TEST 8 FAILED: company update not captured with old/new rows';
  end if;

  -- merge-removed person (f002) is recoverable, not erased: audit rows remain
  if not exists (select 1 from audit_log
                 where row_id = '00000000-0000-0000-0000-00000000f002') then
    raise exception 'TEST 8 FAILED: merge-removed person audit history missing';
  end if;
  raise notice 'TEST 8 OK: audit trail captures changes; merge history retained';
end $$;


-- ---------------------------------------------------------------------------
-- Test 10: insight views (0004) select cleanly
-- ---------------------------------------------------------------------------
do $$
begin
  perform * from v_funnel;
  perform * from v_stage_dwell;
  perform * from v_next_actions;
  perform * from v_activity_pulse;
  perform * from v_fee_income;
  raise notice 'TEST 10 OK: insight views select';
end $$;

-- ---------------------------------------------------------------------------
-- Test 11 (0006): interviews, money flow, sales board, taxonomy, deal link
-- ---------------------------------------------------------------------------
do $$
declare
  v_cand uuid;
  v_deal uuid := '00000000-0000-0000-0000-0000000000d1';
  n int;
  v_fees numeric;
begin
  -- interview rounds attach to a candidacy and are audited
  select id into v_cand from candidacy
  where person_id = '00000000-0000-0000-0000-00000000f001' limit 1;

  insert into interview (candidacy_id, round, kind, scheduled_at, outcome)
  values (v_cand, 1, 'video', now() + interval '2 days', 'scheduled'),
         (v_cand, 2, 'panel', now() + interval '9 days', 'scheduled');

  select count(*) into n from v_upcoming_interviews;
  if n <> 2 then
    raise exception 'TEST 11 FAILED: expected 2 upcoming interviews, got %', n;
  end if;
  if not exists (select 1 from audit_log where table_name = 'interview' and op = 'INSERT') then
    raise exception 'TEST 11 FAILED: interview inserts not audited';
  end if;

  -- money flow: board a fee, invoice it, mark paid; sales board reflects all
  update candidacy set
    offer_accepted_at = now(), start_date = current_date + 30,
    salary = 90000, fee_amount = 22500, boarded_at = now()
  where id = v_cand;

  insert into invoice (candidacy_id, amount, status, issued_at, paid_at)
  values (v_cand, 22500, 'paid', current_date, current_date);

  select fees_boarded into v_fees from v_sales_board limit 1;
  if v_fees is distinct from 22500 then
    raise exception 'TEST 11 FAILED: sales board fees_boarded = %', v_fees;
  end if;
  select paid into v_fees from v_sales_board limit 1;
  if v_fees is distinct from 22500 then
    raise exception 'TEST 11 FAILED: sales board paid = %', v_fees;
  end if;

  -- taxonomy columns + deal link
  update person set seniority = 'director', skills = '{ppa,origination}',
    functions = '{commercial}', sectors = '{hydrogen}'
  where id = '00000000-0000-0000-0000-00000000f001';
  update mandate set deal_id = v_deal, seniority = 'director',
    skills = '{ppa}', location = 'London'
  where id = '00000000-0000-0000-0000-00000000e001';

  if not exists (select 1 from mandate
                 where id = '00000000-0000-0000-0000-00000000e001'
                   and deal_id = v_deal and seniority = 'director') then
    raise exception 'TEST 11 FAILED: mandate taxonomy/deal link not persisted';
  end if;
  raise notice 'TEST 11 OK: interviews, money flow, sales board, taxonomy, deal link';
end $$;

-- ---------------------------------------------------------------------------
-- 0008 fixtures — dedicated rows so these tests don't lean on state mutated
-- by the merge/erasure tests above. Hex-only UUIDs (L-012).
-- b1 has both hydrogen + electrolysis; b4 has hydrogen but NOT electrolysis
-- (for the -negation case). b2 carries a CV with searchable body text. b3 is
-- erased and must never surface.
-- ---------------------------------------------------------------------------
insert into person (id, full_name, skills, functions, sectors) values
  ('00000000-0000-0000-0000-0000000000b1', 'Nadia Quantum', '{hydrogen,electrolysis}', '{engineering}', '{hydrogen}'),
  ('00000000-0000-0000-0000-0000000000b2', 'Owen Battery',  '{battery}',               '{commercial}',  '{battery}'),
  ('00000000-0000-0000-0000-0000000000b4', 'Priya Grid',    '{hydrogen,grid}',         '{commercial}',  '{grid}');
insert into person (id, full_name, skills, erased_at) values
  ('00000000-0000-0000-0000-0000000000b3', 'Ghost Hydrogen', '{hydrogen}', now());

insert into document (id, person_id, kind, storage_path, parsed_text, parsed_cv) values
  ('00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000000b2', 'cv',
   'person/b2/cv.pdf',
   'solar photovoltaic origination specialist with grid experience',
   '{"full_name":"Owen Battery","emails":["owen@example.com"],"seniority":"director",'
   '"skills":["battery","solar"],"sectors":["battery","solar"],'
   '"employment_history":[{"company":"SunCo","title":"Head of Origination","is_current":true}],'
   '"summary":"Energy origination lead."}'::jsonb);

-- ---------------------------------------------------------------------------
-- Test 12 (I1): document.parsed_cv round-trips structured JSON and defaults
-- null for a document that carries no extraction.
-- ---------------------------------------------------------------------------
do $$
declare v jsonb;
begin
  select parsed_cv into v from document where id = '00000000-0000-0000-0000-0000000000b5';
  if v is null then
    raise exception 'TEST 12 FAILED: parsed_cv not stored';
  end if;
  if v ->> 'full_name' <> 'Owen Battery' then
    raise exception 'TEST 12 FAILED: parsed_cv full_name did not round-trip';
  end if;
  if jsonb_array_length(v -> 'employment_history') <> 1 then
    raise exception 'TEST 12 FAILED: parsed_cv employment_history lost';
  end if;

  insert into document (id, person_id, kind, storage_path)
  values ('00000000-0000-0000-0000-0000000000b6',
          '00000000-0000-0000-0000-0000000000b1', 'spec', 'person/b1/spec.pdf');
  if (select parsed_cv from document where id = '00000000-0000-0000-0000-0000000000b6') is not null then
    raise exception 'TEST 12 FAILED: parsed_cv should default null';
  end if;
  raise notice 'TEST 12 OK: document.parsed_cv stores structured CV JSON, defaults null';
end $$;

-- ---------------------------------------------------------------------------
-- Test 13 (I3): search_people_boolean — person fields + CV text, websearch
-- operators, erased exclusion, empty-query safety.
-- ---------------------------------------------------------------------------
do $$
begin
  -- plain term over person taxonomy; erased person never returned
  if not exists (select 1 from search_people_boolean('hydrogen')
                 where person_id = '00000000-0000-0000-0000-0000000000b1') then
    raise exception 'TEST 13 FAILED: term did not match person skills';
  end if;
  if not exists (select 1 from search_people_boolean('hydrogen')
                 where person_id = '00000000-0000-0000-0000-0000000000b4') then
    raise exception 'TEST 13 FAILED: term missed second hydrogen person';
  end if;
  if exists (select 1 from search_people_boolean('hydrogen')
             where person_id = '00000000-0000-0000-0000-0000000000b3') then
    raise exception 'TEST 13 FAILED: erased person returned';
  end if;

  -- CV parsed_text is searchable
  if not exists (select 1 from search_people_boolean('photovoltaic')
                 where person_id = '00000000-0000-0000-0000-0000000000b2') then
    raise exception 'TEST 13 FAILED: CV parsed_text not searched';
  end if;

  -- OR operator spans both people
  if not exists (select 1 from search_people_boolean('battery OR hydrogen')
                 where person_id = '00000000-0000-0000-0000-0000000000b1')
     or not exists (select 1 from search_people_boolean('battery OR hydrogen')
                    where person_id = '00000000-0000-0000-0000-0000000000b2') then
    raise exception 'TEST 13 FAILED: OR operator did not span matches';
  end if;

  -- -negation removes the electrolysis person, keeps the other hydrogen one
  if exists (select 1 from search_people_boolean('hydrogen -electrolysis')
             where person_id = '00000000-0000-0000-0000-0000000000b1') then
    raise exception 'TEST 13 FAILED: -negation did not exclude electrolysis person';
  end if;
  if not exists (select 1 from search_people_boolean('hydrogen -electrolysis')
                 where person_id = '00000000-0000-0000-0000-0000000000b4') then
    raise exception 'TEST 13 FAILED: -negation over-excluded';
  end if;

  -- quoted phrase requires adjacency; reversed order must not match
  if not exists (select 1 from search_people_boolean('"photovoltaic origination"')
                 where person_id = '00000000-0000-0000-0000-0000000000b2') then
    raise exception 'TEST 13 FAILED: quoted phrase did not match';
  end if;
  if exists (select 1 from search_people_boolean('"origination photovoltaic"')
             where person_id = '00000000-0000-0000-0000-0000000000b2') then
    raise exception 'TEST 13 FAILED: reversed phrase should not match';
  end if;

  -- empty query never dumps the table
  if exists (select 1 from search_people_boolean('')) then
    raise exception 'TEST 13 FAILED: empty query returned rows';
  end if;

  raise notice 'TEST 13 OK: boolean people search — fields + CV text, operators, erased excluded';
end $$;

-- ---------------------------------------------------------------------------
-- Test 14 (I1 + GDPR): parsed_cv reaches audit_log via the document trigger;
-- erasing the person must purge every audit reference to it, so identifying
-- CV data cannot linger in the audit trail (ADR-008/020; the L-010 trap).
-- ---------------------------------------------------------------------------
insert into person (id, full_name) values
  ('00000000-0000-0000-0000-0000000000b7', 'Cv Eraseme');
insert into document (id, person_id, kind, storage_path, parsed_cv) values
  ('00000000-0000-0000-0000-0000000000b8', '00000000-0000-0000-0000-0000000000b7', 'cv',
   'person/b7/cv.pdf',
   '{"full_name":"Cv Eraseme","emails":["cv@erase.example"],"summary":"identifying detail"}'::jsonb);

do $$
begin
  if not exists (select 1 from audit_log
                 where table_name = 'document'
                   and new_row ->> 'person_id' = '00000000-0000-0000-0000-0000000000b7'
                   and new_row -> 'parsed_cv' is not null) then
    raise exception 'TEST 14 SETUP FAILED: document audit did not capture parsed_cv';
  end if;
end $$;

select erase_person('00000000-0000-0000-0000-0000000000b7');

do $$
declare n int;
begin
  if exists (select 1 from person where id = '00000000-0000-0000-0000-0000000000b7') then
    raise exception 'TEST 14 FAILED: never-placed person not hard deleted';
  end if;
  select count(*) into n from audit_log
  where row_id = '00000000-0000-0000-0000-0000000000b7'
     or old_row ->> 'person_id' = '00000000-0000-0000-0000-0000000000b7'
     or new_row ->> 'person_id' = '00000000-0000-0000-0000-0000000000b7';
  if n <> 0 then
    raise exception 'TEST 14 FAILED: % audit rows still hold erased CV data', n;
  end if;
  raise notice 'TEST 14 OK: parsed_cv audit references purged on erasure';
end $$;

-- ---------------------------------------------------------------------------
-- Test 15 (I1): ai_spend_this_month_gbp sums the current calendar month only.
-- ---------------------------------------------------------------------------
do $$
declare v numeric;
begin
  select ai_spend_this_month_gbp() into v;
  if v <> 0 then
    raise exception 'TEST 15 FAILED: baseline month spend should be 0, got %', v;
  end if;

  insert into ai_usage_log (provider, model, purpose, cost_gbp)
  values ('anthropic', 'claude-haiku-4-5-20251001', 'cv_parse', 0.0123);
  -- a prior-month charge must be excluded
  insert into ai_usage_log (provider, model, purpose, cost_gbp, occurred_at)
  values ('anthropic', 'claude-haiku-4-5-20251001', 'cv_parse', 99, now() - interval '2 months');

  select ai_spend_this_month_gbp() into v;
  if v <> 0.0123 then
    raise exception 'TEST 15 FAILED: expected 0.0123 this month, got %', v;
  end if;
  raise notice 'TEST 15 OK: ai_spend_this_month_gbp sums current month only';
end $$;

-- ---------------------------------------------------------------------------
-- 0010 fixtures (UAT R4) — dedicated hex-only rows (L-012), independent of the
-- merge/erasure state mutated above. One client, five people, three mandates:
--   f011  hiring manager of e011 AND a never-placed candidate on e012 (ca01,
--         with feedback fb01) — drives feedback CRUD + never-placed erasure.
--   f012  placed candidate on e011 (ca02, feedback fb02 + interview + invoice)
--         — drives redacted erasure.
--   f013/f014  hiring-manager merge repoint (f014 is e012's hiring manager).
--   f015  fresh candidacies for the dwell-view exclusion cases.
-- ---------------------------------------------------------------------------
insert into company (id, name, status, sectors) values
  ('00000000-0000-0000-0000-00000000c003', 'R4 Client', 'client', '{grid}');

insert into person (id, full_name) values
  ('00000000-0000-0000-0000-00000000f011', 'FB HM Candidate'),
  ('00000000-0000-0000-0000-00000000f012', 'Placed FB Cand'),
  ('00000000-0000-0000-0000-00000000f013', 'HM Keep'),
  ('00000000-0000-0000-0000-00000000f014', 'HM Remove'),
  ('00000000-0000-0000-0000-00000000f015', 'Recent Cand');

insert into person_email (person_id, email, is_primary) values
  ('00000000-0000-0000-0000-00000000f011', 'fb-cand@r4.example', true),
  ('00000000-0000-0000-0000-00000000f012', 'placed-fb@r4.example', true);

-- e011 hiring manager = f011; e012 hiring manager = f014; e013 is closed.
insert into mandate (id, company_id, title, status, hiring_manager_id) values
  ('00000000-0000-0000-0000-00000000e011', '00000000-0000-0000-0000-00000000c003', 'R4 Live A', 'open',      '00000000-0000-0000-0000-00000000f011'),
  ('00000000-0000-0000-0000-00000000e012', '00000000-0000-0000-0000-00000000c003', 'R4 Live B', 'open',      '00000000-0000-0000-0000-00000000f014'),
  ('00000000-0000-0000-0000-00000000e013', '00000000-0000-0000-0000-00000000c003', 'R4 Closed', 'completed', null);

insert into candidacy (id, person_id, mandate_id, stage, stage_changed_at) values
  ('00000000-0000-0000-0000-0000000ca001', '00000000-0000-0000-0000-00000000f011', '00000000-0000-0000-0000-00000000e012', 'client_interview', now() - interval '10 days'),
  ('00000000-0000-0000-0000-0000000ca002', '00000000-0000-0000-0000-00000000f012', '00000000-0000-0000-0000-00000000e011', 'placed',           now()),
  ('00000000-0000-0000-0000-0000000ca003', '00000000-0000-0000-0000-00000000f015', '00000000-0000-0000-0000-00000000e012', 'screening',        now() - interval '2 days'),
  ('00000000-0000-0000-0000-0000000ca004', '00000000-0000-0000-0000-00000000f015', '00000000-0000-0000-0000-00000000e013', 'client_interview', now() - interval '30 days'),
  ('00000000-0000-0000-0000-0000000ca005', '00000000-0000-0000-0000-00000000f015', '00000000-0000-0000-0000-00000000e011', 'rejected',         now() - interval '20 days');

insert into candidacy_feedback (id, candidacy_id, source, author, body) values
  ('00000000-0000-0000-0000-0000000fb001', '00000000-0000-0000-0000-0000000ca001', 'client',     'Client, R4', 'Light on grid experience'),
  ('00000000-0000-0000-0000-0000000fb002', '00000000-0000-0000-0000-0000000ca002', 'consultant', null,         'Strong technical — identifying detail');

insert into interview (candidacy_id, round, kind, feedback, notes) values
  ('00000000-0000-0000-0000-0000000ca002', 1, 'panel', 'Panel liked them — identifying', 'private notes');

insert into invoice (candidacy_id, amount, status, issued_at) values
  ('00000000-0000-0000-0000-0000000ca002', 30000, 'issued', current_date);

-- ---------------------------------------------------------------------------
-- Test 16 (F1): candidacy_feedback surfaces on BOTH the job page (via mandate)
-- and the person page (via person) as ONE row; CRUD is audited.
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  -- Job-page path: mandate e012 → candidacy → feedback
  select count(*) into n from candidacy_feedback fbk
  join candidacy c on c.id = fbk.candidacy_id
  where c.mandate_id = '00000000-0000-0000-0000-00000000e012';
  if n <> 1 then raise exception 'TEST 16 FAILED: feedback not reachable via mandate (job page), got %', n; end if;

  -- Person-page path: person f011 → candidacy → feedback
  select count(*) into n from candidacy_feedback fbk
  join candidacy c on c.id = fbk.candidacy_id
  where c.person_id = '00000000-0000-0000-0000-00000000f011';
  if n <> 1 then raise exception 'TEST 16 FAILED: feedback not reachable via person (person page), got %', n; end if;

  -- One entry, two views: the same row satisfies both paths.
  if not exists (
    select 1 from candidacy_feedback fbk
    join candidacy c on c.id = fbk.candidacy_id
    where fbk.id = '00000000-0000-0000-0000-0000000fb001'
      and c.mandate_id = '00000000-0000-0000-0000-00000000e012'
      and c.person_id  = '00000000-0000-0000-0000-00000000f011') then
    raise exception 'TEST 16 FAILED: job and person views are not the same feedback row';
  end if;

  -- Create audited (C).
  if not exists (select 1 from audit_log where table_name = 'candidacy_feedback' and op = 'INSERT'
                 and new_row ->> 'body' = 'Light on grid experience') then
    raise exception 'TEST 16 FAILED: feedback insert not audited';
  end if;

  -- Update audited with before/after (U).
  update candidacy_feedback set body = 'Light on grid, strong commercially'
  where id = '00000000-0000-0000-0000-0000000fb001';
  if not exists (select 1 from audit_log where table_name = 'candidacy_feedback' and op = 'UPDATE'
                 and new_row ->> 'body' = 'Light on grid, strong commercially'
                 and old_row ->> 'body' = 'Light on grid experience') then
    raise exception 'TEST 16 FAILED: feedback update not audited with old/new';
  end if;
  raise notice 'TEST 16 OK: candidacy_feedback surfaces on job + person as one row, CRUD audited';
end $$;

-- ---------------------------------------------------------------------------
-- Test 17 (F4): v_stale_candidacies surfaces live+stale candidacies with link
-- ids/names (0007) and excludes below-threshold, terminal, and non-open.
-- ---------------------------------------------------------------------------
do $$
declare r v_stale_candidacies%rowtype;
begin
  select * into r from v_stale_candidacies where candidacy_id = '00000000-0000-0000-0000-0000000ca001';
  if not found then raise exception 'TEST 17 FAILED: stale candidacy not surfaced'; end if;
  if r.person_id is null or r.mandate_id is null or r.company_id is null
     or r.person_name is null or r.mandate is null or r.client is null then
    raise exception 'TEST 17 FAILED: view missing link ids/names (0007 lesson)';
  end if;
  if r.days_in_stage < 7 then
    raise exception 'TEST 17 FAILED: days_in_stage below threshold (%)', r.days_in_stage;
  end if;

  -- Below the 7-day threshold (ca003, 2 days) — excluded.
  if exists (select 1 from v_stale_candidacies where candidacy_id = '00000000-0000-0000-0000-0000000ca003') then
    raise exception 'TEST 17 FAILED: below-threshold candidacy surfaced';
  end if;
  -- Terminal stage though old (ca005, rejected, 20 days) — excluded.
  if exists (select 1 from v_stale_candidacies where candidacy_id = '00000000-0000-0000-0000-0000000ca005') then
    raise exception 'TEST 17 FAILED: terminal-stage candidacy surfaced';
  end if;
  -- Old + live but on a non-open mandate (ca004 on completed e013) — excluded.
  if exists (select 1 from v_stale_candidacies where candidacy_id = '00000000-0000-0000-0000-0000000ca004') then
    raise exception 'TEST 17 FAILED: candidacy on non-open mandate surfaced';
  end if;
  raise notice 'TEST 17 OK: v_stale_candidacies carries link ids, excludes below-threshold/terminal/non-open';
end $$;

-- ---------------------------------------------------------------------------
-- Test 18 (F2): merge_people repoints mandate.hiring_manager_id (L-009 class).
-- e012's hiring manager is f014; merge it into f013 → the mandate now points at
-- f013, not an orphaned id.
-- ---------------------------------------------------------------------------
do $$
begin
  if (select hiring_manager_id from mandate where id = '00000000-0000-0000-0000-00000000e012')
     <> '00000000-0000-0000-0000-00000000f014' then
    raise exception 'TEST 18 SETUP FAILED: e012 hiring manager is not f014';
  end if;
end $$;

select merge_people('00000000-0000-0000-0000-00000000f013',
                    '00000000-0000-0000-0000-00000000f014');

do $$
begin
  if exists (select 1 from person where id = '00000000-0000-0000-0000-00000000f014') then
    raise exception 'TEST 18 FAILED: removed person still exists';
  end if;
  if (select hiring_manager_id from mandate where id = '00000000-0000-0000-0000-00000000e012')
     <> '00000000-0000-0000-0000-00000000f013' then
    raise exception 'TEST 18 FAILED: hiring_manager_id not repointed to the kept person';
  end if;
  raise notice 'TEST 18 OK: merge_people repoints mandate.hiring_manager_id';
end $$;

-- ---------------------------------------------------------------------------
-- Test 19 (F1 + F2 + GDPR): erasing a never-placed person who is both a
-- hiring manager (e011) and a candidate with feedback (ca001) hard-deletes,
-- purges the feedback, nulls the hiring-manager FK, and leaves NO audit row
-- referencing them — via person_id, hiring_manager_id, or candidacy_id.
-- ---------------------------------------------------------------------------
do $$
begin
  if (select hiring_manager_id from mandate where id = '00000000-0000-0000-0000-00000000e011')
     <> '00000000-0000-0000-0000-00000000f011' then
    raise exception 'TEST 19 SETUP FAILED: e011 hiring manager is not f011';
  end if;
end $$;

select erase_person('00000000-0000-0000-0000-00000000f011');

do $$
declare n int;
begin
  if exists (select 1 from person where id = '00000000-0000-0000-0000-00000000f011') then
    raise exception 'TEST 19 FAILED: never-placed person not hard deleted';
  end if;
  if exists (select 1 from candidacy_feedback where id = '00000000-0000-0000-0000-0000000fb001') then
    raise exception 'TEST 19 FAILED: feedback survived erasure';
  end if;
  if (select hiring_manager_id from mandate where id = '00000000-0000-0000-0000-00000000e011') is not null then
    raise exception 'TEST 19 FAILED: hiring_manager_id not nulled on erase';
  end if;
  select count(*) into n from audit_log
  where row_id = '00000000-0000-0000-0000-00000000f011'
     or old_row ->> 'person_id'         = '00000000-0000-0000-0000-00000000f011'
     or new_row ->> 'person_id'         = '00000000-0000-0000-0000-00000000f011'
     or old_row ->> 'hiring_manager_id' = '00000000-0000-0000-0000-00000000f011'
     or new_row ->> 'hiring_manager_id' = '00000000-0000-0000-0000-00000000f011'
     or (table_name in ('candidacy_feedback', 'interview')
         and (old_row ->> 'candidacy_id' = '00000000-0000-0000-0000-0000000ca001'
           or new_row ->> 'candidacy_id' = '00000000-0000-0000-0000-0000000ca001'));
  if n <> 0 then
    raise exception 'TEST 19 FAILED: % audit rows still reference the erased person/feedback', n;
  end if;
  raise notice 'TEST 19 OK: never-placed erase purges feedback, nulls hiring FK, leaves no audit trace';
end $$;

-- ---------------------------------------------------------------------------
-- Test 20 (F1 + GDPR): redacted (placed) erasure of f012 keeps the placement
-- lineage but purges the identifying feedback AND interview on the surviving
-- placed candidacy (data + audit), while preserving the statutory invoice and
-- ITS audit — proving the candidacy_id purge is table-scoped, not a blanket.
-- ---------------------------------------------------------------------------
select erase_person('00000000-0000-0000-0000-00000000f012');

do $$
declare v_person person%rowtype; n int;
begin
  select * into v_person from person where id = '00000000-0000-0000-0000-00000000f012';
  if not found then raise exception 'TEST 20 FAILED: placed person hard-deleted instead of redacted'; end if;
  if v_person.erased_at is null or v_person.full_name <> '[erased]' then
    raise exception 'TEST 20 FAILED: identity not redacted';
  end if;

  -- Placement lineage survives.
  if not exists (select 1 from candidacy where id = '00000000-0000-0000-0000-0000000ca002' and stage = 'placed') then
    raise exception 'TEST 20 FAILED: placed candidacy lineage lost';
  end if;

  -- Identifying process detail on the surviving candidacy is gone (data).
  if exists (select 1 from candidacy_feedback where candidacy_id = '00000000-0000-0000-0000-0000000ca002') then
    raise exception 'TEST 20 FAILED: feedback on surviving placed candidacy not purged';
  end if;
  if exists (select 1 from interview where candidacy_id = '00000000-0000-0000-0000-0000000ca002') then
    raise exception 'TEST 20 FAILED: interview on surviving placed candidacy not purged';
  end if;
  if exists (select 1 from candidacy where id = '00000000-0000-0000-0000-0000000ca002' and notes is not null) then
    raise exception 'TEST 20 FAILED: identifying notes retained';
  end if;
  if not exists (select 1 from suppression_list
                 where email_hash = encode(digest('placed-fb@r4.example', 'sha256'), 'hex')) then
    raise exception 'TEST 20 FAILED: placed person email not suppressed';
  end if;

  -- No feedback/interview audit rows reference the surviving candidacy.
  select count(*) into n from audit_log
  where table_name in ('candidacy_feedback', 'interview')
    and (old_row ->> 'candidacy_id' = '00000000-0000-0000-0000-0000000ca002'
      or new_row ->> 'candidacy_id' = '00000000-0000-0000-0000-0000000ca002');
  if n <> 0 then
    raise exception 'TEST 20 FAILED: % feedback/interview audit rows still reference the placed candidacy', n;
  end if;

  -- No audit row references the erased person directly either.
  select count(*) into n from audit_log
  where row_id = '00000000-0000-0000-0000-00000000f012'
     or old_row ->> 'person_id' = '00000000-0000-0000-0000-00000000f012'
     or new_row ->> 'person_id' = '00000000-0000-0000-0000-00000000f012';
  if n <> 0 then
    raise exception 'TEST 20 FAILED: % audit rows still reference the erased person', n;
  end if;

  -- Statutory invoice (fee lineage) and its audit survive — table-scoped purge.
  if not exists (select 1 from invoice where candidacy_id = '00000000-0000-0000-0000-0000000ca002') then
    raise exception 'TEST 20 FAILED: statutory invoice destroyed by redacted erasure';
  end if;
  if not exists (select 1 from audit_log where table_name = 'invoice'
                 and new_row ->> 'candidacy_id' = '00000000-0000-0000-0000-0000000ca002') then
    raise exception 'TEST 20 FAILED: invoice audit over-purged (candidacy_id scope too broad)';
  end if;
  raise notice 'TEST 20 OK: redacted erase purges feedback+interview (data+audit), keeps invoice lineage+audit';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 21 (0011): company.apollo_org_id round-trips and defaults null.
-- ---------------------------------------------------------------------------
do $$
declare v text;
begin
  insert into company (id, name) values ('00000000-0000-0000-0000-00000000c0a1', 'Apollo Cache Test Co');
  select apollo_org_id into v from company where id = '00000000-0000-0000-0000-00000000c0a1';
  if v is not null then
    raise exception 'TEST 21 FAILED: apollo_org_id should default null';
  end if;
  update company set apollo_org_id = '5f1b2c3d4e' where id = '00000000-0000-0000-0000-00000000c0a1';
  select apollo_org_id into v from company where id = '00000000-0000-0000-0000-00000000c0a1';
  if v <> '5f1b2c3d4e' then
    raise exception 'TEST 21 FAILED: apollo_org_id did not round-trip';
  end if;
  raise notice 'TEST 21 OK: company.apollo_org_id defaults null and round-trips';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 22 (0012, E-002): v_next_actions carries a target_type + working link
-- ids for every branch (deal / candidacy / person), and the null-per-branch
-- columns stay null. Own fixtures (hex ids, L-012) so it does not depend on
-- state mutated by earlier tests.
-- ---------------------------------------------------------------------------
insert into company (id, name, status) values
  ('00000000-0000-0000-0000-0000000c07a1', 'R7 Next-Actions Co', 'prospect');
insert into mandate (id, company_id, title, status) values
  ('00000000-0000-0000-0000-0000000e07a1', '00000000-0000-0000-0000-0000000c07a1', 'R7 Open Search', 'open');
-- Deal with no next step, not won/lost -> deal_missing_next_step branch.
insert into deal (id, company_id, name, stage) values
  ('00000000-0000-0000-0000-000000d007a1', '00000000-0000-0000-0000-0000000c07a1', 'R7 Deal No Next Step', 'lead');
-- Stalled candidacy (>14 days on an open mandate) -> candidacy_stalled branch.
insert into person (id, full_name) values
  ('00000000-0000-0000-0000-0000000f07b0', 'R7 Stalled Candidate');
insert into candidacy (id, person_id, mandate_id, stage, stage_changed_at) values
  ('00000000-0000-0000-0000-0000000ca7b0', '00000000-0000-0000-0000-0000000f07b0',
   '00000000-0000-0000-0000-0000000e07a1', 'screening', now() - interval '20 days');
-- Old contact, no activity, but with a live candidacy -> relationship_going_stale.
insert into person (id, full_name, created_at) values
  ('00000000-0000-0000-0000-0000000f07c0', 'R7 Going Stale Contact', now() - interval '120 days');
insert into candidacy (id, person_id, mandate_id, stage, stage_changed_at) values
  ('00000000-0000-0000-0000-0000000ca7c0', '00000000-0000-0000-0000-0000000f07c0',
   '00000000-0000-0000-0000-0000000e07a1', 'identified', now());

do $$
declare r v_next_actions%rowtype;
begin
  -- Deal branch: target_type 'deal', deal_id + company_id set, others null.
  select * into r from v_next_actions where deal_id = '00000000-0000-0000-0000-000000d007a1';
  if not found then raise exception 'TEST 22 FAILED: deal_missing_next_step row not surfaced'; end if;
  if r.reason <> 'deal_missing_next_step' or r.target_type <> 'deal' then
    raise exception 'TEST 22 FAILED: deal row wrong reason/target_type (% / %)', r.reason, r.target_type;
  end if;
  if r.company_id <> '00000000-0000-0000-0000-0000000c07a1'
     or r.person_id is not null or r.mandate_id is not null or r.candidacy_id is not null then
    raise exception 'TEST 22 FAILED: deal row id columns wrong';
  end if;
  if not exists (select 1 from deal where id = r.deal_id)
     or not exists (select 1 from company where id = r.company_id) then
    raise exception 'TEST 22 FAILED: deal row ids do not resolve to real rows';
  end if;

  -- Candidacy branch: target_type 'candidacy', person/mandate/company/candidacy ids set.
  select * into r from v_next_actions where candidacy_id = '00000000-0000-0000-0000-0000000ca7b0';
  if not found then raise exception 'TEST 22 FAILED: candidacy_stalled row not surfaced'; end if;
  if r.reason <> 'candidacy_stalled' or r.target_type <> 'candidacy' then
    raise exception 'TEST 22 FAILED: candidacy row wrong reason/target_type';
  end if;
  if r.person_id <> '00000000-0000-0000-0000-0000000f07b0'
     or r.mandate_id <> '00000000-0000-0000-0000-0000000e07a1'
     or r.company_id <> '00000000-0000-0000-0000-0000000c07a1'
     or r.deal_id is not null then
    raise exception 'TEST 22 FAILED: candidacy row id columns wrong';
  end if;
  if not exists (select 1 from person where id = r.person_id)
     or not exists (select 1 from mandate where id = r.mandate_id)
     or not exists (select 1 from candidacy where id = r.candidacy_id) then
    raise exception 'TEST 22 FAILED: candidacy row ids do not resolve to real rows';
  end if;

  -- Person branch: target_type 'person', only person_id set.
  select * into r from v_next_actions
  where person_id = '00000000-0000-0000-0000-0000000f07c0' and reason = 'relationship_going_stale';
  if not found then raise exception 'TEST 22 FAILED: relationship_going_stale row not surfaced'; end if;
  if r.target_type <> 'person'
     or r.company_id is not null or r.mandate_id is not null
     or r.candidacy_id is not null or r.deal_id is not null then
    raise exception 'TEST 22 FAILED: person row id columns wrong';
  end if;
  if not exists (select 1 from person where id = r.person_id) then
    raise exception 'TEST 22 FAILED: person row id does not resolve to a real row';
  end if;

  raise notice 'TEST 22 OK: v_next_actions carries target_type + working link ids for deal/candidacy/person';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 23 (0012, ux.md Journey E): v_upcoming_interviews carries working
-- person/mandate/candidacy/company link ids, keeps its name columns, and its
-- outcome/scheduled_at filters still exclude non-scheduled interviews.
-- ---------------------------------------------------------------------------
insert into company (id, name, status) values
  ('00000000-0000-0000-0000-0000000c07b1', 'R7 Interview Co', 'client');
insert into mandate (id, company_id, title, status) values
  ('00000000-0000-0000-0000-0000000e07b1', '00000000-0000-0000-0000-0000000c07b1', 'R7 Interview Search', 'open');
insert into person (id, full_name) values
  ('00000000-0000-0000-0000-0000000f07d0', 'R7 Interview Candidate');
insert into candidacy (id, person_id, mandate_id, stage) values
  ('00000000-0000-0000-0000-0000000ca7d0', '00000000-0000-0000-0000-0000000f07d0',
   '00000000-0000-0000-0000-0000000e07b1', 'client_interview');
-- Upcoming + scheduled -> in the view.
insert into interview (id, candidacy_id, round, kind, scheduled_at, outcome) values
  ('00000000-0000-0000-0000-0000000107d0', '00000000-0000-0000-0000-0000000ca7d0',
   2, 'panel', now() + interval '3 days', 'scheduled');
-- Same schedule but outcome 'passed' -> excluded (filter must survive the retrofit).
insert into interview (id, candidacy_id, round, kind, scheduled_at, outcome) values
  ('00000000-0000-0000-0000-0000000107d1', '00000000-0000-0000-0000-0000000ca7d0',
   1, 'video', now() + interval '3 days', 'passed');

do $$
declare r v_upcoming_interviews%rowtype;
begin
  select * into r from v_upcoming_interviews where interview_id = '00000000-0000-0000-0000-0000000107d0';
  if not found then raise exception 'TEST 23 FAILED: scheduled upcoming interview not surfaced'; end if;
  if r.person_id <> '00000000-0000-0000-0000-0000000f07d0'
     or r.mandate_id <> '00000000-0000-0000-0000-0000000e07b1'
     or r.candidacy_id <> '00000000-0000-0000-0000-0000000ca7d0'
     or r.company_id <> '00000000-0000-0000-0000-0000000c07b1' then
    raise exception 'TEST 23 FAILED: upcoming interview link ids wrong';
  end if;
  if r.candidate is null or r.mandate is null or r.client is null then
    raise exception 'TEST 23 FAILED: existing name columns lost in the retrofit';
  end if;
  if not exists (select 1 from person where id = r.person_id)
     or not exists (select 1 from mandate where id = r.mandate_id)
     or not exists (select 1 from candidacy where id = r.candidacy_id)
     or not exists (select 1 from company where id = r.company_id) then
    raise exception 'TEST 23 FAILED: upcoming interview ids do not resolve to real rows';
  end if;
  -- Filter intact: the non-scheduled ('passed') interview is excluded.
  if exists (select 1 from v_upcoming_interviews where interview_id = '00000000-0000-0000-0000-0000000107d1') then
    raise exception 'TEST 23 FAILED: non-scheduled interview surfaced (outcome filter broken)';
  end if;
  raise notice 'TEST 23 OK: v_upcoming_interviews carries working link ids, names + outcome filter intact';
end $$;

rollback;
\echo ALL BEHAVIOUR TESTS PASSED
