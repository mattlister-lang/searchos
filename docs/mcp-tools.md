# SearchOS — MCP Tool Surface Contract

**Status: DRAFT.** This is the Phase 1 contract for the dedicated TypeScript
MCP server in `mcp-server/`, which becomes the sole write path (ADR-003).
Until then, Phase 0 operates through the Supabase MCP connector under the
same behavioural rules. Changes to this surface get a numbered ADR.

The operator contract (ADR-013) is baked into tool behaviour, not left to
prompt discipline:

- **Resolution before creation** — creation tools run the resolution chain
  (email → LinkedIn URL → trigram via `similar_people`) and the
  `suppression_list` check internally and refuse to blind-create.
- **Destructive operations confirm first** — `merge_people`, `erase_person`,
  and stage regressions return a preview of what will be lost and require an
  explicit `confirm: true` on a second call.
- **Nothing is silently dropped** — failures surface, or land in
  `ingestion_dead_letter`.

Conventions: all IDs are UUIDs; emails are handled case-insensitively;
suppression hashes are SHA-256 hex of the lowercased address.

---

## Resolution

### `find_person`
Look up a person by any identifier.
- **Input:** `{ email?, linkedin_url?, name?, company_id? }` — at least one.
- **Behaviour:** exact email match via `person_email`, then LinkedIn URL,
  then `similar_people(name, company_id)` trigram candidates with scores.
- **Output:** matched person with emails, employment, open candidacies; or
  ranked candidate list; or empty.

### `similar_people`
Direct trigram search (wraps the SQL function).
- **Input:** `{ name, company_id? }`
- **Output:** up to 10 `{ person_id, full_name, similarity }`.

---

## Capture

### `add_person`
Create a person **after** resolution.
- **Input:** `{ full_name, emails?, linkedin_url?, location?, profile?, company?, title? }`
- **Behaviour:** runs the full resolution chain first. A confident match
  returns the existing person (optionally enriched) instead of creating.
  Ambiguous matches return candidates and do not create. Any email whose hash
  is in `suppression_list` aborts the call. Generic mailboxes (info@, hello@,
  talent@, careers@) are rejected as person emails.
- **Output:** `{ person_id, created: boolean, matched_on? }`

### `add_company`
- **Input:** `{ name, domain?, status?, sectors?, notes? }`
- **Behaviour:** matches on domain then trigram name before creating.
  `sectors` validated against the taxonomy (hydrogen, zev, solar, battery,
  grid, flexibility, other) at this layer — the DB stays boring (ADR-004).
- **Output:** `{ company_id, created: boolean }`

### `log_activity`
Conversational capture ("log this call with Amy").
- **Input:** `{ type, occurred_at?, subject?, body?, participants: [person refs], company_id?, deal_id?, mandate_id? }`
- **Behaviour:** participants resolve via `find_person`; unresolved
  participants block the write and prompt for resolution — never
  auto-created. Writes `source='manual'` with a generated `source_ref`.
- **Output:** `{ activity_id }`

---

## Pipeline

### `add_candidacy`
- **Input:** `{ person_id, mandate_id, stage? }`
- **Behaviour:** upserts on the `(person, mandate)` unique pair. Refuses
  `stage: 'placed'` unless `confirm_placement: true` — placed drives
  statutory retention (ADR-012) and is never shorthand.
- **Output:** `{ candidacy_id, stage }`

### `move_stage`
- **Input:** `{ candidacy_id, stage, confirm? }`
- **Behaviour:** forward moves apply immediately (`stage_changed_at` and
  `placed_at` are trigger-maintained). **Regressions** return a preview and
  require `confirm: true` (ADR-013 rule 1). Moves to `placed` state plainly
  that the statutory clock starts.
- **Output:** `{ candidacy_id, from, to }`

### `update_deal`
- **Input:** `{ deal_id?, company_id?, name?, stage?, value?, next_step?, primary_contact_id?, notes? }`
- **Behaviour:** creates or updates a deal; `primary_contact_id` must resolve.
- **Output:** `{ deal_id }`

---

## Hygiene (the weekly review runs on these)

### `list_merge_queue`
Pending merge candidates with confidence and reasons.

### `merge_people`
- **Input:** `{ keep_person_id, remove_person_id, confirm? }`
- **Behaviour:** without `confirm`, returns a side-by-side preview of both
  records and what will move. With `confirm: true`, calls the SQL
  `merge_people()` — the only sanctioned merge path; the full snapshot lands
  in `merge_log` first (ADR-013 rule 4).

### `review_counterparties`
- **Input:** `{ action?: 'list' | 'approve' | 'ignore', queue_id?, person_details? }`
- **Behaviour:** `list` returns pending unknown counterparties by occurrence
  count. `approve` creates the person (through `add_person` rules) and
  backfills their activity history. `ignore` means never asked again (ADR-011).

### `erase_person`
- **Input:** `{ person_id, confirm? }`
- **Behaviour:** without `confirm`, states plainly which path applies —
  hard delete (never placed) or redacted erasure (placed, ADR-012) — and
  exactly what will be lost. With `confirm: true`, calls SQL `erase_person()`.
  Storage objects for the person's documents are deleted in the same call.

### `list_dead_letters` / `list_ai_spend`
Read-only surfacing of `ingestion_dead_letter` and `v_ai_spend` for the
weekly hygiene review (ADR-015).

---

## Search

### `semantic_search`
- **Input:** `{ query, scope?: ('person'|'company'|'mandate'|'activity'|'document')[], limit? }`
- **Behaviour:** embeds the query with voyage-3.5 (1024 dims, logged to
  `ai_usage_log`), cosine-searches the scoped HNSW indexes, returns ranked
  hits with snippets.

### `freshness_report`
Read-only wrapper over `v_relationship_freshness` — "who am I going stale
with?" — plus `v_retention_review` and `v_statutory_purge` for the quarterly
pass.
