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
