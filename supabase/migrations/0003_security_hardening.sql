-- 0003_security_hardening.sql
-- Fixes the post-deploy security advisors (3 Jul 2026).
--
-- SearchOS is single-tenant and service-role-only: every legitimate access
-- path (MCP, pipeline, scripts) uses the service role, which bypasses RLS.
-- The Data API also exposes these tables to the anon key, so RLS is enabled
-- on every table with NO policies — anon and authenticated see nothing,
-- the service role sees everything, and nothing else changes.

alter table person enable row level security;
alter table person_email enable row level security;
alter table company enable row level security;
alter table company_domain enable row level security;
alter table employment enable row level security;
alter table mandate enable row level security;
alter table candidacy enable row level security;
alter table deal enable row level security;
alter table activity enable row level security;
alter table activity_participant enable row level security;
alter table document enable row level security;
alter table merge_queue enable row level security;
alter table merge_log enable row level security;
alter table counterparty_queue enable row level security;
alter table suppression_list enable row level security;
alter table ingestion_state enable row level security;
alter table ingestion_dead_letter enable row level security;
alter table ai_usage_log enable row level security;

-- Views run with the caller's permissions, not the owner's, so the RLS
-- above also governs reads through them.
alter view v_pipeline set (security_invoker = on);
alter view v_deal_board set (security_invoker = on);
alter view v_relationship_freshness set (security_invoker = on);
alter view v_retention_review set (security_invoker = on);
alter view v_ai_spend set (security_invoker = on);
alter view v_statutory_purge set (security_invoker = on);

-- Pin function search paths (mutable search_path lint).
alter function set_updated_at() set search_path = public, pg_temp;
alter function candidacy_track_stage() set search_path = public, pg_temp;
alter function similar_people(text, uuid) set search_path = public, pg_temp;
alter function merge_people(uuid, uuid) set search_path = public, pg_temp;
alter function erase_person(uuid) set search_path = public, pg_temp;
