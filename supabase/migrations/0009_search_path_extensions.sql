-- 0009_search_path_extensions.sql
-- Fix: erase_person() was latently broken on prod. 0003 pinned every function
-- search_path to (public, pg_temp) to satisfy the mutable-search-path advisor,
-- but on Supabase pgcrypto is pre-installed in the `extensions` schema — so
-- digest(), which erase_person uses to hash emails into suppression_list,
-- resolves nowhere and the first real erasure would have thrown. CI never saw
-- it because the plain pgvector image installs pgcrypto into public; the CI
-- workflow now mirrors prod's extension layout so this class of bug cannot
-- hide again. See learnings L-021.
--
-- The fix keeps the pin (still no mutable search_path) and adds `extensions`
-- after `public`. Postgres silently skips schemas that don't exist, so this
-- is safe on environments where the extensions live in public (old CI, dev
-- clusters) and correct on prod where pgcrypto lives in extensions. Applied
-- to all pinned functions, not just erase_person — any of them could grow a
-- call into an extensions-schema function later, and the failure mode is too
-- quiet to risk twice.

alter function set_updated_at() set search_path = public, extensions, pg_temp;
alter function candidacy_track_stage() set search_path = public, extensions, pg_temp;
alter function similar_people(text, uuid) set search_path = public, extensions, pg_temp;
alter function merge_people(uuid, uuid) set search_path = public, extensions, pg_temp;
alter function erase_person(uuid) set search_path = public, extensions, pg_temp;
alter function audit_row_change() set search_path = public, extensions, pg_temp;
alter function ai_spend_this_month_gbp() set search_path = public, extensions, pg_temp;
alter function search_people_boolean(text) set search_path = public, extensions, pg_temp;
