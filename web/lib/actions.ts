"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  CompanyEnrichmentSchema,
  enrichOrganization,
  fetchJobPostings,
  fetchOrgNews,
  matchPerson,
  NewsArticleSchema,
  searchPeople as searchApolloPeople,
  type ApolloPerson,
  type CompanyEnrichment,
  type JobPosting,
  type NewsArticle,
  type PersonMatch,
} from "@/lib/apollo";
import { requireUser } from "@/lib/auth";
import type { Database } from "@/lib/database.types";
import { db } from "@/lib/db";
import { extractCv, extractJd, linkAiLogToDocument } from "@/lib/ai";
import { ParsedCvSchema, type ParsedCv } from "@/lib/cv";
import { type ParsedJd } from "@/lib/jd";
import {
  ACTIVITY_TYPES,
  booleanQueryFromSpec,
  CANDIDACY_STAGES,
  clampTags,
  COMPANY_STATUSES,
  DEAL_STAGES,
  FEEDBACK_SOURCES,
  INTERVIEW_KINDS,
  INTERVIEW_OUTCOMES,
  label,
  MANDATE_STATUSES,
  partitionSectors,
  SECTOR_TAXONOMY,
  SENIORITY_LEVELS,
} from "@/lib/domain";
import { extractText } from "@/lib/extract-text";
import {
  isGenericMailbox,
  isSuppressed,
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
  // E-008: the deal's primary contact, set from the dialog's PersonPicker.
  // Patch-only-when-provided, like notes — clearing stays conversational.
  primaryContactId: optional(z.string().uuid()),
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
    if (input.primaryContactId) patch.primary_contact_id = input.primaryContactId;
    const { error } = await db.from("deal").update(patch).eq("id", input.dealId);
    if (error) return { ok: false, error: "Update failed." };
    revalidatePath("/deals");
    revalidatePath(`/deals/${input.dealId}`);
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
      primary_contact_id: input.primaryContactId ?? null,
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
  // E-009 convert-deal flow: links the BD deal onto the new mandate
  // (mandate.deal_id) so the job lifecycle keeps its BD→delivery lineage.
  dealId: optional(z.string().uuid()),
});

export async function createMandate(raw: unknown): Promise<ActionResult> {
  await requireUser();
  const parsed = MandateInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const input = parsed.data;
  const companyId = await resolveCompanyId({ name: input.companyName });
  if (!companyId) return { ok: false, error: `Unknown company "${input.companyName}" — create it first.` };

  // Convert-deal flow (E-009): never link lineage to a deal that isn't there.
  if (input.dealId) {
    const { data: deal } = await db
      .from("deal")
      .select("id")
      .eq("id", input.dealId)
      .maybeSingle();
    if (!deal) return { ok: false, error: "That deal no longer exists — refresh and retry." };
  }

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
      deal_id: input.dealId ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Insert failed." };
  revalidatePath("/pipeline");
  if (input.dealId) revalidatePath(`/deals/${input.dealId}`);
  return { ok: true, id: data.id };
}

/** E-B1 (Journey B): create the job AND attach the Radar-analysed JD on the
 *  same confirm. A File can't ride a plain-object action payload (L-023), so
 *  the dialog wraps the mandate fields as JSON + the file into FormData; the
 *  mandate is created by the unchanged createMandate path and the JD lands
 *  via the one persistDocument path (kind 'spec'). If storing the JD fails
 *  after the mandate exists, compensate with a message — never a rollback
 *  (E-016 shape, same as createPersonFromCv). */
export async function createMandateWithJd(formData: FormData): Promise<ActionResult> {
  await requireUser();
  const file = formData.get("file") as File | null;
  const payloadRaw = formData.get("payload");
  if (!file || file.size === 0) return { ok: false, error: "The JD file went missing — re-attach it and retry." };
  if (file.size > 10 * 1024 * 1024) return { ok: false, error: "Max 10MB." };
  if (typeof payloadRaw !== "string") return { ok: false, error: "Invalid input." };

  let payload: unknown;
  try {
    payload = JSON.parse(payloadRaw);
  } catch {
    return { ok: false, error: "Invalid input." };
  }

  const created = await createMandate(payload);
  if (!created.ok || !created.id) return created;

  const stored = await persistDocument(file, { mandateId: created.id }, "spec", null);
  if (!stored.ok) {
    return {
      ok: false,
      error: "The job was created, but attaching the JD failed — open it from /jobs and use Upload JD.",
    };
  }
  revalidatePath(`/jobs/${created.id}`);
  return { ok: true, id: created.id };
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

/** Where a document hangs: a person (CVs), a mandate (JD/spec — F3), or a
 *  deal (proposals/terms — the R7 deal page, E-001). */
type DocumentTarget = { personId: string } | { mandateId: string } | { dealId: string };

/** The one storage-upload + document-row path, shared by uploadDocument and
 *  the CV-first flow (never a second copy). Extracts text at upload
 *  (document.parsed_text) and persists the standardised-CV JSON when the
 *  caller has one (document.parsed_cv, 0008). R4/F3 generalised the target to
 *  mandates; R7 adds deals: person documents live under person/<id>/, mandate
 *  documents (JD specs) under mandate/<id>/, deal documents (proposals/terms)
 *  under deal/<id>/ — always with exactly one owner column set. */
async function persistDocument(
  file: File,
  target: DocumentTarget,
  kind: Database["public"]["Enums"]["document_kind"],
  parsedCv: ParsedCv | null,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-100);
  const prefix = "personId" in target
    ? `person/${target.personId}`
    : "mandateId" in target
      ? `mandate/${target.mandateId}`
      : `deal/${target.dealId}`;
  const path = `${prefix}/${Date.now()}-${safeName}`;
  const { error: upErr } = await db.storage
    .from("documents")
    .upload(path, file, { contentType: file.type || "application/octet-stream" });
  if (upErr) return { ok: false, error: "Upload failed." };

  const parsedText = await extractText(file);

  const { data, error } = await db
    .from("document")
    .insert({
      kind,
      filename: file.name,
      storage_path: path,
      mime_type: file.type || null,
      parsed_text: parsedText,
      parsed_cv: parsedCv,
      person_id: "personId" in target ? target.personId : null,
      mandate_id: "mandateId" in target ? target.mandateId : null,
      deal_id: "dealId" in target ? target.dealId : null,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Metadata insert failed." };
  return { ok: true, id: data.id };
}

export async function uploadDocument(formData: FormData): Promise<ActionResult> {
  await requireUser();
  const file = formData.get("file") as File | null;
  const personId = formData.get("personId") as string | null;
  const mandateId = formData.get("mandateId") as string | null;
  const dealId = formData.get("dealId") as string | null;
  const kind = (formData.get("kind") as string | null)
    ?? (mandateId ? "spec" : dealId ? "terms" : "cv");
  if (!file || file.size === 0) return { ok: false, error: "No file." };
  // Exactly one owner — a document belongs to one person, mandate or deal.
  if ((personId ? 1 : 0) + (mandateId ? 1 : 0) + (dealId ? 1 : 0) !== 1) {
    return { ok: false, error: "Invalid document target." };
  }
  const targetId = personId ?? mandateId ?? dealId;
  if (!targetId || !z.string().uuid().safeParse(targetId).success) {
    return { ok: false, error: "Invalid document target." };
  }
  if (file.size > 10 * 1024 * 1024) return { ok: false, error: "Max 10MB." };
  if (!["cv", "spec", "terms", "other"].includes(kind)) return { ok: false, error: "Invalid kind." };
  const docKind = kind as Database["public"]["Enums"]["document_kind"];

  const stored = await persistDocument(
    file,
    personId ? { personId } : mandateId ? { mandateId } : { dealId: targetId },
    docKind,
    null,
  );
  if (!stored.ok) return stored;
  revalidatePath(personId ? `/people/${targetId}` : mandateId ? `/jobs/${targetId}` : `/deals/${targetId}`);
  return { ok: true, id: stored.id };
}

export type DocumentUrlResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

const DocumentUrlInput = z.object({ documentId: z.string().uuid() });

/** F3: one-click (re)download. Private bucket, so the browser never gets a
 *  durable URL — a short-lived signed URL is minted per click, with
 *  content-disposition set to the original filename so the file arrives
 *  ready to forward. */
export async function getDocumentUrl(raw: unknown): Promise<DocumentUrlResult> {
  await requireUser();
  const parsed = DocumentUrlInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const { data: doc } = await db
    .from("document")
    .select("storage_path, filename")
    .eq("id", parsed.data.documentId)
    .maybeSingle();
  if (!doc) return { ok: false, error: "Document not found." };

  const { data, error } = await db.storage
    .from("documents")
    .createSignedUrl(doc.storage_path, 120, { download: doc.filename ?? true });
  if (error || !data?.signedUrl) return { ok: false, error: "Could not create download link." };
  return { ok: true, url: data.signedUrl };
}

// ---------------------------------------------------------------------------
// I1 — CV-first candidate creation (ADR-024). Two steps, human in the middle:
// parseCv extracts structured JSON to PRE-FILL the Add Person dialog (nothing
// is created); createPersonFromCv runs on the operator's confirm — the
// unchanged createPerson resolution path first (golden rule 2), then the CV
// is stored via the shared document path and the profile enriched.
// ---------------------------------------------------------------------------

export type CvParseResult =
  | { ok: true; parsed: ParsedCv; aiLogId: string | null; warning?: string }
  | { ok: false; error: string };

export async function parseCv(formData: FormData): Promise<CvParseResult> {
  await requireUser();
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { ok: false, error: "No file." };
  if (file.size > 10 * 1024 * 1024) return { ok: false, error: "Max 10MB." };

  const text = await extractText(file);
  if (!text) {
    return {
      ok: false,
      error: "Could not extract text from this file — use a PDF or DOCX with selectable text, or add the person manually.",
    };
  }
  // Cost guard, Claude call and ai_usage_log entry all live in lib/ai.ts.
  return extractCv(text);
}

const CvConfirmInput = PersonInput.extend({
  seniority: optional(z.enum(SENIORITY_LEVELS)),
  functions: z.array(z.string().trim().max(60)).max(30).default([]),
  skills: z.array(z.string().trim().max(60)).max(30).default([]),
  sectors: z.array(z.string().trim().max(60)).max(30).default([]),
  aiLogId: optional(z.string().uuid()),
  parsedCv: ParsedCvSchema,
});

export async function createPersonFromCv(formData: FormData): Promise<ActionResult> {
  await requireUser();
  const file = formData.get("file") as File | null;
  const payloadRaw = formData.get("payload");
  if (!file || file.size === 0) return { ok: false, error: "The CV file went missing — re-attach it and retry." };
  if (file.size > 10 * 1024 * 1024) return { ok: false, error: "Max 10MB." };
  if (typeof payloadRaw !== "string") return { ok: false, error: "Invalid input." };

  let payload: unknown;
  try {
    payload = JSON.parse(payloadRaw);
  } catch {
    return { ok: false, error: "Invalid input." };
  }
  const parsed = CvConfirmInput.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const input = parsed.data;

  // Resolution before creation — the unchanged createPerson path. Ambiguous /
  // matched / suppressed outcomes bubble straight back to the dialog.
  const created = await createPerson(input);
  if (!created.ok || !created.id) return created;
  const personId = created.id;

  // Store the CV with its standardised JSON, then complete the AI-usage
  // audit trail: the parse-time log row gets the document id as source_ref.
  const stored = await persistDocument(file, { personId }, "cv", input.parsedCv);
  if (!stored.ok) {
    return {
      ok: false,
      error: "The person was saved, but storing the CV failed — open their page and use Upload CV.",
    };
  }
  if (input.aiLogId) await linkAiLogToDocument(input.aiLogId, stored.id);

  // Enrich, never clobber: existing profile values win, CV values fill gaps.
  // Sector tags outside the taxonomy aren't dropped — they land in skills.
  const { data: current } = await db
    .from("person")
    .select("seniority, functions, skills, sectors")
    .eq("id", personId)
    .single();
  const { sectors, rest } = partitionSectors(input.sectors);
  const profiled = await updatePersonProfile({
    personId,
    seniority: current?.seniority ?? input.seniority ?? "",
    functions: clampTags([...(current?.functions ?? []), ...input.functions]),
    skills: clampTags([...(current?.skills ?? []), ...input.skills, ...rest]),
    sectors: clampTags([...(current?.sectors ?? []), ...sectors]),
  });
  if (!profiled.ok) return profiled;

  revalidatePath("/people");
  revalidatePath(`/people/${personId}`);
  return { ok: true, id: personId };
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

export type MandateHit = { id: string; title: string; context?: string };
export type MandateSearchResult =
  | { ok: true; mandates: MandateHit[] }
  | { ok: false; error: string };

const SearchMandatesInput = z.object({ q: z.string().trim().min(2) });

/** Job typeahead (E-022 "Add to job" from the person page): title ilike,
 *  open mandates first (mandate_status enum order puts 'open' first), the
 *  client + any non-open status folded into a disambiguation line. Mirror of
 *  searchPeople, feeding the MandatePicker. */
export async function searchMandates(raw: unknown): Promise<MandateSearchResult> {
  await requireUser();
  const parsed = SearchMandatesInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Type at least 2 characters." };

  const { data, error } = await db
    .from("mandate")
    .select("id, title, status, company(name)")
    .ilike("title", `%${parsed.data.q}%`)
    .order("status")
    .order("title")
    .limit(8);
  if (error) return { ok: false, error: "Search failed." };

  const mandates: MandateHit[] = (data ?? []).map((m) => {
    const parts = [m.company?.name, m.status === "open" ? null : label(m.status)].filter(Boolean);
    return {
      id: m.id,
      title: m.title,
      context: parts.length ? parts.join(" · ") : undefined,
    };
  });
  return { ok: true, mandates };
}

// ---------------------------------------------------------------------------
// Q6 — tag autocomplete. Suggests existing values so the taxonomy doesn't
// drift ("hydrogen" vs "hydrogn"). Sectors come from the fixed taxonomy;
// skills/functions from distinct values already in use across the data.
// ---------------------------------------------------------------------------

export type TagSuggestResult =
  | { ok: true; tags: string[] }
  | { ok: false; error: string };

const SuggestTagsInput = z.object({
  field: z.enum(["skills", "functions", "sectors"]),
  q: z.string().trim().min(1),
});

/** Boring linear scan over ≤200 rows — fine at this scale. Candidate for a SQL
 *  lateral `unnest` distinct-values view if the pool ever grows large. */
export async function suggestTags(raw: unknown): Promise<TagSuggestResult> {
  await requireUser();
  const parsed = SuggestTagsInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Type at least 1 character." };
  const { field, q } = parsed.data;
  const prefix = q.toLowerCase();

  // Fixed taxonomy: no query needed.
  if (field === "sectors") {
    return { ok: true, tags: SECTOR_TAXONOMY.filter((s) => s.startsWith(prefix)).slice(0, 8) };
  }

  // Distinct existing skills/functions. Skills also come from mandates. We
  // fetch the arrays and flatten in TS — empty arrays are harmless noise the
  // prefix filter drops. (A DB-side "not empty" filter can't be expressed
  // type-safely: the typed client string-interpolates `.neq` values, so the
  // `'{}'` literal an array column needs won't pass without a banned cast —
  // L-018.)
  const pool: string[] = [];
  if (field === "skills") {
    const [people, mandates] = await Promise.all([
      db.from("person").select("skills").limit(200),
      db.from("mandate").select("skills").limit(200),
    ]);
    (people.data ?? []).forEach((r) => pool.push(...r.skills));
    (mandates.data ?? []).forEach((r) => pool.push(...r.skills));
  } else {
    const people = await db.from("person").select("functions").limit(200);
    (people.data ?? []).forEach((r) => pool.push(...r.functions));
  }

  const seen = new Set<string>();
  const tags: string[] = [];
  for (const value of pool) {
    const t = value.toLowerCase();
    if (t.startsWith(prefix) && !seen.has(t)) {
      seen.add(t);
      tags.push(t);
      if (tags.length >= 8) break;
    }
  }
  return { ok: true, tags };
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
// R4/F1 — candidacy feedback. One row (0010) surfaces on BOTH the job page
// (mandate → candidacy) and the person page (person → candidacy); both routes
// are revalidated on every write. Audit lands via the 0005 trigger.
// ---------------------------------------------------------------------------

const FeedbackInput = z.object({
  candidacyId: z.string().uuid(),
  source: z.enum(FEEDBACK_SOURCES),
  author: optional(z.string().trim().max(200)),
  body: z.string().trim().min(2).max(10000),
});

/** The candidacy's two page anchors, for revalidation and existence checks. */
async function candidacyAnchors(candidacyId: string) {
  const { data } = await db
    .from("candidacy")
    .select("person_id, mandate_id")
    .eq("id", candidacyId)
    .maybeSingle();
  return data ?? null;
}

export async function logFeedback(raw: unknown): Promise<ActionResult> {
  await requireUser();
  const parsed = FeedbackInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const input = parsed.data;

  const anchors = await candidacyAnchors(input.candidacyId);
  if (!anchors) return { ok: false, error: "Candidacy not found." };

  const { data, error } = await db
    .from("candidacy_feedback")
    .insert({
      candidacy_id: input.candidacyId,
      source: input.source,
      author: input.author ?? null,
      body: input.body,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Insert failed." };

  revalidatePath(`/jobs/${anchors.mandate_id}`);
  revalidatePath(`/people/${anchors.person_id}`);
  return { ok: true, id: data.id };
}

const DeleteFeedbackInput = z.object({
  feedbackId: z.string().uuid(),
  confirmed: z.boolean().default(false),
});

/** Deleting feedback is destructive (ADR-013 rule 1): confirm first. The
 *  audit log keeps the deletion evidence (0005) unless/until the person is
 *  erased. */
export async function deleteFeedback(raw: unknown): Promise<ActionResult> {
  await requireUser();
  const parsed = DeleteFeedbackInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const { feedbackId, confirmed } = parsed.data;

  const { data: fb } = await db
    .from("candidacy_feedback")
    .select("id, source, candidacy_id")
    .eq("id", feedbackId)
    .maybeSingle();
  if (!fb) return { ok: false, error: "Feedback not found." };

  if (!confirmed) {
    return {
      ok: false,
      needsConfirm: `Delete this ${label(fb.source)} feedback? It disappears from both the job and person pages; the deletion itself stays in the audit log.`,
    };
  }

  const anchors = await candidacyAnchors(fb.candidacy_id);
  const { error } = await db.from("candidacy_feedback").delete().eq("id", feedbackId);
  if (error) return { ok: false, error: "Delete failed." };

  if (anchors) {
    revalidatePath(`/jobs/${anchors.mandate_id}`);
    revalidatePath(`/people/${anchors.person_id}`);
  }
  return { ok: true, id: feedbackId };
}

// ---------------------------------------------------------------------------
// R4/F2 — the role brief on the mandate. Salary and location reuse the 0006
// columns (salary_range, location); team/package fields and the hiring
// manager (a real person link, 0010) are new. The dialog always submits the
// full brief state, so empty fields clear their columns deliberately.
// ---------------------------------------------------------------------------

const MandateBriefInput = z.object({
  mandateId: z.string().uuid(),
  brief: optional(z.string().trim().max(10000)),
  salaryRange: optional(z.string().trim().max(100)),
  location: optional(z.string().trim().max(200)),
  team: optional(z.string().trim().max(200)),
  bonus: optional(z.string().trim().max(200)),
  carAllowance: optional(z.string().trim().max(200)),
  pension: optional(z.string().trim().max(200)),
  noticePeriod: optional(z.string().trim().max(200)),
  hiringManagerId: optional(z.string().uuid()),
});

export async function updateMandateBrief(raw: unknown): Promise<ActionResult> {
  await requireUser();
  const parsed = MandateBriefInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const input = parsed.data;

  // The hiring manager must be a real, live person — never a dangling id,
  // never an erased record (the FK would allow the former; we don't).
  if (input.hiringManagerId) {
    const { data: hm } = await db
      .from("person")
      .select("id, erased_at")
      .eq("id", input.hiringManagerId)
      .maybeSingle();
    if (!hm) return { ok: false, error: "Hiring manager not found — pick them via search." };
    if (hm.erased_at) return { ok: false, error: "That person record was erased and cannot be linked." };
  }

  const { error } = await db
    .from("mandate")
    .update({
      brief: input.brief ?? null,
      salary_range: input.salaryRange ?? null,
      location: input.location ?? null,
      team: input.team ?? null,
      bonus: input.bonus ?? null,
      car_allowance: input.carAllowance ?? null,
      pension: input.pension ?? null,
      notice_period: input.noticePeriod ?? null,
      hiring_manager_id: input.hiringManagerId ?? null,
    })
    .eq("id", input.mandateId);
  if (error) return { ok: false, error: "Update failed." };

  revalidatePath(`/jobs/${input.mandateId}`);
  revalidatePath("/jobs");
  return { ok: true, id: input.mandateId };
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

// ---------------------------------------------------------------------------
// I2 — Apollo company enrichment. Two steps, human in the middle (same shape
// as CV parsing): fetchCompanyEnrichment costs one Apollo credit and returns
// a preview — nothing is written; applyCompanyEnrichment runs on the
// operator's confirm and appends a dated block to the company notes. The
// audit trail comes for free (company UPDATE lands in audit_log, 0005).
// ---------------------------------------------------------------------------

export type EnrichPreviewResult =
  | { ok: true; enrichment: CompanyEnrichment; domain: string }
  | { ok: false; error: string };

const EnrichFetchInput = z.object({ companyId: z.string().uuid() });

export async function fetchCompanyEnrichment(raw: unknown): Promise<EnrichPreviewResult> {
  await requireUser();
  const parsed = EnrichFetchInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const { data: domains } = await db
    .from("company_domain")
    .select("domain")
    .eq("company_id", parsed.data.companyId)
    .limit(1);
  const domain = domains?.[0]?.domain;
  if (!domain) {
    return { ok: false, error: "Apollo enriches by domain — add the company's domain first (Edit company)." };
  }

  const result = await enrichOrganization(domain);
  if (!result.ok) return result;

  // Cache Apollo's org id so the openings / news lookups (R5) don't re-spend an
  // enrichment credit to resolve it (ADR-025 §4). Only when currently unset —
  // append never clobber. Not personal data; a lookup key, so no confirm gate.
  if (result.enrichment.id) {
    await db
      .from("company")
      .update({ apollo_org_id: result.enrichment.id })
      .eq("id", parsed.data.companyId)
      .is("apollo_org_id", null);
  }
  return { ok: true, enrichment: result.enrichment, domain };
}

/** Append a dated block to a company's notes — append-never-clobber, bounded to
 *  the 5000-char budget the edit form enforces (the slice trims the appended
 *  block, never Matt's own notes). The ONE implementation for every notes-append
 *  site (enrichment, news, spec-in) — no third hand-rolled copy (engineering.md
 *  §3). Callers build the block (with its dated header); this owns fetch +
 *  append + write. */
async function appendCompanyNotes(
  companyId: string,
  block: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: company } = await db
    .from("company")
    .select("notes")
    .eq("id", companyId)
    .maybeSingle();
  if (!company) return { ok: false, error: "Company not found." };

  const existing = company.notes ? `${company.notes}\n\n` : "";
  const notes = (existing + block).slice(0, 5000);

  const { error } = await db.from("company").update({ notes }).eq("id", companyId);
  if (error) return { ok: false, error: "Update failed." };
  return { ok: true };
}

const EnrichApplyInput = z.object({
  companyId: z.string().uuid(),
  enrichment: CompanyEnrichmentSchema,
});

export async function applyCompanyEnrichment(raw: unknown): Promise<ActionResult> {
  await requireUser();
  const parsed = EnrichApplyInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const { companyId, enrichment: e } = parsed.data;

  const lines = [
    `— Apollo enrichment (${new Date().toISOString().slice(0, 10)}) —`,
    e.industry && `Industry: ${e.industry}`,
    e.estimated_num_employees && `Employees: ~${e.estimated_num_employees}`,
    e.founded_year && `Founded: ${e.founded_year}`,
    (e.city || e.country) && `HQ: ${[e.city, e.country].filter(Boolean).join(", ")}`,
    e.linkedin_url && `LinkedIn: ${e.linkedin_url}`,
    e.keywords?.length && `Keywords: ${e.keywords.slice(0, 12).join(", ")}`,
    e.short_description && `About: ${e.short_description}`,
  ].filter(Boolean) as string[];
  if (lines.length <= 1) return { ok: false, error: "Apollo returned nothing worth saving." };

  const appended = await appendCompanyNotes(companyId, lines.join("\n"));
  if (!appended.ok) return appended;

  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/companies");
  return { ok: true, id: companyId };
}

// ---------------------------------------------------------------------------
// R5 — Apollo intelligence on the company & person pages (ADR-025). Every call
// below is a server action fired by an explicit operator click; nothing runs on
// page load. Job postings and news are DISPLAY-ONLY (never persisted); the
// found-email path is preview-then-confirm with the ADR-025 §5 safety rails.
// ---------------------------------------------------------------------------

/** Resolve a company's Apollo org id: cached id first (free), else one
 *  enrichment lookup by the first domain, caching the id so the next openings /
 *  news click is free (ADR-025 §4). */
async function resolveApolloOrgId(
  companyId: string,
): Promise<{ ok: true; orgId: string } | { ok: false; error: string }> {
  const { data: company } = await db
    .from("company")
    .select("apollo_org_id")
    .eq("id", companyId)
    .maybeSingle();
  if (!company) return { ok: false, error: "Company not found." };
  if (company.apollo_org_id) return { ok: true, orgId: company.apollo_org_id };

  const { data: domains } = await db
    .from("company_domain")
    .select("domain")
    .eq("company_id", companyId)
    .limit(1);
  const domain = domains?.[0]?.domain;
  if (!domain) {
    return { ok: false, error: "Apollo looks companies up by domain — add the company's domain first (Edit company)." };
  }

  const result = await enrichOrganization(domain);
  if (!result.ok) return result;
  const orgId = result.enrichment.id;
  if (!orgId) return { ok: false, error: `Apollo has no organisation id for "${domain}".` };

  await db
    .from("company")
    .update({ apollo_org_id: orgId })
    .eq("id", companyId)
    .is("apollo_org_id", null);
  return { ok: true, orgId };
}

const CompanyApolloInput = z.object({ companyId: z.string().uuid() });

// F1 — Openings (job postings). Display only, not persisted.
export type OpeningsResult =
  | { ok: true; postings: JobPosting[] }
  | { ok: false; error: string };

export async function fetchCompanyOpenings(raw: unknown): Promise<OpeningsResult> {
  await requireUser();
  const parsed = CompanyApolloInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const org = await resolveApolloOrgId(parsed.data.companyId);
  if (!org.ok) return org;
  return fetchJobPostings(org.orgId);
}

// F2 — Company news. Fetch is display only; append is preview-then-confirm.
export type CompanyNewsResult =
  | { ok: true; articles: NewsArticle[] }
  | { ok: false; error: string };

export async function fetchCompanyNews(raw: unknown): Promise<CompanyNewsResult> {
  await requireUser();
  const parsed = CompanyApolloInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const org = await resolveApolloOrgId(parsed.data.companyId);
  if (!org.ok) return org;
  return fetchOrgNews(org.orgId);
}

const NewsAppendInput = z.object({
  companyId: z.string().uuid(),
  articles: z.array(NewsArticleSchema).min(1).max(20),
});

/** Append a dated news digest to the company notes — append never clobber,
 *  inside the 5000-char budget the edit form enforces, trimming the news block
 *  not Matt's own notes (same discipline as applyCompanyEnrichment). */
export async function appendCompanyNews(raw: unknown): Promise<ActionResult> {
  await requireUser();
  const parsed = NewsAppendInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const { companyId, articles } = parsed.data;

  const items = articles
    .filter((a) => a.title)
    .slice(0, 8)
    .map((a) => {
      const outlet = a.source ?? a.publisher;
      const when = a.published_at ? a.published_at.slice(0, 10) : null;
      const meta = [outlet, when].filter(Boolean).join(", ");
      const head = `• ${a.title}${meta ? ` (${meta})` : ""}`;
      return a.url ? `${head}\n  ${a.url}` : head;
    });
  if (items.length === 0) return { ok: false, error: "No news worth saving." };

  const block = [`— Apollo news (${new Date().toISOString().slice(0, 10)}) —`, ...items].join("\n");
  const appended = await appendCompanyNotes(companyId, block);
  if (!appended.ok) return appended;

  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/companies");
  return { ok: true, id: companyId };
}

// F3 — Find email on the person page. Preview (findPersonEmail) spends one
// Apollo credit and shows the revealed email + status; nothing is written.
// addFoundEmail runs on confirm behind BOTH ADR-025 §5 rails: suppression (an
// erased address can never re-enter, ADR-008) and person_email uniqueness (an
// address belongs to exactly one person, ADR-006).
export type FindEmailResult =
  | { ok: true; match: PersonMatch }
  | { ok: false; error: string };

const FindEmailInput = z.object({ personId: z.string().uuid() });

export async function findPersonEmail(raw: unknown): Promise<FindEmailResult> {
  await requireUser();
  const parsed = FindEmailInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const { data: person } = await db
    .from("person")
    .select(
      "id, full_name, erased_at, employment(is_current, company(name, company_domain(domain)))",
    )
    .eq("id", parsed.data.personId)
    .maybeSingle();
  if (!person) return { ok: false, error: "Person not found." };
  if (person.erased_at) return { ok: false, error: "This record was erased — no lookups." };

  const current = person.employment.find((e) => e.is_current);
  if (!current?.company) {
    return { ok: false, error: "No current employer on file — add their current company first, then retry." };
  }
  const domain = current.company.company_domain?.[0]?.domain;
  if (!domain) {
    return {
      ok: false,
      error: `${current.company.name} has no domain on file — add it on the company page so Apollo can match by employer.`,
    };
  }

  return matchPerson({ name: person.full_name, domain });
}

const AddFoundEmailInput = z.object({
  personId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email(),
});

export async function addFoundEmail(raw: unknown): Promise<ActionResult> {
  await requireUser();
  const parsed = AddFoundEmailInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const { personId, email } = parsed.data;

  // Same pipeline rule as createPerson: a generic mailbox never becomes a
  // person email (a shared address poisons resolution forever).
  if (isGenericMailbox(email)) {
    return { ok: false, error: "Generic mailboxes never become person emails — link activity to the company instead." };
  }

  // Rail 1 (ADR-025 §5 / ADR-008): an erased person's address must never
  // re-enter. Hashed + checked exactly as erase_person writes the list.
  if (await isSuppressed(email)) {
    return { ok: false, error: "This email is on the suppression list — it belonged to an erased record and can never be re-added (ADR-008)." };
  }

  // Rail 2 (ADR-006): person_email is globally unique — an address belongs to
  // exactly one person. If already claimed, refuse and name the conflict.
  const { data: existing } = await db
    .from("person_email")
    .select("person_id")
    .eq("email", email)
    .limit(1);
  if (existing?.length) {
    return existing[0].person_id === personId
      ? { ok: false, error: "This person already has that email." }
      : { ok: false, error: "That email already belongs to another record — resolve before adding." };
  }

  // is_primary only if the person has no primary yet.
  const { data: primaries } = await db
    .from("person_email")
    .select("id")
    .eq("person_id", personId)
    .eq("is_primary", true)
    .limit(1);

  const { error } = await db
    .from("person_email")
    .insert({ person_id: personId, email, is_primary: !primaries?.length });
  if (error) return { ok: false, error: "Insert failed — the address may already be in use." };

  revalidatePath(`/people/${personId}`);
  return { ok: true, id: personId };
}

// ---------------------------------------------------------------------------
// R6 — the Radar page (product brief §12): JD in → spec out → matches → action.
// The whole page is STATELESS — nothing is persisted until Matt takes an
// explicit action (Create job / Log BD deal / Add person), each of which runs
// an existing confirm-gated write path. These read/parse actions just power the
// interactive workspace; every AI call is logged (ADR-024), every Apollo call
// is one explicit click (ADR-025).
// ---------------------------------------------------------------------------

export type JdParseResult =
  | { ok: true; parsed: ParsedJd; aiLogId: string | null; warning?: string }
  | { ok: false; error: string };

const AnalyseJdInput = z.object({ text: z.string().trim().min(20) });

/** F1 — parse a pasted job advert. Cost guard, Claude call and ai_usage_log
 *  entry all live in lib/ai.ts (purpose "jd_parse"). */
export async function analyseJdText(raw: unknown): Promise<JdParseResult> {
  await requireUser();
  const parsed = AnalyseJdInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Paste at least a couple of lines of the advert first." };
  }
  return extractJd(parsed.data.text);
}

/** F1 — parse a dropped job-advert file. Same extractText path as parseCv, then
 *  the same extractJd. */
export async function analyseJdFile(formData: FormData): Promise<JdParseResult> {
  await requireUser();
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { ok: false, error: "No file." };
  if (file.size > 10 * 1024 * 1024) return { ok: false, error: "Max 10MB." };

  const text = await extractText(file);
  if (!text || text.trim().length < 20) {
    return {
      ok: false,
      error: "Could not extract enough text from this file — use a PDF/DOCX with selectable text, or paste the advert.",
    };
  }
  return extractJd(text);
}

// F2 — internal match: build a Boolean query from the spec's skills + title,
// run it through search_people_boolean (the same RPC the People page uses),
// hydrate the top ~10 live people for a ranked list. Read-only.
export type SpecMatch = {
  id: string;
  fullName: string;
  currentRole: string | null;
  seniority: string | null;
  sectors: string[];
};

export type SpecMatchResult =
  | { ok: true; people: SpecMatch[]; query: string }
  | { ok: false; error: string };

const SpecMatchInput = z.object({
  title: optional(z.string().trim().max(200)),
  skills: z.array(z.string().trim().max(60)).max(30).default([]),
});

export async function matchSpecInternal(raw: unknown): Promise<SpecMatchResult> {
  await requireUser();
  const parsed = SpecMatchInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const { title, skills } = parsed.data;

  const query = booleanQueryFromSpec({ title, skills });
  if (!query.trim()) return { ok: true, people: [], query };

  const { data: hits, error } = await db.rpc("search_people_boolean", { q: query });
  if (error) return { ok: false, error: "Pool search failed." };
  const ids = (hits ?? []).map((h) => h.person_id).slice(0, 10);
  if (ids.length === 0) return { ok: true, people: [], query };

  const { data } = await db
    .from("person")
    .select("id, full_name, seniority, sectors, employment(title, is_current, company(name))")
    .is("erased_at", null)
    .in("id", ids);

  const rank = new Map(ids.map((id, i) => [id, i]));
  const people: SpecMatch[] = (data ?? [])
    .map((p) => {
      const current = p.employment.find((e) => e.is_current) ?? p.employment[0];
      const parts = [current?.title, current?.company?.name].filter(Boolean);
      return {
        id: p.id,
        fullName: p.full_name,
        currentRole: parts.length ? parts.join(" · ") : null,
        seniority: p.seniority,
        sectors: p.sectors ?? [],
      };
    })
    .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));

  return { ok: true, people, query };
}

// F3 — Log BD deal from the spec. Resolution before creation: resolve the
// company by name; if it is genuinely new, creating it is confirm-gated
// (needsConfirm) so a spec-in never blind-creates. Then reuse upsertDeal (the
// resolution + required-next-step + insert path) for a lead-stage deal, and
// append the spec summary to the company notes (append-never-clobber).
const SpecDealInput = z.object({
  companyName: z.string().trim().min(2),
  name: z.string().trim().min(2).max(200),
  nextStep: z.string().trim().min(2).max(500),
  summary: optional(z.string().trim().max(4000)),
  createCompany: z.boolean().default(false),
});

export async function logSpecDeal(raw: unknown): Promise<ActionResult> {
  await requireUser();
  const parsed = SpecDealInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const input = parsed.data;

  let companyId = await resolveCompanyId({ name: input.companyName });
  if (!companyId) {
    // Confirm-before-consequence: creating a new company is a deliberate step.
    if (!input.createCompany) {
      return {
        ok: false,
        needsConfirm: `"${input.companyName}" isn't in the CRM yet — create it as a prospect and log the spec-in deal?`,
      };
    }
    const { data, error } = await db
      .from("company")
      .insert({ name: input.companyName, status: "prospect", sectors: [] })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: "Could not create the company." };
    companyId = data.id;
  }

  // Reuse the deal write path (company resolution + required next step + insert).
  const dealRes = await upsertDeal({
    companyName: input.companyName,
    name: input.name,
    stage: "lead",
    nextStep: input.nextStep,
  });
  if (!dealRes.ok) return dealRes;

  // Append the spec summary to the company notes (dated, append-never-clobber).
  if (input.summary) {
    const block = [
      `— Spec-in: ${input.name} (${new Date().toISOString().slice(0, 10)}) —`,
      input.summary,
    ].join("\n");
    await appendCompanyNotes(companyId, block);
  }

  revalidatePath("/deals");
  revalidatePath(`/companies/${companyId}`);
  return { ok: true, id: dealRes.id };
}

// F3 — search Apollo's people index for candidates (offered when the pool is
// thin, available always). Display-only; each result gets an Add-person
// affordance in the UI that runs the normal resolution flow. One explicit
// click, one page, one credit (ADR-025).
export type CandidateSearchResult =
  | { ok: true; people: ApolloPerson[] }
  | { ok: false; error: string };

const CandidateSearchInput = z.object({
  title: optional(z.string().trim().max(200)),
  location: optional(z.string().trim().max(200)),
  keywords: optional(z.string().trim().max(500)),
});

export async function searchApolloCandidates(raw: unknown): Promise<CandidateSearchResult> {
  await requireUser();
  const parsed = CandidateSearchInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const { title, location, keywords } = parsed.data;
  if (!title && !location && !keywords) {
    return { ok: false, error: "The spec has no title, location or skills to search Apollo with." };
  }

  return searchApolloPeople({
    titles: title ? [title] : [],
    locations: location ? [location] : [],
    keywords: keywords ?? undefined,
  });
}
