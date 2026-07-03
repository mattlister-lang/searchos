"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  isGenericMailbox,
  normaliseLinkedinUrl,
  resolveCompanyId,
  resolvePerson,
  type NameCandidate,
} from "@/lib/resolve";

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
  type: z.enum(["email", "meeting", "call", "note", "linkedin_message"]),
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
  status: z.enum(["prospect", "client", "target", "source"]).default("target"),
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
  stage: optional(z.enum(["lead", "qualified", "proposal", "negotiation", "won", "lost"])),
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
    const patch: Record<string, unknown> = {};
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

const STAGE_ORDER = [
  "identified", "approached", "screening", "shortlisted",
  "client_interview", "offer", "placed", "rejected", "withdrawn",
] as const;

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
  stage: z.enum(STAGE_ORDER),
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

  const from = STAGE_ORDER.indexOf(current.stage as (typeof STAGE_ORDER)[number]);
  const to = STAGE_ORDER.indexOf(stage);
  const isRegression = to < from && !["rejected", "withdrawn"].includes(stage);
  const name = (current.person as unknown as { full_name: string } | null)?.full_name ?? "this candidate";

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
      kind,
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
