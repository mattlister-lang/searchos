# SearchOS — Operating Playbook

How the system is driven day to day (ADR-018: conversation is the interface;
SQL views carry the reporting; zero unattended AI spend). Every routine below
is a one-line ask to Claude. The operator contract (ADR-013) applies to all
of them: resolution before creation, confirmation before anything
destructive, nothing silently dropped.

## Daily

**"Morning brief"** — reads `v_next_actions` (deals missing a next step,
candidacies stalled >14 days, live relationships going stale >90 days),
`v_stage_dwell`, and recent `activity`; returns a short list of decisions,
not data.

**"Pre-call brief on <person>"** — resolves the person, reads their
employment, candidacies, deals, full activity history and documents; returns
who they are, where things stand, open threads, and what to get from the
call.

**"Log this call with <person>: <notes>"** — resolves participants
(never auto-creates; unknowns are queued), writes an `activity`
(`source='manual'`, generated ref), links company/deal/mandate where clear.

**"Add <person> — <context>"** — runs the resolution chain
(email → LinkedIn → trigram name+company) and the suppression check before
any insert; ambiguous matches come back as questions, not records.

## Pipeline

**"Move <person> to <stage> on <mandate>"** — forward moves apply
immediately (`stage_changed_at`/`placed_at` are trigger-maintained);
regressions and anything touching `placed` are confirmed first, stating
consequences (statutory clock, ADR-012).

**"Pipeline review"** — `v_funnel` + `v_stage_dwell` per open mandate:
where candidates are bunching, what's stale, what moved this week.

**"Deal board"** — `v_deal_board` + `v_activity_pulse`: every open deal,
its next step, and whether contact volume is cooling.

## Weekly hygiene (recurring — CLAUDE.md)

**"Weekly hygiene review"** — in one pass:
- pending merges (`merge_queue`)
- counterparty queue (approve → person created with history; ignore → never
  asked again)
- dead letters (`ingestion_dead_letter`)
- AI spend (`v_ai_spend` — should be £0 while ADR-018 holds)
- freshness (`v_relationship_freshness`, worst first)

## Quarterly

**"Retention review"** — `v_retention_review` (24-month untouched, no live
candidacy/deal — candidates for erasure) and `v_statutory_purge` (redacted
placements past 6 years — candidates for final hard delete). Every erasure
is confirmed conversationally and executed only via `erase_person()`.

## Bulk

- Candidate CSV: `npm run import-csv -- pool.csv` (dry-run, review the
  disposition report), then `--commit`. Requires direct DB access — run from
  a machine that can reach Postgres, not a Claude sandbox.
- Seed top-ups: edit the data block in `scripts/seed.ts`, re-run — it is
  idempotent.

## How writes happen (until the Phase 1 MCP server exists)

Claude operates the live database over the Supabase Management API / MCP
(HTTPS — sandboxes cannot reach Postgres directly). Every mutation lands in
`audit_log` via triggers (ADR-020). Schema changes remain migrations-only,
golden rule 3, no exceptions.
