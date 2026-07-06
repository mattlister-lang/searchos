# SearchOS — The Experience Contract

**Binding, like the ADRs and `engineering.md` (ADR-023).** This document extends
`engineering.md §4` (Information Architecture) from a set of rules into a
complete, audited specification of the operator's experience. Where §4 says
"every entity a page, every reference a link", this document names *which*
pages must exist, *what* each contains, *where* the operator lands after every
action, and *how* each of the six commercial workflows should feel end to end.

Written after a holistic UX audit (6 Jul 2026) grounded in the shipped code,
against Matt's standard: **"think holistically about the experience of me using
this commercially… expandable pages for each thing… edge cases… the user flow
and workflow of each task."** Ranking lens, verbatim: *"if it can save me time
and make me more money, I will be over the moon."* One operator, commercial
reality, boring beats clever.

Future rounds cite this file. The prioritised backlog it produces is
`product-brief.md §13`.

---

## Part A — The Page Model

The standing rule (engineering.md §4): every entity with meaning has a page;
every entity name is a link to that page; empty-but-real rows are shown; lists
expand rather than dead-end. The table below is the audit of that rule against
the shipped routes. **"Verdict" flags where the rule is currently broken.**

Routes that exist today: `/` (dashboard), `/pipeline`, `/jobs`, `/jobs/[id]`,
`/companies`, `/companies/[id]`, `/deals`, `/people`, `/people/[id]`,
`/billings`, `/reports`, `/radar`, `/search`, `/login`.

| Entity / artifact | Route today | Route target | What the page shows | Expands inline vs navigates | Verdict |
|---|---|---|---|---|---|
| Person | `/people/[id]` ✓ | same | header + hats, seniority/skills/sectors chips, emails, experience, standardised CV, candidacies (interviews + feedback inline), documents, activity | interviews/feedback expand inline; company/job names navigate | **OK.** Gaps: offer data & interview notes/feedback not shown (E-006/E-007); no "Add to job" here (E-022) |
| Company | `/companies/[id]` ✓ | same | header + status/sector/domain chips, notes, people (current/past), deals, jobs, Apollo openings, Apollo news, activity | Apollo openings/news expand inline; people/jobs navigate | **OK.** Deals here link to `/deals` not the deal (E-001) |
| Job (mandate) | `/jobs/[id]` ✓ | same | header, role brief card, candidate kanban, out-of-process, candidate feedback, documents (JD), recent activity | kanban/feedback/docs expand inline; company/people/deal navigate | **OK** — the reference page. Deal badge links to `/deals` not the deal (E-001) |
| **Deal** | **none — edit dialog only** | **`/deals/[id]`** | deal header (name/stage/value/win%), the company + primary contact, next step, notes, the deal's own activity log (BD calls/emails), documents (proposals/terms), linked job if converted, timeline | activity/notes/docs expand inline; company/contact/job navigate | **BROKEN — L-004 violation.** Rows open an edit dialog; every deal reference app-wide points at the `/deals` list. See E-001 |
| Candidacy | inside job + person pages | keep dual-surface | stage, interviews, feedback | inline on both parent pages | **OK by design** (join entity; L-028). But its child detail is write-only (E-006) |
| **Interview** | inside candidacy, round/kind/outcome only | inline expansion (no page needed) | round, kind, scheduled_at, **location**, **notes**, outcome, **feedback** | expand inline on the candidacy | **BROKEN.** `notes`, `location`, `feedback` are stored and never rendered anywhere (E-006) |
| Candidacy feedback | inline (job + person) ✓ | same | source, author, body, delete | inline | **OK** |
| Invoice | row in `/billings` (mark-paid only) | inline expansion + statuses | amount, terms, issued/due/paid, status, void | inline row actions | **PARTIAL.** No void, no edit, no confirm on mark-paid, no fall-through path (E-023) |
| Placement | row in `/billings` | keep row; link to candidacy context | candidate, mandate, salary, fee, start, boarded, invoice | row → person/job | **OK.** No reversal path (E-023) |
| Document | inline on person/job; download | keep inline; a person/job "documents" section | kind, filename, download, extracted-text note | inline; download mints signed URL | **OK** |
| **Activity** | inline lists (subject/summary) | inline expansion of the body | type, subject, **body**, occurred_at, participants | expand inline to read the note | **BROKEN.** Manually logged `body_raw` is never displayed — the note you type vanishes from every view (E-005) |
| **Saved Radar analysis** | none — stateless, lost on navigate | optional: persist to a job/deal on action | the standardised spec + pool matches | — | **BY DESIGN but lossy** (E-021). At minimum the spec should ride the action it triggers |
| Talent map (employment viz) | none | future (brief §1) | — | — | Out of scope; accepted |
| **Stewardship queues** (merge_queue, counterparty_queue, dead letters, AI spend, retention/statutory review) | **none in UI** | **`/review`** (read-only hygiene page) | pending merges, unknown counterparties, dead letters, `v_ai_spend`, `v_retention_review`, `v_statutory_purge`, freshness | each row links to the entity it concerns | **BROKEN.** The weekly hygiene review (CLAUDE.md) has no in-app surface (E-025). Merge/erase *actions* stay conversational (correct); the *queues* must be visible |

### The page-model rules this audit adds

1. **A deal is an entity, not a dialog.** It gets `/deals/[id]`. Every deal
   reference — the deals list row, the company page, search results, header
   typeahead, the job page's BD badge — links to it. (Fixes the single most
   repeated L-004 violation in the app.)
2. **Nothing captured is write-only.** If the operator can type it (activity
   body, interview notes, interview feedback, offer figures, deal notes), a
   page must render it back. Capture without recall is a data-entry tax with no
   payoff — the opposite of the brief.
3. **Every reporting/hygiene view gets a window.** Insight views already exist
   (`v_next_actions`, `v_ai_spend`, `v_retention_review`, …); a view with no
   page is invisible work. The dashboard surfaces the daily ones; `/review`
   surfaces the weekly ones.
4. **After a create, land on the thing created.** See Part C.

---

## Part B — Navigation after action (the "dead ends" audit)

The shared form machine (`useActionForm`) closes the dialog, resets, and calls
`router.refresh()` on success. That is correct for *edits in place* (log
activity, edit brief, move stage, mark paid). It is a **dead end for
creations**, where the operator's intent is "make this thing, now take me to
it." Only `AddPersonDialog` navigates on success (`router.push(/people/[id]`)).
Everything else drops the operator back where they started with a silent
refresh.

| Action | Lands today | Should land | Severity |
|---|---|---|---|
| Add person | person page ✓ | person page | OK (the pattern to copy) |
| Create deal (`upsertDeal` new) | stays on `/deals`, refresh | **`/deals/[id]`** (once it exists) | High |
| Log BD deal from Radar (`logSpecDeal`) | stays on Radar | **`/deals/[id]`** | High |
| Create job (`createMandate`) | stays on `/pipeline` or Radar, refresh | **`/jobs/[id]`** | High |
| Create company (`createCompany`) | stays on `/deals`/`/companies`, refresh | **`/companies/[id]`** | Medium |
| Add candidacy | refresh in place | in place is fine (kanban updates) | OK |
| Record offer (`recordOffer`) | dialog closes on person page; **nothing visible changes**, revalidates `/billings` only | show offer on the candidacy + toast "on the sales board →" linking `/billings` | High (E-007) |
| Create invoice | refresh `/billings` ✓ | in place, fine | OK |
| Upload document | refresh in place ✓ | in place, fine | OK |
| Enrich / find email / news | preview→confirm, refresh in place ✓ | in place, fine | OK |

**Rule added:** a *create* action returns `{ ok: true, id }` and the dialog's
`onSuccess` navigates to that entity's page. An *edit* action refreshes in
place. `useActionForm` already carries `onSuccess`; the dialogs just need to use
it (as `AddPersonDialog` does).

---

## Part C — The six commercial workflows

Each journey: **current state** (grounded in the code, with a click count) →
**target state** (the designed flow) → **the delta**. A "click" is a discrete
operator action (open dialog, type field-group, submit, navigate).

### A · Win new business (competitor research → spec-in → BD deal → work it → won)

**Current state.**
1. Radar: paste/drop a job advert, click **Analyse** — one Haiku call yields a
   standardised spec + auto-runs a pool match. (2 clicks)
2. Click **Log BD deal** → `SpecDealDialog` → confirm "create company as
   prospect" → deal created at `lead`, spec appended to company notes. Dialog
   closes; **operator stays on Radar** with no link to what was created. (2-3
   clicks)
3. To work the deal day-to-day: navigate to `/deals`, scan the table, click
   **Edit** on the row to change stage / next step (a dialog, not a page). Win %
   and weighted forecast are shown at the list level.
4. **There is no deal page.** There is **no way to log a BD call/email against
   the deal** — `LogActivityDialog` supports a `dealId` but is never rendered in
   any deal context, so BD activity can only attach to the *company*,
   disconnected from the deal it advanced.
5. **There is no convert-to-job flow.** `mandate.deal_id` exists in the schema
   but nothing in the UI ever sets it, so a won deal cannot become a job while
   keeping the BD→delivery lineage the brief (§2) demands.
6. The Radar analysis is **stateless** — navigate away and the spec + matches
   are gone; re-analysing re-spends a Haiku call.

**Target state.**
1. Radar analysis unchanged (it is good) — but the spec rides whatever action it
   triggers, so it is not lost (E-021).
2. **Log BD deal → land on `/deals/[id]`**, the deal's workspace: header with
   stage/value/win%, the company + a **primary contact** (settable here), next
   step, notes, a **BD activity log** (log a call/email/LinkedIn against *this
   deal* in ≤2 clicks), documents (proposals/terms), and — once won — a
   **Convert to job** button that opens the New-job dialog prefilled and sets
   `mandate.deal_id`, then lands on `/jobs/[id]`.
3. Working a deal is done on its page, not a list-row dialog. The deals list
   stays the commercial forecast (open pipeline, weighted forecast, win %).

**Delta.**
- **`/deals/[id]` page** (E-001, the workflow spine). — L
- **Log activity against a deal** (wire the existing `dealId` path into the deal
  page). — S
- **Deal contact + notes fields** (dialog + page; `upsertDeal` already accepts
  notes) (E-008). — S
- **Convert deal → job** setting `mandate.deal_id`, landing on the job (E-009). — M
- Navigate to the created deal after Log BD deal (Part B). — S
- Make `logSpecDeal` atomic so a failed deal doesn't orphan a new prospect
  company (E-010). — S

### B · Take a briefing → open the job (client call → JD → brief → mandate ready)

**Current state.**
- Two entry paths. **Radar path:** analyse the JD → **Create job** opens
  `NewMandateDialog` prefilled (company, title, brief text, seniority, location,
  salary, skills) → submit → **stays on Radar**, the created job is not opened,
  and **the JD file analysed on Radar is not attached to the job** — the
  operator must re-find and re-upload it on the job page. (≈3 clicks + a
  re-upload)
- **Direct path:** `/pipeline` or `/jobs` → New job dialog → the client company
  **must already exist** or the action errors ("create it first"); creating it
  is a separate dialog on another page. → submit → stays on the list.
- On the job page: role brief is editable (`EditBriefDialog` — salary, package,
  team, notice, hiring manager as a linked person), JD attaches via **Upload
  JD**, one-click re-download works. Mandate is ready.

**Target state.**
- **Create job lands on `/jobs/[id]`** every time.
- The **JD file carries through** from Radar: if the analysis came from a
  dropped file, attaching it to the new mandate is automatic (it is already in
  the browser; persist it on the same confirm, kind `spec`).
- New-job dialog offers **inline "create company"** when the typed client isn't
  found (resolution-before-creation, confirm-gated) instead of erroring — so a
  briefing never stalls on a missing company row.

**Delta.**
- Navigate to the created job after creation (Part B). — S
- Carry the Radar JD file onto the new mandate (E-B1). — M
- Inline company-create in the job/deal dialogs when unresolved (removes the
  "create it first" wall). — M

### C · Fill the job (source → longlist → approach → screen → shortlist → interviews → offer)

**Current state.**
- **Source:** Radar pool match / Apollo search / People Boolean search. Adding an
  Apollo result runs the normal resolution flow (good).
- **Longlist:** `AddCandidacyDialog` (on pipeline + job pages) with a
  `PersonPicker` typeahead → candidacy at `identified`. **You cannot add a
  candidacy from the person page** — to put a person you're looking at onto a
  mandate you must leave, go to the job/pipeline, and search their name back up
  (E-022).
- **Approach / move stages:** the job-page kanban (drag or per-card select) runs
  `moveStage` with confirm-before-consequence. Moving stage is ≤2 clicks. But
  **logging the *outcome* of an approach** (interested / not / a note) is a
  separate `LogActivityDialog`, and **its body is never shown back** (E-005), so
  the "declined approaches are data points" requirement (brief §3.2) is captured
  write-only.
- **Screen / interviews:** `LogInterviewDialog` on the person page stores round,
  kind, scheduled_at, **location, notes** — but the person/job pages render only
  round/kind/scheduled/outcome; **notes and location never surface** (E-006).
  `InterviewOutcomeControl` sets an outcome + **feedback** — **feedback never
  surfaces** (E-006).
- **Shortlist / client feedback:** `AddFeedbackDialog` (client/consultant) shows
  on both the job and person pages — this flow is good. "Client emailed
  feedback" → open the candidate (or the job) → Add feedback → 2-3 clicks, lands
  on the record. Solid.
- **Offer:** `OfferDialog` on the person page stores salary/fee/dates/board — but
  **the person page never shows any of it**, and the operator is not taken to
  billings (E-007).
- **The day-of-calls problem:** there is no single surface to run a day of
  candidate calls from. The chase list (dashboard) links to people, but from a
  person page logging an approach outcome is a dialog whose result you can't see.

**Target state.**
- **"Add to job" on the person page** — pick a mandate, candidacy created,
  ≤2 clicks, no round-trip (E-022).
- **Interview and offer data render back** on the candidacy: notes, location,
  feedback, salary/fee/dates, boarded state (E-006/E-007).
- **Activity bodies render back** so an approach outcome ("spoke to X, not
  interested — happy where they are") is visible on the person and the job
  (E-005).
- **A "day of calls" surface** (later): the chase/next-actions lists deep-link
  to the candidate with the log-outcome affordance one click away.

**Delta.**
- Render interview notes/location/feedback and offer figures on the candidacy
  (E-006, E-007). — M
- Render activity body inline / expandable (E-005). — S
- "Add to job" from the person page (E-022). — S
- Offer save → toast linking `/billings` (E-007). — S

### D · Close the money (offer → placed → boarded → invoiced → paid)

**Current state.**
- **Offer accepted + start date + board** happens in `OfferDialog`; boarding is
  correctly gated (accepted date AND start date AND fee). Moving the candidacy to
  `placed` is a confirmed stage move (statutory clock warning — good).
- `/billings` shows the sales board (boarded/invoiced/paid by month), placements
  (with **Create invoice**), and invoices (with **Mark paid**). Placements and
  invoices link back to person and job. This page is largely right.
- **Edge gaps:** **offer declined** has no first-class path (it's a manual stage
  regression + reason); **placement falls through** — `moveStage` allows
  regressing out of `placed` with confirm, but `boarded_at` and any issued
  invoice are left standing, so the sales board and a fall-through disagree;
  **invoice void** doesn't exist (only draft/issued/paid; the billings row even
  guards for `"void"` status that nothing can set); **mark paid has no confirm**.

**Target state.**
- Offer outcome is explicit: **accepted** (→ board flow) or **declined** (→
  candidacy to a terminal stage with a reason, no fee). 
- **Placement reversal** is a defined transition: regressing out of `placed`
  prompts for what happens to `boarded_at` and any invoice (void it), so money
  and pipeline never disagree.
- **Invoice void** exists, confirmed; **mark paid** confirmed.

**Delta.**
- Define + build placement-reversal and invoice-void with confirms (E-023). — M
  (**schema:** invoice `void` status likely already tolerated; confirm before
  building — flag for Matt.)
- Explicit offer-declined affordance on the candidacy. — S

### E · Daily driving (the dashboard → act on each item)

**Current state.** The dashboard fires **7 queries** and shows: 4 stat cards,
**Next actions**, **Chase list**, **Upcoming interviews** (conditional),
**Activity pulse**.
- **Next actions** (`v_next_actions`) is the morning to-do — and its rows are
  **not actionable**. The view returns only text (`item`, `context`); it carries
  **no ids**, so the dashboard renders "Kraken deal — no next step" and "Amy
  Park (going stale)" as **plain strings with no links** (E-002). The single
  most important surface in the app is a dead end.
- **Chase list** (`v_stale_candidacies`, 0010) *does* carry ids — candidate, job,
  client all link correctly. This is the model the next-actions view should
  follow (the 0007 lesson, already learned once).
- **Upcoming interviews** renders candidate/mandate as **plain text, no links**
  (the view carries names, not ids).
- **Activity pulse** links company? No — company renders as plain text (pulse
  carries `company_id` but the dashboard doesn't link it).

**Target state — the morning routine.** Open the dashboard, and every row is one
click from acting: a stalled deal → its deal page with the next-step field
focused; a going-stale contact → their person page; an interview → its
candidacy; a warming/cooling company → the company. Nothing requires the
operator to re-search for something the dashboard already named.

**Delta.**
- **`v_next_actions` carries a target type + id; every row links** (E-002). — M
  (**schema/view change** — flag for Matt.)
- Link upcoming-interview rows (person/job) and pulse rows (company). — S
- Consider a "chase" quick-action inline on chase-list rows (log activity / bump
  stage without leaving the dashboard). — M

### F · Data stewardship (merge queue, suppression, erasure, counterparty, freshness, CSV)

**Current state.**
- **Merges and erasure are deliberately conversational-only** (ADR-013, ADR-022)
  — **correct, keep it.** No one-click merge/erase in the UI is the right call.
- **But the queues are invisible.** `merge_queue`, `counterparty_queue`,
  `ingestion_dead_letter`, `v_ai_spend`, `v_retention_review`,
  `v_statutory_purge` have **no UI surface at all** (E-025). The weekly hygiene
  review that CLAUDE.md mandates has nowhere to happen in-app; Matt can't *see*
  that two people are pending a merge decision, or that a counterparty is waiting
  for "should I know this person?".
- CSV import is a script (`scripts/import-csv.ts`), not a UI flow — accepted for
  now (no CSV exists yet).
- Erasure containment is sound: redacted erasure deletes employment, emails,
  documents, feedback, interviews and nulls names/notes; erased/suppressed people
  are filtered from people list, search, typeahead, and pool match; billings
  shows `[erased]`. Verified against `erase_person` (0010).

**Target state.** A single **`/review`** page (read-only) is the weekly hygiene
cockpit: pending merges (each linking both candidate records so Matt can eyeball
them before asking Claude to merge), counterparty queue, unresolved dead
letters, this month's AI spend vs the £20/£50 caps, the retention and statutory
lists, and the freshness report. **It surfaces; Claude still acts** (merge/erase
stay conversational).

**Delta.**
- **`/review` hygiene page** reading the six existing views/tables; no new write
  paths (E-025). — M
- Keep merge/erase out of the UI (no change — confirm the boundary in this doc).

---

## Part D — The Edge-Case Register

Numbered, binding. Each: where it bites → required behaviour. Future rounds cite
`E-NNN`.

**E-001 · Deal has no detail page (L-004 violation).** Every deal reference —
`/deals` row (opens an edit dialog), company page ("→ /deals"), `/search` ("→
/deals"), header typeahead ("→ /deals"), job-page BD badge ("→ /deals") — points
at the list, never the deal. *Required:* a `/deals/[id]` page; every reference
links to it. This is the highest-severity IA gap.

**E-002 · The morning to-do is a dead end.** `v_next_actions` returns text with
no ids; the dashboard's "Next actions" rows are unclickable. *Required:* the view
carries `(target_type, target_id)`; each row links to the deal / person /
candidacy it names. (Model on `v_stale_candidacies`, which already does this.)

**E-003 · People list silently truncates at 200.** `people/page.tsx` caps at
`.limit(200)` with no pagination and no indication. Past 200 people, some are
invisible with no signal — for a growing candidate pool this is a correctness
bug wearing a performance mask. *Required:* pagination (or count + "showing 200
of N" + narrower filters); same for any Boolean-search result set.

**E-004 · Companies list: no empty state, no bound.** `companies/page.tsx`
renders a bare table with no `length === 0` branch and no `.limit()`. *Required:*
empty state; bound + paginate when the list can grow.

**E-005 · Logged activity bodies are write-only.** `logActivity` stores
`body_raw`; the person, company and job activity sections render `summary` only
(null for manual entries). The note you type when logging a call is never shown
again. *Required:* render `body_raw` (fallback `summary`), ideally as an
expandable activity row. Highest-frequency capture in the app; recall is
non-negotiable.

**E-006 · Interview notes/location/feedback are write-only.** `logInterview`
stores `notes` + `location`; `setInterviewOutcome` stores `feedback`. The
candidacy renders only round/kind/scheduled/outcome. *Required:* render notes,
location and feedback on the candidacy (inline expansion).

**E-007 · Offer data is invisible where it's entered.** `recordOffer` stores
salary/fee/dates/boarded and revalidates `/billings` only; the person page
(where the dialog lives) shows none of it and doesn't navigate. Operator saves
an offer and sees nothing happen. *Required:* show offer figures + boarded state
on the candidacy; on save, toast linking `/billings`.

**E-008 · A deal can't have a contact or notes in the UI.** `DealDialog` has no
contact and no notes field; `v_deal_board` shows a `primary_contact` column that
nothing can populate; `upsertDeal` accepts `notes` that no dialog sends.
*Required:* contact picker (PersonPicker) + notes on the deal page/dialog.

**E-009 · No deal→job convert flow.** `mandate.deal_id` exists; nothing sets it.
The brief's "one continuous job lifecycle" (§2) is unreachable in the UI.
*Required:* "Convert to job" on a won deal → `createMandate` with `deal_id`,
landing on the job.

**E-010 · `logSpecDeal` can orphan a prospect company.** It creates the company
(`status: prospect`) then calls `upsertDeal`; if the deal insert fails, the new
company persists with no deal — a phantom prospect. *Required:* create company +
deal atomically (or create the company only inside the same successful path;
surface a compensating message otherwise).

**E-011 · Ambiguous-match flow can't compare candidates.** `AddPersonDialog`'s
ambiguous list shows name + similarity % only — no role, company, or link to
inspect the existing record before choosing "use existing" vs "create new".
*Required:* richer candidate rows (current role + company), and a way to open a
candidate in a new tab before deciding.

**E-012 · Stale form data / concurrent edits.** Dialogs seed state from server
props on mount; if the record changed since page load, a save overwrites blindly.
`EditBriefDialog` submits *full* state (empty clears the column) — highest risk.
`upsertDeal` patches only provided fields (safer). *Required:* for full-state
edit forms (brief), an `updated_at` guard or a "changed since you opened this"
warning; at minimum document the risk.

**E-013 · Erased people leaking.** Verified mostly handled: redacted erasure
deletes employment/emails/documents/feedback/interviews and nulls name/notes;
people list, search, typeahead and pool match filter `erased_at`/suppression;
billings shows `[erased]`. *Required:* keep the invariant — any *new* list or
lookup added must filter `erased_at`; the erased person page should stay
read-only (it does — FindEmail is guarded).

**E-014 · Mandate/deal requires a pre-existing company.** `createMandate` /
`upsertDeal` (new) error if the company isn't found; creating it is a separate
dialog on another page. Not a dead end, but a stall mid-briefing. *Required:*
inline confirm-gated company create in these dialogs (see E-B1 delta).

**E-015 · Person with two current employments.** The schema allows multiple
`is_current`; the people list, header disambiguation, and Apollo find-email all
pick the *first* current row arbitrarily. *Required:* define a single primary
current employment (or render all, and let find-email pick deliberately).

**E-016 · File failures mid-flow.** Handled: >10MB and no-text rejected before
any write; `createPersonFromCv` that creates the person but fails CV storage
returns a clear "person saved, re-upload the CV" message. *Required:* keep this
shape for any new upload path (validate → write → compensate-with-message).

**E-017 · Apollo/AI failure mid multi-step.** Handled by the preview→confirm
shape: enrich, find-email, news and CV/JD parse write nothing on failure. The one
exception is E-010. *Required:* every new external-call feature stays
preview-then-confirm; no partial writes on the fetch leg.

**E-018 · Mobile / narrow viewport.** The sidebar is a fixed `w-52`, always
visible (no hamburger); `main` is `overflow-x-hidden`, so wide tables (the deals
table has 11 columns) **clip rather than scroll**. The kanban correctly uses
`overflow-x-auto`. *Required:* collapsible nav under a breakpoint; wrap wide
tables in `overflow-x-auto` containers; the page body never scrolls
horizontally.

**E-019 · Dashboard query cost.** 7 queries per load; `v_activity_pulse` joins
every company against all activities via an OR-subquery with no bound and orders
the lot. Fine now; a scaling watch item. *Required:* bound the pulse (top-N
companies) and revisit if the dashboard slows.

**E-020 · Very long notes/brief rendering.** `company.notes` (append-grows to
5000 chars via enrichment/news/spec-in) and `person.profile` render as a single
unbounded `<p>`; the brief uses `whitespace-pre-wrap` (fine). *Required:*
clamp-with-expand ("show more") on notes/profile once they routinely exceed a few
lines.

**E-021 · Radar analysis is lost on navigate.** The page is stateless by design;
navigating away discards the spec + matches, and re-analysing re-spends a Haiku
call. *Required (target):* the spec rides the action it triggers (job brief / deal
notes already do); consider persisting the last analysis per session so an
accidental navigation isn't a re-spend.

**E-022 · Can't add a candidacy from the person page.** To put the person you're
viewing onto a mandate you must go to `/pipeline` or the job and search their name
back up. *Required:* "Add to job" (mandate picker) on the person page.

**E-023 · Money edge cases: reversal & void.** Placement fall-through leaves
`boarded_at` and any invoice standing (sales board disagrees with reality);
invoice `void` can't be set (though the billings row guards for it); mark-paid has
no confirm; offer-declined has no first-class path. *Required:* defined,
confirmed transitions for placement-reversal, invoice-void, and offer-declined.

**E-024 · Inbound feedback capture.** "Client emailed feedback" is a manual
Add-feedback (2-3 clicks) because ingestion is deferred (ADR-018). *Accepted* —
noted so a future email-ingestion revival knows this is the seam it closes.

**E-025 · Stewardship queues are invisible.** merge_queue, counterparty_queue,
dead letters, AI spend, retention and statutory review have no UI. The mandated
weekly hygiene review has nowhere to happen in-app. *Required:* a read-only
`/review` page. Merge/erase actions stay conversational (unchanged).

---

## Part E — Frequency × friction (where to spend the clicks)

The ten most frequent operator tasks, current clicks → target, and where a
speed layer (keyboard/command-palette/bulk) would actually pay. Ranked by
`frequency × friction`, per Matt's "save me time" lens.

| Task | Current | Target | Speed-layer win? |
|---|---|---|---|
| Log a call/note against a person | open dialog → type → submit (3) + **can't read it back** (E-005) | 3, and it renders back | Command-palette "log call on <name>" |
| Move a candidate a stage | drag or select (1-2) ✓ | unchanged | — (already good) |
| Add client/consultant feedback | open → type → submit (3) ✓ | unchanged | — |
| Chase from the dashboard | **dead end for next-actions (E-002)**; chase-list links work | 1 click to the right place | Inline "chase" action |
| Spec-in on Radar | paste → Analyse → act (3) ✓ | unchanged; land on created entity | — |
| Add a person (typed/CV) | dialog → confirm (2-3) ✓, lands on person ✓ | unchanged (the model) | — |
| Add a candidate to a job | leave page → pipeline/job → search → add (4-5) | "Add to job" from person page (2) (E-022) | Command-palette |
| Work a BD deal | `/deals` → row → edit dialog; **no activity log** (E-001/E-008) | deal page: edit + log in place | — |
| Create job from a briefing | dialog → submit → stay put; **re-upload JD** (E-B1) | land on job, JD carried | — |
| Record an offer / board a fee | dialog (3) → **nothing visible** (E-007) | figures render + link to billings | — |

**Speed-layer verdict.** A command palette (extend the existing header
typeahead) genuinely pays for the two highest-friction frequent tasks —
"log a call on <name>" and "add <name> to <job>" — because both currently force
a navigate-and-search round trip. Bulk actions do **not** pay yet at
single-operator, few-hundred-record scale (ADR-002 "boring first"): defer until
a list routinely needs the same action across many rows. Keyboard nav on the
kanban is a nice-to-have, not a need. **Fix the dead ends and the write-only
captures first; the speed layer is R9, not R7.**

---

*Grounded in the shipped code at commit-time of the 6 Jul 2026 audit. Every
`E-NNN` and every "BROKEN"/gap above was verified against `web/app`,
`web/components`, `web/lib/actions.ts`, and the migrations — not inferred.*
