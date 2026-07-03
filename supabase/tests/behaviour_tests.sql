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

rollback;
\echo ALL BEHAVIOUR TESTS PASSED
