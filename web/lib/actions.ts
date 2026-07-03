"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import type { Database } from "@/lib/database.types";
import { db } from "@/lib/db";
import {
  ACTIVITY_TYPES,
  CANDIDACY_STAGES,
  COMPANY_STATUSES,
  DEAL_STAGES,
  INTERVIEW_KINDS,
  INTERVIEW_OUTCOMES,
  label,
  MANDATE_STATUSES,
  SECTOR_TAXONOMY,
  SENIORITY_LEVELS,
} from "@/lib/domain";
import {
  isGenericMailbox,
  normaliseLinkedinUrl,
  resolveCompanyId,
  resolvePerson,
  type NameCandidate,
} from "@/lib/resolve";
import { searchEntities, type SearchResults } from "@/lib/search";

/**
 * The write surface (ADR-022). Every action: allowlisted user, validated
 * input, operator-contract semantics. All writes land in audit_log via
 * triggers (0005). Merges and erasure are deliberately absent — they stay
 * conversational (ADR-013).
 */

export type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string }
  | { ok: false; needsConfirm: string }
  | { ok: false; ambiguous: NameCandidate[] }
  | { ok: false; matched: { personId: string; matchedOn: string } };

const optional = <T extends z.ZodType>(s: T) =>
  z.preprocess((v) => (v === "" || v == null ? undefined : v), s.optional());

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

const PersonInput = z.object({
  fullName: z.string().trim().min(2),
  email: optional(z.string().trim().email()),
  linkedinUrl: optional(z.string().trim()),
  location: optional(z.string().trim()),
  title: optional(z.string().trim()),
  companyName: optional(z.string().trim()),
  useExistingId: optional(z.string().uuid()),
  forceCreate: z.boolean().default(false),
});

export async function createPerson(raw: unknown): Promise<ActionResult> {
  await requireUser();
  const parsed = PersonInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const input = parsed.data;

  if (input.email && isGenericMailbox(input.email)) {
    return {
      ok: false,
      error: "Generic mailboxes never become person emails — link activity to the company instead.",
    };
  }

  // Operator choosing a resolution candidate: enrich, don't create.
  if (input.useExistingId) {
    return enrichPerson(input.useExistingId, input);
  }

  const companyId = input.companyName
    ? await resolveCompanyId({ name: input.companyName })
    : null;

  const resolution = await resolvePerson({
    email: input.email,
    linkedinUrl: input.linkedinUrl,
    name: input.fullName,
    companyId,
  });

  if (resolution.kind === "suppressed") {
    return { ok: false, error: "This email is on the suppression list — the person was erased and can never be re-created (ADR-008)." };
  }
  if (resolution.kind === "matched") {
    return { ok: false, matched: { personId: resolution.personId, matchedOn: resolution.matchedOn } };
  }
  if (resolution.kind === "ambiguous" && !input.forceCreate) {
    return { ok: false, ambiguous: resolution.candidates };
  }

  const { data: person, error } = await db
    .from("person")
    .insert({
      full_name: input.fullName,
      linkedin_url: input.linkedinUrl ? normaliseLinkedinUrl(input.linkedinUrl) : null,
      location: input.location ?? null,
    })
    .select("id")
    .single();
  if (error || !person) return { ok: false, error: "Insert failed." };

  if (input.email) {
    await db.from("person_email").insert({
      person_id: person.id,
      email: input.email,
      is_primary: true,
    });
  }
  await attachEmployment(person.id, input.companyName, input.title, companyId);

  revalidatePath("/people");
  return { ok: true, id: person.id };
}

async function enrichPerson(
  personId: string,
  input: z.infer<typeof PersonInput>,
): Promise<ActionResult> {
  if (input.email) {
    await db
      .from("person_email")
      .upsert({ person_id: personId, email: input.email }, { onConflict: "email", ignoreDuplicates: true });
  }
  if (input.linkedinUrl) {
    await db
      .from("person")
      .update({ linkedin_url: normaliseLinkedinUrl(input.linkedinUrl) })
      .eq("id", personId)
      .is("linkedin_url", null);
  }
  await attachEmployment(personId, input.companyName, input.title, null);
  revalidatePath("/people");
  return { ok: true, id: personId };
}

async function attachEmployment(
  personId: string,
  companyName: string | undefined,
  title: string | undefined,
  knownCompanyId: string | null,
) {
  if (!companyName && !knownCompanyId) return;
  let companyId = knownCompanyId ?? (await resolveCompanyId({ name: companyName }));
  if (!companyId && companyName) {
    const { data } = await db
      .from("company")
      .insert({ name: companyName, status: "source", sectors: [] })
      .select("id")
      .single();
    companyId = data?.id ?? null;
  }
  if (!companyId) return;
  const { data: existing } = await db
    .from("employment")
    .select("id")
    .eq("person_id", personId)
    .eq("company_id", companyId)
    .limit(1);
  if (!existing?.length) {
    await db.from("employment").insert({
      person_id: personId,
      company_id: companyId,
      title: title ?? null,
      is_current: true,
    });
  }
}

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

const ActivityInput = z.object({
  type: z.enum(ACTIVITY_TYPES),
  occurredAt: optional(z.string()),
  subject: optional(z.string().trim().max(300)),
  body: optional(z.string().trim().max(20000)),
  personIds: z.array(z.string().uuid()).default([]),
  companyId: optional(z.string().uuid()),
  dealId: optional(z.string().uuid()),
  mandateId: optional(z.string().uuid()),
});

export async function logActivity(raw: unknown): Promise<ActionResult> {
  await requireUser();
  const parsed = ActivityInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const input = parsed.data;
  if (input.personIds.length === 0 && !input.companyId && !input.dealId && !input.mandateId) {
    return { ok: false, error: "Link the activity to at least one person, company, deal or mandate." };
  }

  const { data: activity, error } = await db
    .from("activity")
    .insert({
      type: input.type,
      occurred_at: input.occurredAt ? new Date(input.occurredAt).toISOString() : new Date().toISOString(),
      subject: input.subject ?? null,
      body_raw: input.body ?? null,
      source: "manual",
      source_ref: randomUUID(),
      company_id: input.companyId ?? null,
      deal_id: input.dealId ?? null,
      mandate_id: input.mandateId ?? null,
    })
    .select("id")
    .single();
  if (error || !activity) return { ok: false, error: "Insert failed." };

  if (input.personIds.length > 0) {
    await db.from("activity_participant").insert(
      input.personIds.map((pid) => ({ activity_id: activity.id, person_id: pid })),
    );
  }
  revalidatePath("/");
  return { ok: true, id: activity.id };
}

// ---------------------------------------------------------------------------
// Companies, deals, mandates
// ---------------------------------------------------------------------------

const CompanyInput = z.object({
  name: z.string().trim().min(2),
  domain: optional(z.string().trim().toLowerCase()),
  status: z.enum(COMPANY_STATUSES).default("target"),
});

export async function createCompany(raw: unknown): Promise<ActionResult> {
  await requireUser();
  const parsed = CompanyInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const input = parsed.data;

  const existing = await resolveCompanyId({ name: input.name, domain: input.domain });
  if (existing) return { ok: false, error: "That company already exists." };

  const { data, error } = await db
    .from("company")
    .insert({ name: input.name, status: input.status, sectors: [] })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Insert failed." };
  if (input.domain) {
    await db.from("company_domain").insert({ company_id: data.id, domain: input.domain });
  }
  revalidatePath("/deals");
  return { ok: true, id: data.id };
}

const DealInput = z.object({
  dealId: optional(z.string().uuid()),
  companyName: optional(z.string().trim()),
  name: optional(z.string().trim().min(2)),
  stage: optional(z.enum(DEAL_STAGES)),
  value: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().optional()),
  nextStep: optional(z.string().trim().max(500)),
  notes: optional(z.string().trim().max(5000)),
});

export async function upsertDeal(raw: unknown): Promise<ActionResult> {
  await requireUser();
  const parsed = DealInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const input = parsed.data;

  if (input.dealId) {
    const patch: Database["public"]["Tables"]["deal"]["Update"] = {};
    if (input.stage) patch.stage = input.stage;
    if (input.nextStep !== undefined) patch.next_step = input.nextStep;
    if (input.value !== undefined) patch.value = input.value;
    if (input.notes !== undefined) patch.notes = input.notes;
    if (input.name) patch.name = input.name;
    const { error } = await db.from("deal").update(patch).eq("id", input.dealId);
    if (error) return { ok: false, error: "Update failed." };
    revalidatePath("/deals");
    return { ok: true, id: input.dealId };
  }

  if (!input.companyName || !input.name) {
    return { ok: false, error: "New deals need a company and a name." };
  }
  const companyId = await resolveCompanyId({ name: input.companyName });
  if (!companyId) {
    return { ok: false, error: `Unknown company "${input.companyName}" — create it first so resolution stays clean.` };
  }
  if (!input.nextStep) {
    return { ok: false, error: "A deal without a next step is how pipelines die — give it one." };
  }
  const { data, error } = await db
    .from("deal")
    .insert({
      company_id: companyId,
      name: input.name,
      stage: input.stage ?? "lead",
      value: input.value ?? null,
      next_step: input.nextStep,
      notes: input.notes ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Insert failed." };
  revalidatePath("/deals");
  return { ok: true, id: data.id };
}

const MandateInput = z.object({
  companyName: z.string().trim().min(2),
  title: z.string().trim().min(2),
  brief: optional(z.string().trim().max(10000)),
  seniority: optional(z.string().trim().max(40)),
  location: optional(z.string().trim().max(200)),
  salaryRange: optional(z.string().trim().max(100)),
  skills: z.preprocess(
    (v) => (typeof v === "string" ? v.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean) : v ?? []),
    z.array(z.string().max(60)).max(30),
  ),
});

export async function createMandate(raw: unknown): Promise<ActionResult> {
  await requireUser();
  const parsed = MandateInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const input = parsed.data;
  const companyId = await resolveCompanyId({ name: input.companyName });
  if (!companyId) return { ok: false, error: `Unknown company "${input.companyName}" — create it first.` };

  const { data, error } = await db
    .from("mandate")
    .insert({
      company_id: companyId,
      title: input.title,
      status: "open",
      brief: input.brief ?? null,
      seniority: input.seniority ?? null,
      location: input.location ?? null,
      salary_range: input.salaryRange ?? null,
      skills: input.skills,
      opened_at: new Date().toISOString().slice(0, 10),
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Insert failed." };
  revalidatePath("/pipeline");
  return { ok: true, id: data.id };
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

const CandidacyInput = z.object({
  personId: z.string().uuid(),
  mandateId: z.string().uuid(),
});

export async function addCandidacy(raw: unknown): Promise<ActionResult> {
  await requireUser();
  const parsed = CandidacyInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const { personId, mandateId } = parsed.data;

  const { data: existing } = await db
    .from("candidacy")
    .select("id")
    .eq("person_id", personId)
    .eq("mandate_id", mandateId)
    .limit(1);
  if (existing?.length) return { ok: false, error: "Already on this mandate." };

  const { data, error } = await db
    .from("candidacy")
    .insert({ person_id: personId, mandate_id: mandateId, stage: "identified" })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Insert failed." };
  revalidatePath("/pipeline");
  return { ok: true, id: data.id };
}

const MoveStageInput = z.object({
  candidacyId: z.string().uuid(),
  stage: z.enum(CANDIDACY_STAGES),
  confirmed: z.boolean().default(false),
});

export async function moveStage(raw: unknown): Promise<ActionResult> {
  await requireUser();
  const parsed = MoveStageInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const { candidacyId, stage, confirmed } = parsed.data;

  const { data: current } = await db
    .from("candidacy")
    .select("stage, person:person_id(full_name)")
    .eq("id", candidacyId)
    .maybeSingle();
  if (!current) return { ok: false, error: "Candidacy not found." };

  const from = CANDIDACY_STAGES.indexOf(current.stage as (typeof CANDIDACY_STAGES)[number]);
  const to = CANDIDACY_STAGES.indexOf(stage);
  const isRegression = to < from && !["rejected", "withdrawn"].includes(stage);
  const name = current.person?.full_name ?? "this candidate";

  // Confirm-before-consequence (ADR-013): regressions and placement.
  if (isRegression && !confirmed) {
    return {
      ok: false,
      needsConfirm: `Move ${name} backwards from "${current.stage}" to "${stage}"? Stage history is auditable but the pipeline position will regress.`,
    };
  }
  if (stage === "placed" && !confirmed) {
    return {
      ok: false,
      needsConfirm: `Mark ${name} as PLACED? This starts the 6-year statutory retention clock and puts the fee on the board (ADR-012). Only confirm a real, accepted placement with an agreed start date.`,
    };
  }

  const { error } = await db.from("candidacy").update({ stage }).eq("id", candidacyId);
  if (error) return { ok: false, error: "Update failed." };
  revalidatePath("/pipeline");
  return { ok: true, id: candidacyId };
}

// ---------------------------------------------------------------------------
// Documents (CV upload → private Storage bucket + document row)
// ---------------------------------------------------------------------------

/** Text extraction at upload (CV parsing) — feeds keyword/trigram matching
 *  and, later, the Phase C matching engine. Pure JS, no AI spend. */
async function extractText(file: File): Promise<string | null> {
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const name = file.name.toLowerCase();
    if (file.type === "application/pdf" || name.endsWith(".pdf")) {
      const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
      const doc = await getDocumentProxy(new Uint8Array(buffer));
      const { text } = await pdfText(doc, { mergePages: true });
      return text?.trim() || null;
    }
    if (name.endsWith(".docx")) {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer });
      return value?.trim() || null;
    }
    if (file.type.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".md")) {
      return buffer.toString("utf8").trim() || null;
    }
    return null; // unknown format: file is stored, text extraction skipped
  } catch {
    return null; // parse failure never blocks the upload
  }
}

export async function uploadDocument(formData: FormData): Promise<ActionResult> {
  await requireUser();
  const file = formData.get("file") as File | null;
  const personId = formData.get("personId") as string | null;
  const kind = (formData.get("kind") as string | null) ?? "cv";
  if (!file || file.size === 0) return { ok: false, error: "No file." };
  if (!personId || !z.string().uuid().safeParse(personId).success) {
    return { ok: false, error: "Invalid person." };
  }
  if (file.size > 10 * 1024 * 1024) return { ok: false, error: "Max 10MB." };
  if (!["cv", "spec", "terms", "other"].includes(kind)) return { ok: false, error: "Invalid kind." };
  const docKind = kind as Database["public"]["Enums"]["document_kind"];

  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-100);
  const path = `person/${personId}/${Date.now()}-${safeName}`;
  const { error: upErr } = await db.storage
    .from("documents")
    .upload(path, file, { contentType: file.type || "application/octet-stream" });
  if (upErr) return { ok: false, error: "Upload failed." };

  const parsedText = await extractText(file);

  const { data, error } = await db
    .from("document")
    .insert({
      kind: docKind,
      filename: file.name,
      storage_path: path,
      mime_type: file.type || null,
      parsed_text: parsedText,
      person_id: personId,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Metadata insert failed." };
  revalidatePath(`/people/${personId}`);
  return { ok: true, id: data.id };
}

// ---------------------------------------------------------------------------
// Phase B: interviews, offer→boarded→invoiced→paid, taxonomy (0006)
// ---------------------------------------------------------------------------

const csvToArray = z.preprocess(
  (v) => (typeof v === "string" ? v.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean) : v ?? []),
  z.array(z.string().max(60)).max(30),
);

const InterviewInput = z.object({
  candidacyId: z.string().uuid(),
  round: z.coerce.number().int().min(1).max(20).default(1),
  kind: z.enum(INTERVIEW_KINDS),
  scheduledAt: optional(z.string()),
  location: optional(z.string().trim().max(300)),
  notes: optional(z.string().trim().max(5000)),
});

export async function logInterview(raw: unknown): Promise<ActionResult> {
  await requireUser();
  const parsed = InterviewInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const i = parsed.data;
  const { data, error } = await db
    .from("interview")
    .insert({
      candidacy_id: i.candidacyId,
      round: i.round,
      kind: i.kind,
      scheduled_at: i.scheduledAt ? new Date(i.scheduledAt).toISOString() : null,
      location: i.location ?? null,
      notes: i.notes ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Insert failed." };
  revalidatePath("/");
  return { ok: true, id: data.id };
}

const OutcomeInput = z.object({
  interviewId: z.string().uuid(),
  outcome: z.enum(INTERVIEW_OUTCOMES),
  feedback: optional(z.string().trim().max(10000)),
});

export async function setInterviewOutcome(raw: unknown): Promise<ActionResult> {
  await requireUser();
  const parsed = OutcomeInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const { error } = await db
    .from("interview")
    .update({ outcome: parsed.data.outcome, feedback: parsed.data.feedback ?? null })
    .eq("id", parsed.data.interviewId);
  if (error) return { ok: false, error: "Update failed." };
  revalidatePath("/");
  return { ok: true };
}

const OfferInput = z.object({
  candidacyId: z.string().uuid(),
  salary: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().positive().optional()),
  feeAmount: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().positive().optional()),
  offerAcceptedAt: optional(z.string()),
  startDate: optional(z.string()),
  board: z.boolean().default(false),
});

export async function recordOffer(raw: unknown): Promise<ActionResult> {
  await requireUser();
  const parsed = OfferInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const o = parsed.data;

  // The brief's rule: a fee is boarded only when the offer is accepted AND a
  // start date is agreed.
  if (o.board && (!o.offerAcceptedAt || !o.startDate)) {
    return { ok: false, error: "Board only when the offer is accepted AND a start date is agreed." };
  }
  if (o.board && !o.feeAmount) {
    return { ok: false, error: "Boarding needs a fee amount." };
  }

  const patch: Database["public"]["Tables"]["candidacy"]["Update"] = {};
  if (o.salary !== undefined) patch.salary = o.salary;
  if (o.feeAmount !== undefined) patch.fee_amount = o.feeAmount;
  if (o.offerAcceptedAt) patch.offer_accepted_at = new Date(o.offerAcceptedAt).toISOString();
  if (o.startDate) patch.start_date = o.startDate;
  if (o.board) patch.boarded_at = new Date().toISOString();

  const { error } = await db.from("candidacy").update(patch).eq("id", o.candidacyId);
  if (error) return { ok: false, error: "Update failed." };
  revalidatePath("/billings");
  return { ok: true };
}

const InvoiceInput = z.object({
  candidacyId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  terms: optional(z.string().trim().max(500)),
  issuedAt: optional(z.string()),
  dueDate: optional(z.string()),
});

export async function createInvoice(raw: unknown): Promise<ActionResult> {
  await requireUser();
  const parsed = InvoiceInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const i = parsed.data;
  const { data, error } = await db
    .from("invoice")
    .insert({
      candidacy_id: i.candidacyId,
      amount: i.amount,
      terms: i.terms ?? null,
      issued_at: i.issuedAt ?? null,
      due_date: i.dueDate ?? null,
      status: i.issuedAt ? "issued" : "draft",
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Insert failed." };
  revalidatePath("/billings");
  return { ok: true, id: data.id };
}

export async function markInvoicePaid(raw: unknown): Promise<ActionResult> {
  await requireUser();
  const parsed = z.object({ invoiceId: z.string().uuid() }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const { error } = await db
    .from("invoice")
    .update({ status: "paid", paid_at: new Date().toISOString().slice(0, 10) })
    .eq("id", parsed.data.invoiceId);
  if (error) return { ok: false, error: "Update failed." };
  revalidatePath("/billings");
  return { ok: true };
}

const ProfileInput = z.object({
  personId: z.string().uuid(),
  seniority: optional(z.enum(SENIORITY_LEVELS)),
  functions: csvToArray,
  skills: csvToArray,
  sectors: csvToArray,
  location: optional(z.string().trim().max(200)),
});

export async function updatePersonProfile(raw: unknown): Promise<ActionResult> {
  await requireUser();
  const parsed = ProfileInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const p = parsed.data;
  const badSectors = p.sectors.filter((s) => !(SECTOR_TAXONOMY as readonly string[]).includes(s));
  if (badSectors.length) {
    return { ok: false, error: `Unknown sectors: ${badSectors.join(", ")}. Taxonomy: ${SECTOR_TAXONOMY.join(", ")}.` };
  }
  const { error } = await db
    .from("person")
    .update({
      seniority: p.seniority ?? null,
      functions: p.functions,
      skills: p.skills,
      sectors: p.sectors,
      ...(p.location !== undefined ? { location: p.location } : {}),
    })
    .eq("id", p.personId);
  if (error) return { ok: false, error: "Update failed." };
  revalidatePath(`/people/${p.personId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Typeahead search (read) — powers PersonPicker (Q1) and HeaderSearch (Q2).
// Reads, but they run through the same allowlisted server-action surface.
// ---------------------------------------------------------------------------

export type PersonHit = { id: string; fullName: string; currentRole?: string };
export type PersonSearchResult =
  | { ok: true; people: PersonHit[] }
  | { ok: false; error: string };

const SearchPeopleInput = z.object({ q: z.string().trim().min(2) });

/** People typeahead: name ilike, live people only, current employment folded
 *  into a disambiguation line (title · company). */
export async function searchPeople(raw: unknown): Promise<PersonSearchResult> {
  await requireUser();
  const parsed = SearchPeopleInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Type at least 2 characters." };

  const { data, error } = await db
    .from("person")
    .select("id, full_name, employment(title, is_current, company(name))")
    .is("erased_at", null)
    .ilike("full_name", `%${parsed.data.q}%`)
    .order("full_name")
    .limit(8);
  if (error) return { ok: false, error: "Search failed." };

  const people: PersonHit[] = (data ?? []).map((p) => {
    const current = p.employment.find((e) => e.is_current) ?? p.employment[0];
    const parts = [current?.title, current?.company?.name].filter(Boolean);
    return {
      id: p.id,
      fullName: p.full_name,
      currentRole: parts.length ? parts.join(" · ") : undefined,
    };
  });
  return { ok: true, people };
}

export type SearchAllResult =
  | ({ ok: true } & SearchResults)
  | { ok: false; error: string };

const SearchAllInput = z.object({ q: z.string().trim().min(3) });

/** Grouped global typeahead — same queries as the /search page (lib/search.ts),
 *  capped at 5 per group for the header dropdown. */
export async function searchAll(raw: unknown): Promise<SearchAllResult> {
  await requireUser();
  const parsed = SearchAllInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Type at least 3 characters." };
  const results = await searchEntities(parsed.data.q, 5);
  return { ok: true, ...results };
}

// ---------------------------------------------------------------------------
// Q4 — archive / close jobs (mandate status)
// ---------------------------------------------------------------------------

const MandateStatusInput = z.object({
  mandateId: z.string().uuid(),
  status: z.enum(MANDATE_STATUSES),
  confirmed: z.boolean().default(false),
});

export async function setMandateStatus(raw: unknown): Promise<ActionResult> {
  await requireUser();
  const parsed = MandateStatusInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const { mandateId, status, confirmed } = parsed.data;

  const { data: current } = await db
    .from("mandate")
    .select("status, title")
    .eq("id", mandateId)
    .maybeSingle();
  if (!current) return { ok: false, error: "Job not found." };

  // Confirm-before-consequence (ADR-013): closing an open job removes it from
  // the live pipeline. On-hold and reopening are reversible, low-stakes moves.
  const closingOpenJob =
    current.status === "open" && (status === "completed" || status === "cancelled");
  if (closingOpenJob && !confirmed) {
    return {
      ok: false,
      needsConfirm: `Set "${current.title}" to ${label(status)}? It leaves the open pipeline but stays linked to its company, deal and candidates, and can be reopened at any time.`,
    };
  }

  const { error } = await db.from("mandate").update({ status }).eq("id", mandateId);
  if (error) return { ok: false, error: "Update failed." };
  revalidatePath("/jobs");
  revalidatePath("/pipeline");
  return { ok: true, id: mandateId };
}

// ---------------------------------------------------------------------------
// Q5 — edit company (status, sectors, notes, add domain)
// ---------------------------------------------------------------------------

const CompanyUpdateInput = z.object({
  companyId: z.string().uuid(),
  status: z.enum(COMPANY_STATUSES),
  sectors: csvToArray,
  notes: z.string().trim().max(5000).default(""),
  addDomain: optional(z.string().trim().toLowerCase()),
});

export async function updateCompany(raw: unknown): Promise<ActionResult> {
  await requireUser();
  const parsed = CompanyUpdateInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const c = parsed.data;

  const badSectors = c.sectors.filter((s) => !(SECTOR_TAXONOMY as readonly string[]).includes(s));
  if (badSectors.length) {
    return { ok: false, error: `Unknown sectors: ${badSectors.join(", ")}. Taxonomy: ${SECTOR_TAXONOMY.join(", ")}.` };
  }

  // Resolution before creation: a domain already claimed elsewhere would poison
  // company resolution — reject before writing anything.
  if (c.addDomain) {
    const { data: existing } = await db
      .from("company_domain")
      .select("company_id")
      .eq("domain", c.addDomain)
      .limit(1);
    if (existing?.length) {
      return { ok: false, error: `Domain "${c.addDomain}" is already registered to a company.` };
    }
  }

  const { error } = await db
    .from("company")
    .update({ status: c.status, sectors: c.sectors, notes: c.notes || null })
    .eq("id", c.companyId);
  if (error) return { ok: false, error: "Update failed." };

  if (c.addDomain) {
    const { error: domErr } = await db
      .from("company_domain")
      .insert({ company_id: c.companyId, domain: c.addDomain });
    if (domErr) {
      return { ok: false, error: "That domain could not be added — it may already be registered." };
    }
  }

  revalidatePath(`/companies/${c.companyId}`);
  revalidatePath("/companies");
  return { ok: true, id: c.companyId };
}
