# SearchOS — CLAUDE.md

Recruitment/exec search CRM+ATS for Offtake Search (Hy Works Ltd). Single-tenant,
MCP-first, zero manual data entry. Supabase Postgres is a deliberately boring
system of record; all intelligence lives in the layer around the database, never in it.

**Read `docs/adrs.md` before any non-trivial work. ADRs 001–017 are binding until
superseded by a numbered ADR. Do not improvise around them.**

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
- Pipeline AI: Claude Haiku for unattended summarisation; Voyage voyage-3.5
  (1024 dims) for embeddings. Every unattended API call logs to `ai_usage_log`.
  Budget: £20/month alert, £50 hard stop — pause the pipeline, don't spend past it.
- UI (Phase 2 only, ADR-017): Next.js App Router + Tailwind + shadcn/ui in
  `web/`, read-only against the views, Offtake brand dark theme. Do not scaffold
  before Phase 1's definition of done is met.

## Repo layout

```
searchos/
├── CLAUDE.md
├── docs/
│   ├── adrs.md              # binding decisions, append-only
│   └── mcp-tools.md         # MCP tool surface contract
├── supabase/
│   ├── migrations/          # numbered, forward-only
│   └── functions/           # edge functions (Phase 1 ingestion)
├── mcp-server/              # TypeScript MCP server (Phase 1)
├── scripts/                 # seed, CSV import, pg_dump backup
└── web/                     # Phase 2 UI — empty until then
```

## Phase status

**Phase 0 — in progress. Budget: 2 days.**
- [x] Migrations 0001 (core schema) and 0002 (operational hardening) written
      and verified against Postgres 16 + pgvector (behaviour tests for
      `merge_people`, `erase_person` both paths, `similar_people`, triggers)
- [ ] `supabase link` + `supabase db push` against the Pro project
- [ ] Seed: Kraken deal + Amy Park, GeoPura + Theo Elmer, priority targets,
      Matt's own person record — `scripts/seed.ts` is ready; fill the
      PLACEHOLDER block with real details, then `npm run seed`
- [ ] Candidate pool CSV import (~120 records; resolution + suppression rules
      apply to every row) — `scripts/import-csv.ts` is ready; dry-run first:
      `npm run import-csv -- pool.csv`, then `--commit`
- [ ] Nightly `pg_dump` backup via GitHub Actions cron to private storage
      (ADR-014) — `.github/workflows/backup.yml` is ready; create the R2
      bucket (or swap vendor) and add the repo secrets named in its header

**Phase 1 gate:** a Granola access spike must pass before any pipeline
architecture is written (ADR-014).
**Phase 1 done =** every Kraken email and meeting auto-logged with zero manual
entry (ADR-016). That is the only definition that counts.

**Weekly hygiene review (recurring):** pending merges, counterparty queue,
dead letters, `v_ai_spend`, freshness report.

## Secrets

`.env` only, gitignored: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`. Never committed, never printed in
output or logs, never hardcoded. The service role key is god mode — treat it
accordingly.
