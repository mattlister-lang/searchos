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

---

## ADR-018: Pipeline AI deferred — interactive Claude is the sole intelligence layer (amends ADR-005, ADR-010)

**Context.** Matt's direction (3 Jul 2026): hold off on AI integrations. The goal is a first-class ATS/CRM that holds all the data and produces insight — not a metered pipeline. At current scale (hundreds of records) trigram search, structured SQL and Claude reading records interactively outperform embeddings anyway.

**Decision.** The Phase 1 ingestion pipeline (Gmail/Granola cron, Haiku summarisation, Voyage embeddings) is deferred indefinitely. The schema keeps its nullable `vector(1024)` columns and `ai_usage_log` — dormant, costing nothing. Data enters conversationally ("log this call with Amy") and via CSV import; all intelligence (briefs, matching, pipeline review, digests) runs through interactive Claude via MCP at zero marginal cost. SQL insight views (migration 0004) carry the reporting load. Plain Gmail sync *without* AI processing remains an available middle path later, inside the ADR-011 boundary, if manual capture proves tedious.

**Consequences.** Zero unattended API spend. The Granola spike (ADR-014 gate) is parked, not cancelled. Email history only enters the system when Matt logs it — accepted, revisitable.

---

## ADR-019: Productisation intent — deployment-per-firm, never shared-table tenancy

**Context.** Long-term, SearchOS will be sold to other recruitment firms as a multi-tenant SaaS. Each rec firm is its own GDPR data controller; candidate data isolation is existential in this market, and the compliance machinery (suppression, erasure, statutory retention) is legally per-controller.

**Decision.** SearchOS productises as **one deployment per client firm** — the same numbered migrations run into a fresh Supabase project per customer — never as rows-in-a-shared-database. No `tenant_id` is ever retrofitted onto this schema; the load-bearing global unique constraints (`person_email.email`, `company_domain.domain`, `(source, source_ref)`) stay as they are. The repo is the product template; Offtake's instance is customer zero and the permanent reference deployment. The MCP server (`docs/mcp-tools.md`) and the Phase 2 read UI are the product surface for customers. Firm-specific values (mailbox domain, sector taxonomy, stage labels) stay in data or MCP-layer config, never hardcoded.

**Consequences.** Strong isolation story to sell against shared-tenancy competitors; per-project Supabase pricing keeps unit economics legible. ADR-016's gate stands unchanged: no productisation until the system has been boringly reliable for its one user for a full quarter. Kraken first.

---

## ADR-020: Security & compliance baseline — build to certifiable standard

**Context.** The bar is a company that could pass SOC 2 Type II and ISO 27001 audits and sell to security-conscious firms. Those are *organisational* certifications — audits of processes over time, not code properties — and a company of one cannot meaningfully hold them yet. What it can do is build the technical controls and evidence trails now so that certification later is paperwork, not re-engineering. GDPR compliance, by contrast, applies in full today. OWASP practices apply to each attack surface as it comes into existence.

**Decision.**
1. **Access control.** Service-role-only access; RLS enabled on every table with no policies (migration 0003). Every new table enables RLS in the same migration that creates it. Secrets live in env vars only, never in the repo, never printed. The service role key and access tokens are rotated on any suspected exposure (precedent: DB password rotated 3 Jul 2026).
2. **Audit trail (SOC 2 change-tracking evidence).** Migration 0005 adds an append-only `audit_log` populated by row-change triggers on every business table. GDPR takes precedence over audit retention: `erase_person()` purges audit entries referencing the erased person — an audit log must never resurrect erased data. Merge recovery evidence stays in `merge_log`; erasure evidence is the suppression-list entry.
3. **Change management.** Schema changes only via numbered migrations through PRs (golden rule 3); behaviour tests run against a real Postgres before anything touches prod; Supabase security advisors run after every deploy and ERROR-level findings are fixed before the work is called done (precedent: 0003).
4. **GDPR (live obligations).** ICO registration before go-live; privacy notice naming processors (Supabase, Google, Anthropic, Voyage) before systematic outreach; erasure/suppression/statutory-retention machinery already in schema; quarterly retention review (`v_retention_review`, `v_statutory_purge`).
5. **Resilience.** The nightly off-platform backup (ADR-014) is a required control before any second firm's data is held; currently deferred by Matt for the single-tenant phase, revisit at go-live. Restore is tested before backup is called done.
6. **OWASP.** Applies per surface as built: parameterised SQL everywhere (already the case in scripts via tagged templates), dependency pinning, ASVS-aligned review for the MCP server and Phase 2 UI before they ship. No dynamic SQL in functions.
7. **ISO 9001 (quality).** Served by the existing discipline: ADRs as controlled decisions, migrations as controlled changes, behaviour tests as verification records, weekly hygiene as management review. No certification pursued until there is an organisation to certify.

**Consequences.** "Certifiable-by-construction" habits from day one at near-zero cost. When a prospective customer's security questionnaire arrives, the answers already exist in this file, the migration history, and the audit log.

---

## ADR-021: Phase 2 opened early — authenticated read-only UI on Vercel (amends ADR-017)

**Context.** ADR-017 gated the UI on Phase 1's definition of done; ADR-018 deferred Phase 1 indefinitely, leaving the gate incoherent. Matt's direction (3 Jul 2026): deploy the UI on Vercel now. ADR-019 independently makes the UI part of the product surface.

**Decision.** Phase 2 opens now. Stack as pinned in ADR-017: Next.js App Router on Vercel, Tailwind, shadcn/ui-style components in `web/`, Offtake dark theme. Strictly read-only against the views; every write continues through conversation/MCP. **Authentication is non-negotiable from the first deploy** (ADR-020): Supabase Auth magic-link sign-in, server-side email allowlist (initially `matt.lister@offtakesearch.com`), all data access server-side via the service-role key held only in Vercel server env — the browser never receives data credentials; RLS stays no-policies. Non-allowlisted sessions get 403 regardless of auth state.

**Consequences.** The UI is a viewer, not a second write path — the zero-manual-entry principle survives. Vercel env needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ALLOWED_EMAILS`. Supabase email signups should be disabled in the dashboard as belt-and-braces; the allowlist alone already denies access.

---

## ADR-022: The UI writes — through the operator contract (supersedes ADR-021's read-only clause; amends ADR-003)

**Context.** Lived verdict after first real use (3 Jul 2026): a read-only UI is not useful. Matt needs to enter data, read data, and get insight in one place. The product brief (`docs/product-brief.md`) requires full ATS/CRM interaction. ADR-003's "never through forms" bet is dead; what must survive is why it existed — data quality by construction.

**Decision.** The web app becomes a write surface, but **every write goes through the operator contract (ADR-013), implemented as server actions** — never raw table forms:
1. **Resolution before creation**: the add-person flow runs the ADR-006 chain (email → LinkedIn → trigram name+company) plus the suppression check server-side; ambiguous matches are shown to the operator to pick or consciously override. Same semantics as `scripts/lib/resolve.ts` and the MCP contract.
2. **Confirmation before consequence**: stage regressions and moves to `placed` require an explicit confirm step stating what follows (statutory clock). Merges and erasure remain conversational-only — never one click away.
3. **Nothing bypasses the audit trail** (automatic — 0005 triggers).
4. All actions run server-side behind `requireUser()` (allowlist) with validated inputs; the browser still never holds a data credential.
5. The server-action layer is the same domain logic the Phase 1 MCP server will expose — written once, shared later.

**Consequences.** "Zero manual data entry" is retired as dogma and survives as economics: ingestion (Phase D) remains the goal for what *can* auto-log; the UI makes what can't auto-log take seconds. `docs/mcp-tools.md` remains the contract vocabulary. CV/document upload lands in Supabase Storage (private bucket) with rows in `document`.

---

## ADR-023: The engineering contract and the learning discipline

**Context.** First real use (3 Jul 2026) exposed the cost of speed without structure: duplicated constants, eight hand-rolled sibling dialogs, untyped data access, tests outside the repo, no CI, entities without pages, nothing cross-linked. Matt's standard: a future-proofed, billion-dollar-SaaS-grade codebase a new developer or Claude session picks up cold — and an organisation that learns by contract, permanently.

**Decision.**
1. **`docs/engineering.md` is binding** exactly as ADRs are: the layer map, sources-of-truth rules, the shared form system, the no-third-copy rule, the information-architecture rules, the write-path contract, and the Definition of Done for every PR.
2. **`docs/learnings.md` is the append-only learning register.** Every mistake, surprise, reversal, or non-obvious decision is recorded — same day, same PR where possible — as: what happened → root cause → lesson → *where the rule now lives*. A learning that changes nothing written down is not learned. Repeating a recorded mistake is the one unforgivable defect. NO EXCEPTIONS.
3. **Decisions continue as numbered ADRs**, append-only. Learnings capture how we work; ADRs capture what we chose.
4. **Enforcement is mechanical wherever possible**: the behaviour test suite lives in `supabase/tests/` and runs in CI on every PR alongside typecheck and build; the PR template carries the DoD checklist including "learnings recorded"; CLAUDE.md directs every session to read the contract and the register before non-trivial work; the weekly hygiene review asks "any unrecorded learnings?".
5. **Plan before build** for anything non-trivial: layers touched, components reused, tests extended — written down before code. Velocity is not progress.

**Consequences.** Slightly slower feature starts; drastically cheaper feature N+1. The register is seeded with fourteen real entries from day one — the wisdom starts true, not aspirational.

---

## ADR-024: In-app AI — metered Claude API inside the product (supersedes part of ADR-018)

**Context.** Matt approved in-app AI (3 Jul 2026) to unlock CV-first candidate creation (product brief §10 I1): standardising the infinite variety of CV formats requires LLM structured extraction — heuristics cannot do it. Later consumers: match rationales, shortlist briefs, summaries.

**Decision.**
1. The web app may call the Claude API **server-side only** (`ANTHROPIC_API_KEY` in Vercel server env, never exposed to the browser, never in the repo). Model policy: the cheapest model that does the job — extraction starts on Haiku; anything needing more reasoning is justified per-feature in an ADR or the brief.
2. **ADR-015's cost discipline applies unchanged and is enforced in code**: every call is logged to `ai_usage_log` (provider, model, tokens, cost_gbp); before each call the current month's spend is checked — ≥ £50 the call is refused with a clear error (hard stop), ≥ £20 the response carries a warning (alert). `v_ai_spend` surfaces it; the weekly hygiene review reads it.
3. Interactive intelligence through Claude conversations stays free-tier-first: the app calls the API only where the product needs it *inside* the workflow (parsing a CV on upload), not as a general chat.
4. ADR-018's prohibition on **unattended pipeline** spend still stands — in-app calls are user-initiated actions, not cron jobs.

**Consequences.** CV extraction at pennies per document under hard caps. The person record becomes the standardised CV: extraction populates employment history, skills, seniority, summary — one uniform layout on the person page regardless of source formatting, original file always attached. Requires Matt to add `ANTHROPIC_API_KEY` to Vercel env.

---

## ADR-025: Apollo is the enrichment backbone — one-way, into SearchOS

**Context.** Matt reviewed the Apollo API surface (4 Jul 2026) and set the direction: "we enrich the data on my CRM from Apollo." Apollo exposes exactly the data the roadmap needs — organization enrichment (live), news article search, per-organization job postings, and people match with verified work emails — making it one vendor for enrichment, news, opportunity intelligence, and BD emails, with no scraping anywhere near ADR-009.

**Decision.**
1. **One-way flow: Apollo → SearchOS.** SearchOS remains the single system of record (ADR-001). Nothing is pushed to Apollo; Apollo's CRM surfaces (opportunities, sequences, tasks, contact stages) are not used. If that ever changes, it is a new ADR.
2. **`web/lib/apollo.ts` is the only module that talks to Apollo** (mirror of ADR-024's single-module rule for Claude). Server-side only; `APOLLO_API_KEY` in Vercel server env; graceful inert behaviour without the key.
3. **Credits are metered — ADR-015 discipline applies.** Every Apollo call is user-initiated (an explicit click); nothing unattended. Any future watch/refresh/digest (bulk enrich, scheduled postings checks) requires a further ADR naming its schedule, credit budget, and logging before it is built (same gate ADR-024 put on AI spend).
4. **Preview before write, append never clobber.** Fetched data is shown to Matt and written only on confirm; notes appends carry a dated source header. The Apollo organization id may be cached on `company` (migration 0011) so repeat lookups don't re-spend enrichment credits.
5. **Emails obey the existing safety rails.** A revealed email is checked against `suppression_list` before write (an erased person's address must never re-enter, ADR-008) and against `person_email` uniqueness (a claimed address belongs to exactly one person, ADR-006); the write is confirm-gated and audited. Lawful basis: B2B legitimate interest; rights honoured via `erase_person`.

**Consequences.** Company news costs Apollo credits, not AI tokens. Opportunity intelligence ("this client just posted a role — here are your matching candidates") becomes an API call plus the existing Boolean search — no scrapers, no ADR-009 tension. The R5 build: job-postings check with pool matching, company news, find-email — all behind explicit clicks.
