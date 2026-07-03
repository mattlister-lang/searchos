# SearchOS — Learning Register

**Append-only. Read at every session start (engineering.md §9). An entry is
not "learned" until it names where the rule now lives. Repeating a recorded
mistake is the one unforgivable defect (ADR-023).**

Format: `L-NNN · date · what happened → root cause → lesson → enforcement`.

---

**L-001 · 2026-07-03 · Domain constants triplicated.**
`STAGE_ORDER` was defined in `lib/format.ts`, `lib/actions.ts`, and
`pipeline-forms.tsx` within one day of UI work. → Features were built by
copying the nearest file instead of asking where the constant belongs. →
One concept, one definition, imported everywhere. → `lib/domain.ts` is the
only home for domain constants (engineering.md §2); duplication is a defect.

**L-002 · 2026-07-03 · The test suite lived outside the repo.**
Fourteen behaviour tests protecting statutory-erasure logic sat in a session
scratch directory; no other session or developer could find or run them. →
Tests were treated as a verification step, not an artifact. → Tests are code;
code lives in the repo. → `supabase/tests/behaviour_tests.sql` + CI runs them
on every PR (engineering.md §6).

**L-003 · 2026-07-03 · Eight hand-rolled sibling dialogs.**
Every form dialog re-implemented pending/error/submit state by hand. → Each
feature was built "on top of whatever" without extracting the pattern after
the second occurrence. → Second occurrence = extract; third hand-roll =
defect. → The shared form system + no-third-copy rule (engineering.md §3).

**L-004 · 2026-07-03 · Mandates invisible on the pipeline page.**
The pipeline rendered candidacies only, so an open mandate with no
candidates didn't exist anywhere in the UI; entities had no pages and
nothing cross-linked. Matt found it in first real use. → Pages were built
around tables, not around how the work flows; "empty" rows carry
information too. → Every entity gets a page; every reference is a link;
empty-but-real rows are shown. → engineering.md §4; jobs/company pages in
the foundation refactor.

**L-005 · 2026-07-03 · Enum values added in the DB but unusable in the app.**
Migration 0006 added `linkedin_post`/`event` activity types; the action's
zod schema and the dialog weren't updated, so the feature shipped unusable.
Caught by self-review, not by process. → Schema and app layers were changed
in separate motions with no rule binding them. → A migration touching values
the app sends updates domain.ts + zod + UI in the same PR. →
engineering.md §5; DoD checklist item.

**L-006 · 2026-07-03 · Sandboxes cannot reach Postgres over TCP.**
Hours lost across three attempts (connection strings, poolers, regions)
before testing the network path itself. → Assumed credentials were the
blocker when the egress policy was. → Verify the transport before debugging
credentials; in Claude sandboxes the database is HTTPS-only. → Deploys go
via the Management API migrations endpoint (CLAUDE.md phase notes;
engineering.md §6).

**L-007 · 2026-07-03 · Env vars inject at session start, values need shape-checks.**
`SUPABASE_DB_URL` was first absent (added mid-session), then a project URL,
then a half-pasted fragment — and a psql error echoed part of a password
into logs. → Assumed presence and correctness of secrets; printed error
output unfiltered. → Check existence AND shape (length/scheme) before use;
never let raw connection errors print; rotate anything that leaks. →
Preflight checks in deploy routine; password was rotated same day.

**L-008 · 2026-07-03 · Magic-link auth built for the wrong flow.**
`/auth/confirm` handled only `token_hash` links; Supabase's default email
sends PKCE `?code=`. First real login failed. → Implemented from the
customised-template docs without checking what the default template sends. →
Handle both arrival formats; test auth against the provider's DEFAULTS, not
its ideal configuration. → Route handles both (PR #3); UAT-on-deploy is in
the DoD.

**L-009 · 2026-07-03 · Merge violated the one-primary-email index.**
`merge_people` moved both people's primary emails onto the kept person;
the partial unique index rejected it. Caught by the behaviour tests before
deploy. → Wrote the migration against the happy path. → Uniqueness
constraints are merge-time collision points — enumerate them when writing
any merge/repoint logic; behaviour tests earn their keep. → Demote-then-move
in 0001; tests are mandatory per migration (engineering.md §6).

**L-010 · 2026-07-03 · Audit log nearly resurrected erased data.**
Sole-participant activities deleted during erasure left their full content
in `audit_log.old_row` — the activity table carries no person_id for the
purge to match. → Generic audit + GDPR erasure interact in non-obvious ways;
the purge matched columns, not meaning. → When two invariants meet
("audit everything" vs "erasure leaves nothing"), enumerate the join paths
explicitly; the stricter invariant wins (GDPR > audit retention). →
erase_person tracks sole-activity ids for the purge (0005); tests 6c/9.

**L-011 · 2026-07-03 · Correlated subquery against a grouped column.**
First draft of `v_sales_board` referenced a raw column inside subqueries
under GROUP BY — invalid SQL that would have failed at deploy. → Wrote
"clever" SQL instead of boring CTEs. → Aggregate in CTEs, join the results;
if a view needs a subquery per row, restructure. → CTE form shipped;
"boring SQL" is ADR-002 doctrine.

**L-012 · 2026-07-03 · Test fixtures used invalid UUIDs.**
Fixture ids like `...p001` failed — `p` isn't hex. → Convenience labels
chosen without checking the type's alphabet. → Fixture ids use hex-only
letters (a-f). → behaviour_tests fixtures.

**L-013 · 2026-07-03 · Built in the wrong directory.**
`next build` ran from `components/forms/` after a `cd` in a compound
command and reported a missing app directory. → Shell state assumptions
across compound commands. → Builds run with explicit absolute paths /
fresh cd to the app root. → Habit + CI makes local builds non-authoritative.

**L-014 · 2026-07-03 · Features shipped ahead of planning.**
Phases A/B were built fast on Matt's "go", but without an architecture pass:
no typed data layer, no shared form system, no IA design — Matt's verdict:
"a CRUD database, nothing links together, plan this properly." → Velocity
was mistaken for progress; the brief's ambition (billion-dollar-SaaS
standard) demands design before build. → Non-trivial work gets a written
plan naming layers, reuse, tests BEFORE code; the engineering contract is
the enforcement. → engineering.md §9(4); ADR-023; this register.

**L-015 · 2026-07-03 · Casts were hiding a dozen latent null bugs.**
Typing the client against the generated schema surfaced ~10 sites where
view columns (all nullable in typegen) were rendered or indexed without
null-guards — previously masked by `as unknown as` casts. → Casting to
hand-written interfaces asserts wishes, not facts. → Generated types are
the only source of row shapes; view fields are always nullable and must be
guarded at render. → database.types.ts + typed client; regeneration is in
the DoD; TypeScript now fails the build on the next violation.

**L-016 · 2026-07-03 · A bare `cat >>` silently hung a compound deploy step.**
A stray `cat >> file` with no input source blocked on stdin inside a
compound command; everything after it (local tests, live deploy, typegen)
silently never ran, and the step "failed" only by timeout. → Compound shell
steps hide which command is at fault, and stdin-reading commands hang
forever in non-interactive shells. → Never bare `cat`/`read` in scripted
steps; prefer heredocs/explicit files; after any timeout, verify what
actually executed before retrying. → This register; deploy steps split
into verifiable stages.

**L-017 · 2026-07-03 · `next build` green but eslint red on new typeahead effects.**
The first debounced-search effects (PersonPicker, HeaderSearch, UAT R1) cleared
their results with a synchronous `setState` in the effect body on the
too-short-query branch; `next build` passed clean, but `eslint` errored with
`react-hooks/set-state-in-effect` ("calling setState synchronously within an
effect can trigger cascading renders"). → `next build` typechecks but does not
run the react-hooks lint rules — the lint gate is separate and stricter than
the build. → Run `npx eslint` on touched files before "done", not just the
build; inside an effect, do state resets after the async boundary (inside the
awaited IIFE), never directly in the effect body. → engineering.md §6 names
build+typecheck as the floor; treat `eslint` (react-hooks) as an additional
gate and lint the changed files every PR. (Note: pre-existing
`no-explicit-any` errors already sit in `people/[id]/page.tsx` — separate debt,
untouched here.)

**L-018 · 2026-07-03 · Typed client can't express an array-column "not empty" filter.**
`suggestTags` (Q6) first tried `.neq("skills", "{}")` to skip empty arrays
before flattening; `next build` failed typecheck — the generated types model a
`string[]` column's `.neq` value as `string[]`, so the `'{}'` literal PostgREST
actually needs is rejected, and passing `[]` instead would string-interpolate to
an empty value (`skills=neq.`), not `{}`. → supabase-js `.eq/.neq` build the
querystring by interpolation and the generated types don't model the array
literal syntax, so there is no type-safe way to write `<> '{}'` without a banned
`as unknown as` cast. → For array columns don't reach for `.eq/.neq` with
literals; use the set operators (`.contains/.overlaps`, which format `{}`
correctly — as the Q3 sector filters do) or filter in TS. Here the guard was a
pure ≤200-row optimisation, so fetch-and-dedupe in TS is both correct and
simpler. → `suggestTags` flattens/dedupes/prefix-filters in TS (lib/actions.ts);
this register.
