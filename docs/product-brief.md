# SearchOS — Product Brief (Matt's download, 3 Jul 2026)

**Positioning: beat Bullhorn, Loxo, Spott.io.** At bare minimum match them —
most recruitment agency systems are terrible, so the bar is beatable. This
document decomposes Matt's verbal brief into requirements, maps each to the
current schema, and phases the build. It is the source of truth for what
"done" looks like; ADRs govern *how*.

---

## 1. People

- One human can be a **candidate**, a **client contact**, both at once, or
  one then the other over time (candidate → line manager → client). The
  person-centric model (ADR-004, one `person`, roles via relationships) is
  load-bearing and correct — Bullhorn-style candidate/contact splits are
  explicitly what we refuse to copy. Spott splits them; we don't.
- Roles are **derived, not duplicated**: candidate = has candidacies (or is
  pool-flagged); client contact = attached to deals/mandates/companies.
  The UI must make the *current hat* obvious while showing the whole person.
- **Confidentiality and discretion**: a client contact's parallel life as a
  candidate elsewhere is sensitive. Client-facing outputs (shortlist briefs,
  reports) must never leak candidate status; multi-seat visibility rules
  later.
- Everyone links to companies via `employment` (exists) → enables **talent
  maps**: who works where, org-shaped visualisations per company. Future
  viz page over `employment`.

## 2. Jobs (vacancies)

A job has two macro-phases with different physics:

**BD phase** (winning the work): scoped/identified vacancy → chasing (calls,
emails, spec-ing a candidate into a company where no relationship exists) →
pitched → won or lost. Today this is `deal`.

**Delivery phase** (running the search): today this is `mandate` + `candidacy`.

Requirement: they are one continuous **Job lifecycle** in the operator's
head and must appear that way in the UI (single job page, kanban across the
whole life), whatever the storage model. Decision pending (§7): link
deal→mandate vs unify.

## 3. The candidate journey (delivery pipeline)

Matt's actual flow, which the stage model must express:

1. **Sourcing**: advertise, search own network/database, headhunt via
   LinkedIn Recruiter (external system — stays external, ADR-009).
2. **Approach outcome as historical data**: interested / not interested is
   recorded *even for people never entering the process* — declined
   approaches are data points (candidacy at `approached` → `withdrawn` with
   a reason, or lightweight approach log).
3. **Entry**: interested candidate → CV requested + LinkedIn profile
   captured → **candidate created/updated in SearchOS** (resolution rules
   apply; CSV/manual capture; documents attached).
4. **Consultant interview**: recorded in Granola → transcript attached to
   the candidate record (document). Candidate now on the **long list**.
5. **Shortlist**: the curated, verified subset delivered to the client with
   a **per-candidate report/brief** (generated deliverable — reputation on
   the line; "never waste the client's time").
6. **Client interviews: variable rounds** — minimum ~2, typically 3, up to
   5–6+. A single `client_interview` enum value cannot express this: needs
   an **`interview` entity** (candidacy, round, kind, scheduled_at,
   participants, confirmations sent, feedback, outcome). Candidates can
   join the process at any point mid-flight; candidates drop out at any
   point (client pass, candidate withdrew, circumstances).
7. **Final stage → offer**: client decides; Matt relays/negotiates offer
   (liaising HR + line manager + candidate expectations). Offer can be
   declined — that's an outcome, not an error.
8. **Acceptance → placed**: offer accepted **and start date agreed** →
   candidate marked placed → **fee is "boarded"** (goes on the sales board).
9. **Invoicing**: on acceptance or on start date, per negotiated terms.
   Paid after start (usually). Track invoice → paid.
10. **Post-placement**: keep-in-touch check-ins during first weeks/months
    (activities + scheduled nudges via next-actions). References usually
    passed to client; occasionally handled.

## 4. Money

- **Sales board**: boarded fees (offer accepted + start date agreed), by
  month/quarter — distinct from invoiced and from paid.
- **Invoices**: issue date, terms, amount, status (draft/issued/paid),
  linked to the placement. Financial analytics on top (`v_fee_income`
  exists; extends to boarded/invoiced/paid states).

## 5. Activity & BD metrics ("collect everything, surface insight")

- Track: sales calls, emails out, LinkedIn messages, **LinkedIn posts**
  (market content = marketing), events attended, contacts made at events.
  → extend `activity_type` (+ linkedin_post, event; enum extension is one
  ALTER, ADR-002 anticipated this).
- **Per-consultant analytics** for the multi-seat future: interviews
  arranged, activities logged per consultant. Requires owner/actor
  attribution on activities/candidacies/jobs when seats > 1 (§7).
- The system interprets volume + outcomes and surfaces insight: activity →
  pipeline correlation, conversion by stage, where time goes.

## 6. Intelligence layer (the differentiator)

- **New job → surface matching candidates from the database.** Mechanisms,
  in escalating order:
  1. Structured filters: sectors (exists on company; add to person),
     **seniority level** (new person attribute), function/discipline,
     location.
  2. Keyword/trigram over titles, profiles, CV parsed text (pg_trgm exists;
     documents carry `parsed_text`).
  3. Semantic (embeddings, ADR-018-gated) and/or Claude reasoning over the
     top-N — producing *explained* matches ("why this person fits"), Spott's
     match-rationale cards but with real reasoning.
- Insight surfacing generally: next actions (exists), relationship decay
  (exists), pipeline velocity (exists), plus match-on-create, pre-call
  briefs, shortlist brief generation.

## 7. Open design decisions

1. **Job model**: unify `deal`+`mandate` into one `job` entity with a
   lifecycle spanning BD→delivery, or keep both linked
   (`mandate.deal_id`) and present unified in UI. *Recommendation: link,
   don't merge — BD deals aren't always vacancies (Kraken deal today is a
   BD relationship), and the statutory/fee machinery hangs off mandate.*
2. **In-app AI**: matching explanations, shortlist briefs, summaries in the
   product need metered Claude API (supersedes part of ADR-018, with the
   £20/£50 caps + `ai_usage_log`). Conversational-only keeps cost zero but
   caps the product. *Recommendation: introduce with the matching feature,
   not before.*
3. **Multi-seat attribution**: add `app_user` + owner columns now vs when
   seat #2 arrives. *Recommendation: design columns into migration 0006 as
   nullable-with-default-Matt so analytics queries exist from day one;
   auth stays single-user until real seats.*
4. **Outbound email/calendar** (interview confirmations to all parties):
   new integration surface (Google Workspace send). Real value, real scope —
   phase it deliberately; ADR-011's ingestion boundary is unaffected but a
   send-capability needs its own ADR.

## 8. Phasing (each phase shippable, ADR-016 discipline)

- **Phase A — writes in the UI (ADR-022)**: quick capture everywhere (log
  activity, add person with live resolution, edit deal/next step, kanban
  stage moves with confirmations), CV/document upload. Kills the "read-only
  is useless" problem. *No schema change needed.*
- **Phase B — the recruitment core (migration 0006)**: `interview` entity +
  scheduling records; placement fields (accepted_at, start_date, salary,
  boarded_at) + `invoice`; approach-outcome logging; extended
  activity types; person taxonomy (seniority, functions, skills, sectors);
  `mandate.deal_id` link; owner attribution columns. UI: full job lifecycle
  page, interview tracker, sales board, richer person page.
- **Phase C — matching + client deliverables**: structured+trigram matching
  on job creation; shortlist builder; generated per-candidate client briefs
  (this is where in-app AI lands, with cost caps).
- **Phase D — integrations**: outbound calendar/email confirmations;
  Granola transcript pull; Gmail ingestion revival (ADR-014 spike still
  gates); embeddings if matching needs them.

## 9. What already exists and survives unchanged

Person-centric core, resolution machinery, merge/erasure + GDPR/statutory
paths, audit trail, suppression, insight views, auth model, deployment
pipeline (Vercel + Supabase, migrations-only). The brief validates the
foundations — everything above *extends*, nothing rips out.

---

## 10. UAT feedback — round 1 (Matt, 3 Jul 2026, post-IA build)

Verbatim-in-spirit backlog from first real click-through. Priority ordering
agreed in conversation; each lands via the engineering.md workflow.

### Bugs
- **B1** New-company dialog: pre-filled status renders lowercase ("prospect")
  while the dropdown list capitalizes — the select trigger doesn't apply the
  same label treatment. *(fixed same day)*

### Quick wins (no schema, no AI)
- **Q1 Person picker = search, not dropdown** — add-candidate must scale to
  thousands: typeahead search (3+ chars) against people, everywhere a person
  is picked.
- **Q2 Search typeahead** — master search previews grouped results after ~3
  characters, keyboard-navigable; Enter → full results page.
- **Q3 Filters on every list page** — jobs, pipeline, companies, deals,
  people: filter by status/stage/sector/seniority/location etc.
- **Q4 Archive/close jobs** — set mandate status (completed/cancelled/
  on_hold) from the job page with confirm; archived jobs leave the pipeline
  but stay linkable.
- **Q5 Edit company** — status, sectors, notes, domains editable from the
  company page.
- **Q6 Tag inputs autocomplete** — skills/sectors/functions inputs suggest
  existing values as clickable chips after a few characters; prevents
  taxonomy drift ("hydrogen" vs "hydrogn").

### Product-shaping
- **P1 Deals = commercial view; Jobs = operational view.** A deal is the fee
  lens on the same engagement; winning a deal converts it into a job
  (mandate.deal_id already links them — add the convert flow). Deals page
  gains **stage-weighted win probability** and a weighted-pipeline forecast
  (each deal stage carries a win %; Σ value × weight = expected fees).
- **P2 Pipeline page slims down** — top-line stats per job (live count,
  stage distribution, **chance-to-fill %** weighted by candidacy stages)
  with the full kanban living on the job page. Stage weights start as
  domain constants; tune against reality later.
- **P3 Kanban drag & drop** — drag cards between stage columns (same
  confirm-before-consequence rules on drop).
- **P4 Job page sub-features (explore)** — shortlist builder + client-brief
  export, job-scoped documents (spec), client contacts on the job, timeline,
  notes; candidate comparison.

### Intelligence (needs the in-app AI decision — supersedes part of ADR-018)
- **I1 CV-first candidate creation** — drag-drop a CV onto Add Person: parse
  → structured extraction (name, contacts, employment history with titles/
  employers/dates, skills, summary) → prefill the person + employment +
  taxonomy, attach the file, and render a **standardised CV** on the person
  page (uniform layout regardless of source formatting; original still
  downloadable). Text extraction exists (Phase A); *standardisation requires
  LLM structured extraction* — pennies per CV under the ADR-015 caps, logged
  to ai_usage_log.
- **I2 Company enrichment** — investigate Apollo (already connected via MCP;
  org enrichment endpoints exist and are within existing plan credits)
  before buying anything else (Crunchbase et al.). Enrich on demand from the
  company page: size, industry, description, socials.
- **I3 Boolean search on people** — AND/OR/NOT over names, titles, skills,
  CV text (Postgres websearch_to_tsquery over parsed_text + fields).

### Sequencing
1. **R1**: B1 + Q1 + Q2 + Q4 + Q5 (make daily driving frictionless)
2. **R2**: Q3 + Q6 + P1 + P2 (filters, tags, commercial/operational split,
   probability weighting)
3. **R3**: P3 + I1 + I3 (drag-drop; CV pipeline once the AI ADR is agreed)
4. **R4**: P4 + I2 (job-page depth, enrichment)

## 11. UAT feedback — round 2 (Matt, 4 Jul 2026, post-R3)

### Bugs (fixed same-day)
- **B2 Kanban drag ghost** — dragging a candidate card rasterised the whole
  UI as the drag image; explicit cloned drag ghost fixes it.
- **B3 Raw Select values** — filter dropdowns showed the `__any__` sentinel
  and enum values rendered raw/lowercase (`on_hold`); Base UI's Select.Value
  needs explicit children, fixed across every Select.

### R4 — the job page becomes the workspace (P4, scoped by Matt)
- **Candidate feedback per candidacy** — capture client/consultant feedback
  against a candidate-in-job; must surface on BOTH the job page and the
  person page (both records linked to the same entry).
- **The brief** — the role's full spec on the job page: salary, package
  (bonus, car allowance, pension, notice period), team, location, and the
  **line manager as a linked person record**. Feeds future company maps.
- **JD file at hand** — the job-description file attached to the mandate,
  one click to (re)download, ready to forward; document table already
  supports mandate-linked `spec` docs.
- **Stage-dwell nudges** — "X has been at client_interview 9 days — chase?"
  surfaced proactively (dashboard next-actions), building on stage_changed_at.
  Matt: "the more the platform surfaces at the right time, the better."
- **Activity log on the job page** — everything that happened on this
  mandate, at the bottom of the page.

### Roadmap (bigger pieces, each needs a design pass / ADR before build)
- **Email through the system** — send/log email from SearchOS via the
  @offtakesearch.com mailbox (ADR-011 boundary). Needs a spike: Gmail API vs
  SMTP, template handling, logging to activity. Not started.
- **Company news** — surface recent, well-sourced news per company (funding
  rounds etc.) as part of the intelligence layer — only if very cheap to run
  (ADR-015 discipline; likely interactive/on-demand first, never unattended).
- **Opportunity intelligence** — watch prospect/client career pages for new
  postings and match them against candidates in the pool (location, salary,
  function). HARD CONSTRAINT: no LinkedIn scraping, ever (ADR-009) — company
  career pages/ATS feeds only; unattended runs would also reopen ADR-018.
  The guiding star, verbatim: *"if it can save me time and make me more
  money, I will be over the moon."*

## 12. The spec-in radar (Matt, 4 Jul 2026) — value-first BD

The insight, from live competitor research: a competitor's anonymised advert
was traced to Siemens by googling title + location. Watching who competitors
are recruiting for reveals live demand — and the winning move is to SPEC IN:
open the conversation by bringing the prospect a great candidate, not by
asking for anything. "I'm delivering value to them… this is the best way to
make money fast and build client relationships."

**R6 — the Radar page (JD in → spec out → matches → action):**
- Paste (or drop a file of) ANY job advert → cheap AI extraction (Haiku,
  purpose `jd_parse`, under the ADR-024 caps + logging) → a standardised
  role spec: title, seniority, location, salary/package hints, team,
  functions, skills, sectors, summary.
- The spec immediately searches OUR OWN pool first (search_people_boolean
  over the extracted terms) — ranked matches with links.
- Actions from the same page: **Create job** (mandate prefilled with the
  0010 brief fields + skills — the "drop a JD, get a standardised brief"
  flow for real briefings too), **Log BD deal** (company resolved/created
  → deal at lead with the spec appended to company notes), or — when the
  pool comes up thin, the page offers it — **Search Apollo for candidates**
  (people search by title/location/keywords; results are display-only, each
  with an Add-person affordance that runs the normal resolution flow).
- Nothing auto-creates; every write is the existing confirm-gated path.
  Sourcing stays manual and human (Matt talks to people) — the system finds,
  Matt calls. LinkedIn research stays manual (ADR-009 untouched).
