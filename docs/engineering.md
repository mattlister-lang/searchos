# SearchOS — Engineering Contract

**Binding, like the ADRs (ADR-023).** Every session — human or Claude — reads
this and `docs/learnings.md` before non-trivial work. The bar is a codebase a
new developer picks up in an afternoon: one way to do each thing, written
down, enforced by tooling where tooling can enforce it.

---

## 1. Architecture — the layer map

```
supabase/migrations/   Schema. Numbered, forward-only, tested before deploy
                       (golden rule 3). Every table: RLS on, audit trigger,
                       updated_at trigger.
supabase/tests/        behaviour_tests.sql — the schema's test suite. Lives
                       IN THE REPO (L-002). Extended with every migration.
web/lib/database.types.ts  GENERATED from the live schema (Management API
                       typegen) after every migration. Never hand-edited.
web/lib/domain.ts      Single source of truth for domain constants: stages,
                       taxonomies, statuses, labels, orderings. The ONLY
                       place they are defined (L-001).
web/lib/db.ts          The one service-role client, typed with Database.
web/lib/resolve.ts     Entity resolution (ADR-006). Same semantics as
                       scripts/lib/resolve.ts and the MCP contract.
web/lib/actions.ts     ALL writes. Server actions implementing the operator
                       contract (ADR-022): requireUser() first line, zod
                       validation, resolution-before-creation,
                       confirm-before-consequence. Merges/erasure excluded
                       by design — conversational only.
web/components/ui/     shadcn primitives (preset b3XnzjREIK). Added via the
                       shadcn CLI only — never hand-written lookalikes.
web/components/forms/  Feature forms built ON the shared form system (§3).
web/app/(app)/         Pages. Server components; read via typed client and
                       views; no business logic in JSX — compute in the page
                       function or a lib helper.
```

**Rule of altitude:** pages read, actions write, lib decides, schema stores.
Anything crossing layers (a page doing validation, an action rendering
strings for UI) is a defect.

## 2. Sources of truth — never a second copy

- Domain constants: `lib/domain.ts` only. Importing is mandatory; redefining
  is a defect. (This rule exists because `STAGE_ORDER` reached three copies
  in one day — L-001.)
- DB row shapes: `database.types.ts`. A cast like `as unknown as X` marks a
  missing type, not a solution — regenerate types or fix the query.
- Regenerate types in the same PR as any migration. CI fails if they drift.
- Validation lists (sectors, seniority) live in `lib/domain.ts` and are the
  same values the MCP layer will use.

## 3. The form system — one pattern, zero hand-rolls

All dialogs/forms use the shared machinery:
- `useActionForm(action, initialState)` — owns pending/error/result state,
  submit, reset-on-success, router.refresh.
- `<FormDialog>` — trigger, title, content slot, error display, submit
  button with pending label.
- Field components from `components/ui` only.

**The no-third-copy rule:** the first time a pattern appears, build it
inline. The second time, EXTRACT it into shared machinery and refactor the
first use. A third hand-rolled copy is a defect. (Eight sibling dialogs were
hand-rolled before this rule existed — L-003.)

## 4. Information architecture — everything links

- Every entity with meaning has a page: person, company, **job (mandate)**,
  deal board, billings. No orphan entities (mandates had no page and were
  invisible on the pipeline — L-004).
- Every entity name rendered anywhere is a link to its page. A bare string
  where a link belongs is a defect.
- List pages must show rows that are empty-but-real (an open mandate with no
  candidates yet is still shown — absence of children is information).
- Global search in the header spans people, companies, jobs, deals.

## 5. Writes — the operator contract in code

Every server action, in order:
1. `await requireUser()` — no exceptions, first line.
2. `zod` parse — reject, never coerce silently.
3. Resolution before creation for people/companies (lib/resolve.ts).
4. Confirm-before-consequence: destructive or statutory-relevant transitions
   return `needsConfirm` and require an explicit confirmed re-call.
5. Writes through the typed client; audit lands via triggers automatically.
6. `revalidatePath` for affected routes.

After ANY migration adding enum values or columns the action layer uses:
update `lib/domain.ts`, the zod schemas, and the UI in the same PR — the
database accepting values the app cannot send is a defect (L-005).

## 6. Testing & verification

- Schema behaviour tests: `supabase/tests/behaviour_tests.sql`, run against
  disposable Postgres (pgvector image or local cluster) — extended in the
  same PR as every migration, green before live deploy.
- Web: `next build` green + typecheck is the floor. Actions with branching
  contract logic (resolution outcomes, confirm flows, boarding rule) get
  unit tests as the codebase grows.
- Live deploys: Management API migrations endpoint (sandboxes cannot reach
  Postgres over TCP — L-006), recorded in `schema_migrations`, followed by
  a security-advisors check. ERROR-level findings block "done".
- UAT for UI changes: the deployed app, by Matt, before the next feature
  stacks on top.

## 7. Definition of Done — every PR

- [ ] Reuse check done: no new pattern where a shared one exists; second
      occurrences extracted
- [ ] Domain constants from `lib/domain.ts`; no new duplication
- [ ] Migration? → behaviour tests extended + green locally; types
      regenerated; deployed via Management API; advisors clean
- [ ] Cross-links added for any new entity/reference
- [ ] `next build` + typecheck green; auth gate unaffected
- [ ] **Learnings recorded in `docs/learnings.md`** — or the PR states
      "no learnings" and why
- [ ] CLAUDE.md / engineering.md updated if behaviour or conventions changed

## 8. The learning discipline (ADR-023 — NO EXCEPTIONS)

We are building wisdom, not just software. Fail fast, learn quick, and the
learnings STAY.

- **Every mistake, surprise, reversal, or non-obvious decision gets an entry
  in `docs/learnings.md`** — same day, same PR where possible. Format:
  what happened → root cause → the lesson → where the rule now lives
  (engineering.md §, ADR, CI, or code).
- A learning that doesn't change something written down isn't learned yet.
  Every entry names its enforcement point.
- Decisions of consequence continue as numbered ADRs — append-only, binding.
- Repeating a recorded mistake is the one unforgivable defect. The register
  is read at session start precisely so this cannot happen innocently.
- The weekly hygiene review includes: any unrecorded learnings from the week?

## 9. Session bootstrap (Claude or human)

1. Read `CLAUDE.md` → `docs/adrs.md` (binding decisions) →
   `docs/engineering.md` (this) → `docs/learnings.md` (the scar tissue).
2. Check `docs/product-brief.md` for what the product is becoming.
3. Before building: search `web/components/forms/` and `lib/` for the
   pattern you're about to write. It probably exists.
4. Plan before code for anything non-trivial: name the layers touched, the
   components reused, the tests extended. Building without a plan is how
   this document came to exist.
