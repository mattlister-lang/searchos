# SearchOS — Architecture Decision Records

**Project:** Recruitment/exec search CRM+ATS for Offtake Search (Hy Works Ltd)
**Owner:** Matt Lister
**Status:** Phase 0
**Date:** 2 July 2026

Working name "SearchOS" is a placeholder. These ADRs are binding until superseded by a later ADR. EVERYTHING MATTERS.

---

## ADR-001: Build, not buy

**Context.** Invenias, Clockwork, Loxo and Atlas all serve exec search adequately. Building costs founder time during Offtake's critical BD window.

**Decision.** Build. The deciding factors are permanent data ownership, an AI-native workflow that no vendor offers (Claude already runs the editorial pipeline and inbox; the CRM should be operated the same way), near-zero running cost, and compounding value with the wider skills/tooling estate.

**Consequences.** Accept slower feature velocity than a vendor. Mitigate by ruthless phasing (ADR-010) and by refusing to build anything a view or a Claude prompt can do instead.

---

## ADR-002: Supabase Postgres as system of record; the schema stays boring

**Context.** DBP applies to data models. Clever schemas rot.

**Decision.** Single Supabase project. Plain, normalised Postgres. Extensions limited to pgcrypto, pgvector, pg_trgm, citext. UUID primary keys, `created_at`/`updated_at` everywhere, enums for stable state machines (stage lists in exec search do not churn; adding an enum value is one `ALTER TYPE`). No JSON blobs where a column will do. Documents (CVs, terms, specs) in Supabase Storage with parsed text mirrored into the database.

**Consequences.** All intelligence lives in the layer *around* the database (ingestion, embeddings, Claude), never in it. Migrations are numbered, forward-only, and committed to the repo.

---

## ADR-003: MCP-first. Claude is the primary interface; web UI is deferred

**Context.** A solo operator will not maintain data through forms. The interface that already works is conversation plus skills.

**Decision.** The system is operated through MCP. Day one: the existing Supabase MCP connector (Claude executing SQL against the schema) is sufficient to go live. Once usage patterns stabilise, a dedicated TypeScript MCP server (`@modelcontextprotocol/sdk`) exposes typed tools (see `searchos-mcp-tools.md`) and becomes the only write path. A thin Next.js read UI (pipeline kanban, person pages) is Phase 2 and read-only.

**Consequences.** No UI to build before the system is useful. The MCP tool surface is the product's API contract; changes to it get an ADR.

---

## ADR-004: Person-centric model — no candidate/contact split

**Context.** In exec search the same human is a client contact today and a candidate next year. Volume-ATS "candidate vs contact" object splits poison the data permanently.

**Decision.** One canonical `person`. Roles are expressed through relationships: `candidacy` (person × mandate), `deal.primary_contact_id`, `employment` (person × company over time). Companies carry a status (`prospect/client/target/source`) and a sector tag array validated at the MCP layer (taxonomy: hydrogen, zev, solar, battery, grid, flexibility, other — extendable without migration).

**Consequences.** Every email address, meeting attendance and CV attaches to one identity. Entity resolution (ADR-006) becomes the critical subsystem.

---

## ADR-005: Zero manual entry — ingestion is the product

**Context.** CRMs die of unlogged calls and untyped notes.

**Decision.** Data flows in from where it already lives: Gmail (incremental sync via history ID), Granola (meetings + transcripts), Apollo (enrichment on demand), CSV (LinkedIn exports, the existing ~120-candidate pool). Ingestion runs as Supabase Edge Functions on cron. Every ingested item is idempotent via `unique(source, source_ref)`. On ingest, Claude summarises, resolves entities, and embeds. Manual capture happens conversationally ("log this call with Amy") — never through forms.

**Consequences.** Phase 1 effort concentrates here. Sync cursors live in `ingestion_state`. Email bodies are stored raw but subject to the retention regime (ADR-008).

---

## ADR-006: Entity resolution — email is the key, fuzzy match is the fallback, humans confirm merges

**Context.** "S. Burrell" in Gmail, "Stephen Burrell" in Granola and a LinkedIn URL in Apollo are one person. Getting this wrong makes the database worthless.

**Decision.** Resolution order: (1) exact email match via `person_email` (emails globally unique, citext); (2) LinkedIn URL match; (3) trigram name similarity (`pg_trgm`) scoped by company where known. Confident matches auto-link. Ambiguous matches create rows in `merge_queue` for human confirmation via Claude; `merge_people(keep, remove)` performs the merge transactionally, re-pointing all children and coalescing fields. No auto-merge below the confidence threshold, ever.

**Consequences.** A small ongoing review habit ("any merges pending?") in exchange for a clean graph.

---

## ADR-007: Embeddings — Voyage voyage-3.5 at 1024 dims, pgvector HNSW, cosine

**Context.** Semantic search over notes, CVs, specs and profiles is the core intelligence primitive. Anthropic has no embeddings API; Voyage is the recommended partner.

**Decision.** `vector(1024)` columns on person, company, mandate, activity and document, embedded with voyage-3.5, indexed HNSW with cosine ops. Embedding happens at ingest time in the pipeline, not in the database.

**Consequences.** Changing embedding model later means a column alter plus full re-embed — acceptable at this data volume. Model choice is pinned here so all embeddings stay comparable.

---

## ADR-008: GDPR — legitimate interest, real erasure, suppression against resurrection

**Context.** UK data controller holding candidate personal data. Retrofitting compliance is expensive; building it in is nearly free.

**Decision.** ICO registration before go-live. Lawful basis: legitimate interest (standard for exec search), recorded per person with a consent override field. `erase_person()` hard-deletes with cascades, additionally deleting activities where the erased person was the sole participant; multi-party records (e.g. meetings with other attendees) retain content with the person's link removed — a defensible mixed-party position. Erased email hashes go to `suppression_list` so ingestion can never resurrect an erased person. `v_retention_review` surfaces people untouched for 24 months with no live candidacy or deal, reviewed quarterly.

**Consequences.** A privacy notice for candidates is needed before systematic outreach at scale. Erasure is genuinely destructive by design.

---

## ADR-009: LinkedIn — no automation

**Context.** No sanctioned API exists for the data needed. Scraping risks the LinkedIn account, which is Offtake's primary BD asset.

**Decision.** LinkedIn data enters via official connection/data exports (CSV) and conversational manual capture ("add this profile"). No browser automation, no scraping tools, no third-party enrichment that violates LinkedIn terms.

**Consequences.** LinkedIn message history stays partially outside the system. Accepted.

---

## ADR-010: Phasing

**Phase 0 (now).** Schema deployed; operate through Supabase MCP; seed with the ~120-candidate pool, Kraken deal history, GeoPura and priority-target records.
**Phase 1.** Gmail + Granola ingestion pipelines, entity resolution live, embeddings live. Dedicated MCP server with typed tools becomes the sole write path.
**Phase 2.** Thin read-only Next.js UI: pipeline kanban, deal board, person pages, global search.
**Phase 3.** Proactive intelligence: weekly digest, relationship-decay alerts, candidate↔mandate matching, pre-call auto-briefings.

**Rule.** No phase starts until the previous one is in daily use. No feature ships that increases manual data entry.

---

## ADR-011: Ingestion scope — one mailbox, match-based creation (amends ADR-005)

**Context.** Matt's email estate spans multiple ventures including confidential journalism sources (Hymotive) and client work (OpenKit). A recruitment database must never ingest those. All recruiting flows through @offtakesearch.com, its own Google Workspace domain.

**Decision.** The **only** mailbox ever connected is the @offtakesearch.com account. No OAuth grant is ever issued for personal or other-venture accounts — the boundary is physical, not filtered. Within that mailbox, creation is match-based: an email links automatically only if a participant resolves to an existing person or a known company domain. Unknown counterparties never auto-create person records; they accumulate in `counterparty_queue` for a conversational "should I know this person?" review (approve → person created and history backfilled; ignore → never asked again). Granola meetings ingest only when at least one attendee resolves.

**Consequences.** The database stays clean by construction — no newsletter senders, no spam, no accidental source contamination. A small review habit replaces a large hygiene problem.

---

## ADR-012: Statutory retention carve-out (amends ADR-008)

**Context.** The Conduct of Employment Agencies Regulations 2003 require retention of certain placement records, and fee/contract documents carry ~6-year retention for tax and contract purposes. An erasure request does not override statutory retention. `erase_person` as written in 0001 would destroy legally required records for placed candidates.

**Decision.** Erasure becomes two-path (migration 0002). Never-placed people: full hard delete as before. Placed candidates: **redacted erasure** — identity fields stripped (name, emails, LinkedIn, location, profile, embedding), all documents and activity links removed, but the placement candidacy → mandate → fee lineage survives as an anonymised statutory record flagged `erased_at`. `v_statutory_purge` surfaces redacted records 6 years after placement for final hard deletion in the quarterly review. Suppression-list behaviour is unchanged — erased people are never re-ingested either way. Verify the current Conduct Regs position when drafting the privacy notice; the privacy notice must also name processors: Supabase, Google, Anthropic, Voyage.

**Consequences.** Legally defensible erasure. The quarterly retention review now has two lists: 24-month stale records and 6-year statutory purges.

---

## ADR-013: Operator contract — Claude's behavioral rules (extends ADR-003)

**Context.** Phase 0 gives Claude a service-role key: god mode over the crown jewels. ArbOS discipline applies.

**Decision.** Binding rules for any Claude instance operating SearchOS:
1. Destructive or irreversible operations (`erase_person`, `merge_people`, bulk deletes, stage regressions) are always confirmed conversationally before execution — stated plainly, with what will be lost.
2. Resolution always runs before creation. No person or company is created without first attempting match (email → LinkedIn → trigram) and checking `suppression_list`.
3. Schema changes only ever via numbered migration files committed to the repo. Never ad-hoc DDL against prod, even "just this once".
4. Every merge writes a full JSON snapshot of the removed record to `merge_log` before deletion — false merges are the one near-irreversible failure, so they must be recoverable.
5. Ingestion failures go to `ingestion_dead_letter`, never silently dropped.
6. A weekly hygiene review is a recurring task: pending merges, counterparty queue, dead letters, AI spend, freshness report.

**Consequences.** This section is copied into the MCP server's system context and any relevant skill files. It is the CRM's equivalent of EVERYTHING MATTERS.

---

## ADR-014: Infrastructure resilience

**Context.** Supabase free tier pauses inactive projects (fatal for cron pipelines). The IONOS episode is the standing argument against single points of platform failure. Gmail read access is a Google restricted scope. Granola's programmatic access is assumed but unproven.

**Decision.** Supabase Pro from day one (removes pausing, adds proper backups). Additionally, a nightly `pg_dump` to off-platform storage — the database is the business. The Gmail OAuth app is registered as **Internal** on the offtakesearch.com Workspace (no verification process, no 7-day token expiry). Phase 1 architecture work does not begin until a Granola access spike confirms scheduled export works as assumed — this is a gate, not a task.

**Consequences.** ~£25/month baseline platform cost. Accepted without discussion; it is the cheapest insurance in the whole system.

---

## ADR-015: AI cost discipline

**Context.** The pipeline calls paid APIs unattended. Steady-state volume (hundreds of emails, tens of meetings monthly) is genuinely cheap — realistically single-digit pounds per month. The risks are spiky backfills and runaway reprocessing loops, not steady state.

**Decision.**
1. **Subscription vs API split.** Interactive intelligence (briefs, matching, search, pipeline reviews) runs through the existing Claude subscription via MCP — zero marginal cost. Metered API spend is reserved for unattended pipeline work only.
2. **Cheap models for pipeline work.** Ingest summarisation uses Claude Haiku; embeddings use voyage-3.5 (both cost pennies at this volume). Larger models are never called unattended.
3. **Summarise once, store forever.** Idempotency via `source_ref` already guarantees no item is ever reprocessed. Long transcripts embed their summary, not their raw body.
4. **Backfill rules.** Historic import is capped at 12 months of email, runs through the Batch API (50% discount), and gets a cost estimate before execution.
5. **Visibility and limits.** Every API call logs to `ai_usage_log` (migration 0002); `v_ai_spend` shows monthly cost by provider. Alert at £20/month, hard stop at £50 — the pipeline pauses rather than spends past the cap. Reviewed in the weekly hygiene pass.

**Consequences.** Total system running cost (platform + AI) should sit around £30/month steady state. Any month it doesn't is a bug, not a bill.

---

## ADR-016: Build budget and definition of done

**Context.** The founder has form for concurrent ventures, and this project is seductive precisely because it is good. Kraken does not care about the schema.

**Decision.** Phase 0 gets two days. Phase 1 gets five. "Phase 1 done" is a BD-serving milestone, not a technical one: **every Kraken email and meeting auto-logged with zero manual entry.** If the budget blows, the project pauses — BD does not. No productisation of SearchOS (as a FieldOS vertical or otherwise) until it has been boringly reliable for its one user for a full quarter.

**Consequences.** The system earns its existence by serving the Kraken negotiation and the pipeline behind it, in that order.

---

## ADR-017: UI stack — Next.js + Tailwind + shadcn/ui (extends ADR-003)

**Context.** The Phase 2 read UI needs its component stack pinned now so nothing else creeps into the repo in the meantime.

**Decision.** Next.js App Router on Vercel, Tailwind, shadcn/ui components, living in `web/`. Dark theme built on the Offtake Search brand identity (near-black background, electric lime accent, Uncut Sans). The UI is strictly read-only, built against the views (`v_pipeline`, `v_deal_board`, `v_relationship_freshness`, `v_ai_spend`); every write continues to flow through MCP. Scaffolded with `create-next-app` + `shadcn init` when Phase 2 opens — not before.

**Consequences.** No UI code exists until Phase 1's definition of done is met. When it does, the component decisions are already made and the data contract (the views) is already stable.
