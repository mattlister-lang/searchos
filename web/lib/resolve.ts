import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";

/**
 * Entity resolution for UI writes — same chain and thresholds as
 * scripts/lib/resolve.ts and the MCP contract (ADR-006/013): exact email →
 * LinkedIn URL → trigram name (company-scoped), suppression checked first.
 */

export type NameCandidate = { personId: string; fullName: string; similarity: number };

export type Resolution =
  | { kind: "suppressed" }
  | { kind: "matched"; personId: string; matchedOn: "email" | "linkedin" | "name" }
  | { kind: "ambiguous"; candidates: NameCandidate[] }
  | { kind: "unmatched" };

export const NAME_CONFIDENCE = 0.6;

export function emailHash(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

const GENERIC_MAILBOX =
  /^(info|hello|talent|careers|jobs|admin|contact|team|office|support|sales|hr|recruitment|enquiries|noreply|no-reply)@/i;

export function isGenericMailbox(email: string): boolean {
  return GENERIC_MAILBOX.test(email.trim());
}

export function normaliseLinkedinUrl(url: string): string {
  return url
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

export async function isSuppressed(email: string): Promise<boolean> {
  const { data } = await db
    .from("suppression_list")
    .select("id")
    .eq("email_hash", emailHash(email))
    .limit(1);
  return (data?.length ?? 0) > 0;
}

export async function resolvePerson(ref: {
  email?: string | null;
  linkedinUrl?: string | null;
  name?: string | null;
  companyId?: string | null;
}): Promise<Resolution> {
  if (ref.email) {
    if (await isSuppressed(ref.email)) return { kind: "suppressed" };
    const { data } = await db
      .from("person_email")
      .select("person_id")
      .eq("email", ref.email.trim())
      .limit(1);
    if (data?.length) return { kind: "matched", personId: data[0].person_id, matchedOn: "email" };
  }

  if (ref.linkedinUrl) {
    const { data } = await db
      .from("person")
      .select("id")
      .eq("linkedin_url", normaliseLinkedinUrl(ref.linkedinUrl))
      .limit(1);
    if (data?.length) return { kind: "matched", personId: data[0].id, matchedOn: "linkedin" };
  }

  if (ref.name) {
    const { data } = await db.rpc("similar_people", {
      p_name: ref.name,
      p_company: ref.companyId ?? undefined,
    });
    const candidates: NameCandidate[] = (data ?? []).map(
      (r: { person_id: string; full_name: string; similarity: number }) => ({
        personId: r.person_id,
        fullName: r.full_name,
        similarity: Number(r.similarity),
      }),
    );
    const confident = candidates.filter((c) => c.similarity >= NAME_CONFIDENCE);
    if (ref.companyId && confident.length === 1) {
      return { kind: "matched", personId: confident[0].personId, matchedOn: "name" };
    }
    if (candidates.length > 0) return { kind: "ambiguous", candidates };
  }

  return { kind: "unmatched" };
}

export async function resolveCompanyId(ref: {
  name?: string | null;
  domain?: string | null;
}): Promise<string | null> {
  if (ref.domain) {
    const { data } = await db
      .from("company_domain")
      .select("company_id")
      .eq("domain", ref.domain.trim())
      .limit(1);
    if (data?.length) return data[0].company_id;
  }
  if (ref.name) {
    const { data } = await db
      .from("company")
      .select("id")
      .ilike("name", ref.name.trim())
      .limit(1);
    if (data?.length) return data[0].id;
  }
  return null;
}
