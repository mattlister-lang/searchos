# SearchOS — CLAUDE.md

Recruitment/exec search CRM+ATS for Offtake Search (Hy Works Ltd). Single-tenant,
MCP-first, zero manual data entry. Supabase Postgres is a deliberately boring
system of record; all intelligence lives in the layer around the database, never in it.

**Read `docs/adrs.md` before any non-trivial work. ADRs 001–025 are binding until
superseded by a numbered ADR. Do not improvise around them.**
**Equally binding (ADR-023): `docs/engineering.md` (the engineering contract)
and `docs/learnings.md` (the learning register — the scar tissue). Read all
three before non-trivial work. Every mistake, surprise, reversal or
non-obvious decision gets a learnings entry naming its enforcement point —
same day, no exceptions. Repeating a recorded mistake is the one unforgivable
defect. Plan before build: layers, reuse, tests — written down first.**
**Operating routines live in `docs/playbook.md`.**

## Golden rules — the operator contract (ADR-013)

1. Destructive or irreversible operations (`erase_person`, `merge_people`, bulk
   deletes, candidacy stage regressions) are ALWAYS confirmed with Matt before
   execution, stating plainly what will be lost.
2. Resolution before creation. Never create a person or company without first
   attempting a match (email → LinkedIn URL → trigram name via `similar_people`)
   and checking `suppression_list`.
3. Schema changes ONLY via numbered migration files in `supabase/migrations/`,
   applied with `supabase db push`. Never ad-hoc DDL against prod. No exceptions,
   including "just this once".
4. Merges only ever via `merge_people()` (it snapshots to `merge_log`). Never
   hand-rolled UPDATE/DELETE merges.
5. Ingestion failures go to `ingestion_dead_letter`. Nothing is silently dropped.
6. EVERYTHING MATTERS. If a shortcut feels convenient, it is wrong.

## Non-negotiable boundaries

- Only the @offtakesearch.com mailbox is ever connected (ADR-011). Never request,
  configure, or code access to any other account.
- Unknown counterparties go to `counterparty_queue` for Matt's review. Never
  auto-create person records from unmatched email participants.
- No LinkedIn scraping or automation of any kind (ADR-009). CSV exports and
  conversational capture only.
- Placed candidates get redacted erasure, never full deletion (ADR-012).
  `erase_person()` handles both paths — use it.

## Pipeline data rules

- Identities are parsed from email **headers only**, never bodies — forwarded
  mail contains third parties who never consented to being in this database.
- Generic mailboxes (info@, hello@, talent@, careers@) never become people.
  Link the activity to the company instead; `person_email` uniqueness means a
  shared address wrongly claimed by one person poisons resolution forever.
- CSV import rows without an email need a LinkedIn URL or a confident
  name+company match; otherwise they queue for review. Never blind-create.
- The `placed` candidacy stage is reserved for true placements — it triggers
  statutory-retention behaviour in `erase_person()`. Never use it as shorthand
  when importing historical data.

## Stack (pinned — see ADRs 002, 007, 015, 017)

- Supabase Postgres + pgvector + Storage. Single project, Pro tier.
- Interface: MCP. Interactive work through Claude (subscription, zero marginal
  cost); a dedicated TypeScript MCP server in `mcp-server/` becomes the sole
  write path in Phase 1. Tool contract: `docs/mcp-tools.md`.
- Pipeline AI: DEFERRED (ADR-018). No unattended API spend; all intelligence
  runs through interactive Claude via MCP and the SQL insight views (0004).
  If the pipeline is ever switched on: Haiku for summarisation, Voyage
  voyage-3.5 (1024 dims) for embeddings, every call logged to `ai_usage_log`,
  £20/month alert, £50 hard stop.
- UI (read-write per ADR-022): Next.js App Router + Tailwind + shadcn/ui
  (preset b3XnzjREIK: base-vega, neutral, Public Sans/Geist) in `web/` on
  Vercel. Reads from the views; writes ONLY through contract server actions
  (resolution before creation, confirm-before-consequence); magic-link auth +
  server-side email allowlist; the service-role key lives only in Vercel
  server env.

## Repo layout

```
searchos/
├── CLAUDE.md
├── docs/
│   ├── adrs.md              # binding decisions, append-only
│   ├── engineering.md       # the engineering contract (ADR-023, binding)
│   ├── learnings.md         # learning register, append-only (ADR-023)
│   ├── product-brief.md     # what the product is becoming
│   ├── playbook.md          # operating routines
│   └── mcp-tools.md         # MCP tool surface contract
├── supabase/
│   ├── migrations/          # numbered, forward-only
│   ├── tests/               # behaviour tests — run in CI on every PR
│   └── functions/           # edge functions (deferred ingestion)
├── mcp-server/              # TypeScript MCP server (future)
├── scripts/                 # seed, CSV import, pg_dump backup
└── web/                     # read-write UI (ADR-022)
```

## Phase status

**Phase 0 — in progress. Budget: 2 days.**
- [x] Migrations 0001 (core schema), 0002 (operational hardening), 0003
      (security hardening: RLS-on/no-policies, invoker views, pinned function
      search paths), 0004 (insight views) and 0005 (audit log + GDPR-correct
      erasure purge) written and verified against local Postgres + pgvector
      (13 behaviour tests incl. `merge_people`, `erase_person` both paths,
      audit purge, `similar_people`, triggers)
- [x] Deployed to the Pro project 3 Jul 2026 (Postgres 17, eu-central-1) and
      recorded in `schema_migrations`. Note: Claude sandboxes cannot reach
      Postgres over TCP — deploys go via the Supabase Management API
      migrations endpoint (equivalent to `db push`), authenticated by the
      `SUPABASE_ACCESS_TOKEN` env var. Security advisors clean (INFO-level
      `rls_enabled_no_policy` is the intended service-role-only design)
- [x] Seed live: Matt (operator), Amy Park / Talent Lead / kraken.tech,
      Theo Elmer (name-only), Kraken deal (negotiation), GeoPura deal
      (qualified), domains offtakesearch.com + kraken.tech. Verified
      idempotent. Still to confirm conversationally: Matt's LinkedIn, Theo's
      email, GeoPura domain + deal stage, priority-target list
- [ ] Candidate pool CSV import — no CSV exists today; `scripts/import-csv.ts`
      is ready for a future LinkedIn export (dry-run first:
      `npm run import-csv -- pool.csv`, then `--commit`)
- [ ] Nightly `pg_dump` backup (ADR-014) — deferred by Matt (3 Jul 2026);
      `.github/workflows/backup.yml` is ready when wanted: create the R2
      bucket (or swap vendor) and add the repo secrets named in its header

**Current phase — Operate (ADR-018):** the pipeline is deferred; data enters
conversationally and via CSV, intelligence comes from Claude + the insight
views (`v_next_actions`, `v_funnel`, `v_stage_dwell`, `v_activity_pulse`,
`v_fee_income`), every mutation lands in `audit_log` (ADR-020). Migrations
0001–0009 are live on the Pro project (0008: standardised-CV storage, AI
cost-guard scalar, Boolean people search; 0009: function search paths repinned
to include `extensions` — the erase_person/pgcrypto prod fix, L-021/L-024).
In-app AI is live per ADR-024: CV parsing runs on Haiku via `web/lib/ai.ts`
(the only Claude API module) once `ANTHROPIC_API_KEY` is set in Vercel server
env; every call is logged to `ai_usage_log` under the £20 alert / £50 hard
stop. Apollo company enrichment (`web/lib/apollo.ts`, the only Apollo module)
activates the company-page Enrich button once `APOLLO_API_KEY` is set in
Vercel server env — fetch is an explicit click (credits are metered), preview
before write, appends to notes only.
**Long term (ADR-019):** productise as deployment-per-firm SaaS — never
shared-table tenancy, no `tenant_id` retrofit. ADR-016's gate stands: boringly
reliable for one user for a full quarter first.
**If the pipeline is revived:** the Granola access spike (ADR-014) gates any
pipeline architecture; "done" = every Kraken email and meeting auto-logged
with zero manual entry (ADR-016).

**Weekly hygiene review (recurring):** pending merges, counterparty queue,
dead letters, `v_ai_spend`, freshness report.

## Secrets

`.env` only, gitignored: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`ANTHROPIC_API_KEY`, `APOLLO_API_KEY`, `VOYAGE_API_KEY`. Never committed,
never printed in output or logs, never hardcoded. The service role key is god
mode — treat it accordingly.
