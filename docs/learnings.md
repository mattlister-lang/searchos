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

**L-019 · 2026-07-03 · Boolean people search built on-the-fly, not materialised.**
R3/I3 wanted full-text people search over name + skills/functions/sectors + CV
`parsed_text`. The tempting "proper" answer is a stored `person.search_tsv`
tsvector with a GIN index — but the CV text lives in a *child* table
(`document`), so keeping that column fresh needs triggers on both `person` and
`document` (including document reassignment), i.e. real denormalisation and a
staleness surface, for a pool of hundreds (ADR-018 says a scan wins at this
scale). → Reached for the scalable pattern before the scale existed; ADR-002
says boring first. → `search_people_boolean(q)` builds the weighted vector in a
CTE per query — no column, no triggers, no staleness; materialise + GIN only if
the pool outgrows a scan, and the RPC signature stays identical so no caller
changes. → Migration 0008 header + function comment; behaviour test 13.

**L-020 · 2026-07-03 · A new jsonb column can smuggle identifying data past erasure — check the audit path.**
I1 adds `document.parsed_cv` holding a person's standardised CV (name, emails,
history). The `document` audit trigger (0005) captures whole rows, so parsed_cv
lands in `audit_log` — exactly the "audit vs erasure" collision L-010 burned us
on. → New columns on audited tables inherit the audit/erasure interaction and
must be re-verified, not assumed. → Confirmed no `erase_person` change is
needed: document audit rows carry `person_id`, which the existing purge already
matches (`old_row/new_row ->> 'person_id'`), so parsed_cv is purged with the
person on both paths. → Behaviour test 14 proves it end-to-end (insert CV →
erase → zero audit references); engineering.md §6 (tests earn their keep).

**L-021 · 2026-07-03 · `erase_person` was latently broken on prod: pinned search paths vs the `extensions` schema.**
While replicating prod's extension layout locally (pgcrypto pre-installed by
Supabase in the `extensions` schema; citext/pg_trgm/vector created by 0001 into
public), the behaviour suite failed inside `erase_person`: `digest()` — the
pgcrypto function that hashes emails into `suppression_list` — resolves nowhere
under 0003's pinned `search_path = public, pg_temp`. The GDPR-critical erasure
path would have thrown on its first real use on prod. → Two compounding causes:
(1) 0003 pinned search paths to satisfy the mutable-search-path advisor without
asking what schemas the function bodies actually resolve from on *prod*;
(2) CI's plain pgvector image installs pgcrypto into public, so the suite could
never see the difference — a test environment that is shaped differently from
prod silently certifies broken code. → Fix in 0009: repin every function to
`public, extensions, pg_temp` (Postgres skips nonexistent schemas, so this is
safe where extensions live in public and correct on prod). → Enforcement: CI
now creates the `extensions` schema and installs pgcrypto there before applying
migrations (ci.yml "Mirror prod extension layout" step), so any function that
forgets `extensions` in its pin fails in CI exactly as it would on prod; this
register.

**L-024 · 2026-07-03 · Mirroring prod means the defaults too, not just the objects.**
The L-021 CI step created the `extensions` schema but the very next CI run
failed anyway — in the behaviour-test FILE this time, whose bare `digest()`
call couldn't resolve under CI's stock `"$user", public` search path. On prod
that same bare call works, because Supabase sets the DATABASE default
search_path to `"$user", public, extensions` (verified by read-back); the local
gate replica passed only because it happened to set the same default. → An
environment mirror that copies objects but not settings still diverges — the
first fix reproduced prod's schema layout while silently keeping CI's stock
search path. → When mirroring an environment, read the target's actual settings
(`current_setting`, `pg_db_role_setting`) and replicate them, rather than
stopping at the objects. → ci.yml's mirror step now also sets the database
default search_path to prod's exact value; this register.

**L-025 · 2026-07-04 · A client-module export called from a server page passes the build and dies on the first real request.**
R2's `toOptions()` lived in filter-bar.tsx (`"use client"`) and the four list
pages called it during server render. In production every one of those pages
threw "Attempted to call toOptions() from the server but toOptions is on the
client" — Matt found it in UAT; search and dashboard (no FilterBar) worked, so
half the app was down while the build stayed green. → Calling (not rendering)
a client-module export from a server component is an RSC boundary violation
that only materialises AT REQUEST TIME on force-dynamic pages — `next build`
renders nothing dynamic, so the gate's independent build proves compilation,
not that pages serve. → Client modules export components and hooks ONLY;
pure helpers live in lib/ (server-safe) even when they feel like they belong
next to the component. And build-green is not page-serves — post-deploy, load
every changed route once (Vercel runtime logs via get_runtime_errors make the
failure obvious in seconds). → toOptions moved to lib/domain.ts; the sweep
(grep client modules for non-component exports) found no other instance;
engineering.md DoD gains a "changed routes load after deploy" check; this
register.

**L-022 · 2026-07-03 · The AI-call log and its subject artifact can't be created in the same moment.**
ADR-024 wants every `ai_usage_log` row to carry `source_ref` = the document id,
but I1's whole design is that the CV parse happens BEFORE anything exists — the
JSON pre-fills a dialog and the operator may never confirm, so at call time
there is no document (and creating one pre-confirm would strand personal data
outside the erasure machinery, since `erase_person` purges documents by
`person_id`). → Two contract clauses ("source_ref = document id" and "nothing
is created before confirm") collide on ordering. → Log at call time with
`source_ref` null — nothing unlogged, ever — and backfill the reference when
the artifact is born (`linkAiLogToDocument`, guarded by `.is("source_ref",
null)`); never defer the log itself, and never create orphan records to have
an id to log. → `lib/ai.ts` (extractCv logs on every path incl. thrown API
errors) + `createPersonFromCv` backfill; this register.

**L-023 · 2026-07-03 · A `File` can't ride a plain-object server-action payload — wrap at the action boundary, not by forking the dialog.**
CV-first Add Person needs the browser-held `File` sent with the confirm
submit, but `useActionForm` passes a plain object and React's server-action
serialization only reliably carries files inside `FormData`. The tempting fix
was a second, hand-rolled submit path in the dialog — exactly the L-003
defect. → The form machine's contract is `(input: unknown) => Promise<
ActionResult>`; a FormData-building wrapper satisfies it. → Keep ONE
useActionForm and give it a closure action that switches transport: plain
object → `createPerson`, CV attached → wrap fields as JSON + file into
FormData → `createPersonFromCv`. Dialogs never grow a second state machine
because the payload shape changed. → add-person-dialog.tsx `submitAction`;
engineering.md §3 stands unamended (the machine already allowed this); this
register.

**L-026 · 2026-07-04 · One new person-referencing FK trips L-009 and L-010 at once.**
R4/F2 adds `mandate.hiring_manager_id` (a person link). A person FK is not just
a column: `merge_people` had to repoint it (else merging the hiring manager
into their canonical record orphans the reference — L-009), AND `erase_person`
had to purge audit rows that name the erased person through it (the hard-delete
path's on-delete-set-null fires a mandate UPDATE whose audit row carries the
erased id under `hiring_manager_id`; the redacted path keeps the person so we
null it explicitly like `deal.primary_contact_id` — L-010). Missing either is a
silent defect the happy path never shows. → A person-referencing FK inherits
BOTH the merge-repoint and the audit-purge contracts; enumerate both whenever
one is added. → Both closed in 0010 (merge repoint line; erase adds
`hiring_manager_id` to the audit purge and the redacted-path null); behaviour
tests 18 (merge) and 19 (erase). This register + the migration header.

**L-027 · 2026-07-04 · Audit rows on a child of candidacy key on candidacy_id, not person_id — the person-keyed erase purge never reached them (a latent leak since 0006).**
R4/F1 adds `candidacy_feedback` (person-derived free text). Verifying its
erasure path per the task surfaced that its audit rows carry `candidacy_id`,
not `person_id`, so `erase_person`'s person-keyed purge could not match them —
and `interview` (0006) had the *identical* shape and was already leaking:
erasing a person left interview-audit rows containing `feedback`/`notes` (I
reproduced it — two rows survived, one reading "CANDIDATE WAS LIGHT ON GRID").
This is L-010 a third way; 0006 shipped it uncaught because no test erased a
person who had interviews. → A new table is only "audit-safe under erasure" if
the purge can *reach* its rows; when the table has no `person_id`, the purge
must match through whatever id it does carry (here: the erased person's
candidacy ids). → 0010 captures the person's candidacy ids and purges
`candidacy_feedback` + `interview` audit rows by them, table-scoped so the
statutory `invoice` audit (also candidacy-keyed, but non-identifying fee
lineage) is preserved; the redacted path also deletes the live feedback/
interview on the surviving placed candidacy (identifying detail, not lineage —
same rationale as nulling `notes`). Tests 19 (never-placed) and 20 (redacted,
incl. the invoice-survives assertion) lock it. This register + migration header.

**L-028 · 2026-07-04 · "One entry, two views" is a storage-shape decision, not a UI one — hang it off the join table.**
R4/F1 needed candidacy feedback visible on BOTH the job page and the person
page as a single record. The tempting reach was to extend `activity` (it has
`mandate_id`), but activity is event-shaped (typed, `source`/`source_ref`
idempotent, participant-linked) and carries no candidacy link — it would have
needed a new type and a new column, then UI glue to show it in two places. →
`candidacy` already joins person × mandate, so a plain child table of candidacy
surfaces on both pages for free (`mandate → candidacy → feedback` and
`person → candidacy → feedback`) — the dual view is structural, not rendered
twice. → Prefer the boring child-of-the-join-table over widening an
event-shaped table (ADR-002); `candidacy_feedback` (0010), behaviour test 16
proves both paths resolve the same row. This register.

**L-029 · 2026-07-04 · A shared input primitive built for create flows lies in edit flows unless it can render a pre-existing selection.**
R4/F2's Edit-brief dialog is the first EDIT-form use of PersonPicker (every
prior use — add candidacy, log activity — was create-only). Wired naively, a
mandate with a hiring manager already set would open the dialog to an EMPTY
search box: the UI silently misrepresents saved state, and because the brief
dialog submits full state by design (empty = clear), saving the "unchanged"
form would have wiped the hiring-manager link — a data-loss bug wearing a
blank field. → The primitive's state model only knew "nothing selected yet";
edit flows also need "selected before the dialog opened". → When a shared
input is first reused in an edit context, check it can represent the
pre-existing value before wiring it. → PersonPicker gains `initialLabel`
(seeds the text and the selected flag; typing still invalidates and
re-searches), documented on the prop so the next edit form finds it
(person-picker.tsx); this register.
