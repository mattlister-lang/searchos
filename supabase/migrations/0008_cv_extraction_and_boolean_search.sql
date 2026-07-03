-- 0008_cv_extraction_and_boolean_search.sql
-- UAT round R3, the SQL half (P3 is pure UI, no schema).
--
--   I1  CV-first candidate creation (ADR-024): the LLM-standardised CV lives
--       as a jsonb column on the CV's own document row — colocated with the
--       source file (0001 already stores the raw file in Storage and the raw
--       text in document.parsed_text). Plus a scalar cost-guard function so
--       the in-app AI calls read one authoritative "this month's spend" number
--       before every call (ADR-015/024 £20 alert / £50 hard stop).
--   I3  Boolean people search: a set-returning RPC over person fields + CV
--       text using websearch_to_tsquery (quoted phrases / OR / -negation),
--       ranked, erased people never returned.
--
-- Boring by construction (ADR-002): no denormalised tsvector column, no
-- maintenance triggers, no new tables. The search vector is built on the fly
-- inside the RPC — correct and instant at this scale (hundreds of people,
-- ADR-018), with zero staleness surface. If the pool ever reaches tens of
-- thousands, materialise person.search_tsv via triggers (person fields + the
-- owning person's document text) and add a GIN index; the RPC's signature
-- and every caller stay unchanged. See learnings L-019.

-- ---------------------------------------------------------------------------
-- I1 · Standardised CV storage. The structured extraction (full_name, emails,
-- linkedin_url, location, seniority, functions, skills, sectors,
-- employment_history, summary) is persisted on the CV document that produced
-- it. Captured by the existing document audit trigger (0005) and therefore
-- purged with the person on erasure via the document.person_id audit match —
-- no erase_person change is needed (verified in behaviour test 14; cf L-010).
-- ---------------------------------------------------------------------------

alter table document add column parsed_cv jsonb;

comment on column document.parsed_cv is
  'ADR-024 I1: the LLM-standardised CV as structured JSON (full_name, emails, '
  'linkedin_url, location, seniority, functions, skills, sectors, '
  'employment_history, summary). Rendered as the "standardised CV" on the '
  'person page; the original file stays in Storage and parsed_text (0001) '
  'holds the raw extracted text. Null for non-CV or unparsed documents.';

-- ---------------------------------------------------------------------------
-- I1 · Cost guard. One authoritative definition of "this calendar month's AI
-- spend" so the web AI actions stay dumb: .rpc('ai_spend_this_month_gbp')
-- returns a scalar, compared against the ADR-015/024 thresholds before every
-- Claude call. Same month bucketing as v_ai_spend (0002).
-- ---------------------------------------------------------------------------

create function ai_spend_this_month_gbp()
returns numeric
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(sum(cost_gbp), 0)
  from ai_usage_log
  where occurred_at >= date_trunc('month', now());
$$;

comment on function ai_spend_this_month_gbp() is
  'ADR-015/024 cost guard: total logged AI cost (GBP) for the current calendar '
  'month. The web AI actions call this before every Claude API call — >= £50 '
  'refuse (hard stop), >= £20 warn (alert). The single source of truth for '
  '"this month''s spend"; matches v_ai_spend month bucketing.';

-- ---------------------------------------------------------------------------
-- I3 · Boolean people search. websearch_to_tsquery gives quoted phrases, OR
-- and -negation natively. The searchable vector weights name highest (A),
-- structured taxonomy next (B), CV body last (C), so a person named for a
-- term ranks above one merely mentioning it. Erased people (erased_at not
-- null) are excluded in the vector CTE and can never be returned.
--
-- Clean for the typed client (L-018 — keep the client call dumb, the
-- cleverness in SQL): .rpc('search_people_boolean', { q }) -> { person_id,
-- rank }[]. An empty / stopword-only query yields an empty tsquery and
-- therefore no rows (never dumps the table).
-- ---------------------------------------------------------------------------

create function search_people_boolean(q text)
returns table (person_id uuid, rank real)
language sql
stable
set search_path = public, pg_temp
as $$
  with tsq as (
    select websearch_to_tsquery('english', coalesce(q, '')) as query
  ),
  docs as (
    select d.person_id, string_agg(d.parsed_text, ' ') as txt
    from document d
    where d.parsed_text is not null
    group by d.person_id
  ),
  vec as (
    select
      p.id,
      p.full_name,
      setweight(to_tsvector('english', coalesce(p.full_name, '')), 'A')
      || setweight(to_tsvector('english',
           array_to_string(p.skills || p.functions || p.sectors, ' ')), 'B')
      || setweight(to_tsvector('english', coalesce(docs.txt, '')), 'C') as search_tsv
    from person p
    left join docs on docs.person_id = p.id
    where p.erased_at is null
  )
  select vec.id as person_id, ts_rank(vec.search_tsv, tsq.query) as rank
  from vec, tsq
  where vec.search_tsv @@ tsq.query
  order by rank desc, vec.full_name;
$$;

comment on function search_people_boolean(text) is
  'UAT I3: boolean/full-text people search over name (weight A), '
  'skills+functions+sectors (B) and CV parsed_text (C) using '
  'websearch_to_tsquery (quoted phrases, OR, -negation). Returns live people '
  '(erased_at is null) ranked by ts_rank. On-the-fly vector, boring by design '
  '(ADR-002) — materialise with a GIN index only if the pool outgrows a scan '
  '(L-019). Called dumb from the typed client via .rpc().';
