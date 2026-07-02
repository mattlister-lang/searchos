import { createHash } from 'node:crypto';
import type { Sql } from 'postgres';

/**
 * Entity resolution, shared by every script that touches people.
 * The chain and its rules are ADR-006: exact email → LinkedIn URL → trigram
 * name (company-scoped where known), with the suppression list checked first
 * so an erased person is never resurrected (ADR-008). Resolution always runs
 * before creation (ADR-013 rule 2).
 */

export type PersonRef = {
  email?: string | null;
  linkedinUrl?: string | null;
  name?: string | null;
  companyId?: string | null;
};

export type NameCandidate = { personId: string; fullName: string; similarity: number };

export type Resolution =
  | { kind: 'suppressed' }
  | { kind: 'matched'; personId: string; matchedOn: 'email' | 'linkedin' | 'name'; similarity?: number }
  | { kind: 'ambiguous'; candidates: NameCandidate[] }
  | { kind: 'unmatched' };

/** No auto-link below this trigram similarity, ever (ADR-006). */
export const NAME_CONFIDENCE = 0.6;

/** Same hashing as erase_person() in SQL: SHA-256 hex of the lowercased address. */
export function emailHash(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

const GENERIC_MAILBOX =
  /^(info|hello|talent|careers|jobs|admin|contact|team|office|support|sales|hr|recruitment|enquiries|noreply|no-reply)@/i;

/** Generic mailboxes never become people (CLAUDE.md pipeline rules). */
export function isGenericMailbox(email: string): boolean {
  return GENERIC_MAILBOX.test(email.trim());
}

/** Canonical form for storage and matching: linkedin.com/in/<slug>, no protocol/www/query. */
export function normaliseLinkedinUrl(url: string): string {
  return url
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

export async function isSuppressed(sql: Sql, email: string): Promise<boolean> {
  const rows = await sql`
    select 1 from suppression_list where email_hash = ${emailHash(email)}`;
  return rows.length > 0;
}

export async function resolvePerson(sql: Sql, ref: PersonRef): Promise<Resolution> {
  if (ref.email) {
    if (await isSuppressed(sql, ref.email)) return { kind: 'suppressed' };
    const rows = await sql`
      select person_id from person_email where email = ${ref.email.trim()}`;
    if (rows.length > 0) {
      return { kind: 'matched', personId: rows[0].person_id, matchedOn: 'email' };
    }
  }

  if (ref.linkedinUrl) {
    const rows = await sql`
      select id from person where linkedin_url = ${normaliseLinkedinUrl(ref.linkedinUrl)}`;
    if (rows.length > 0) {
      return { kind: 'matched', personId: rows[0].id, matchedOn: 'linkedin' };
    }
  }

  if (ref.name) {
    const rows = await sql`
      select person_id, full_name, similarity
      from similar_people(${ref.name}, ${ref.companyId ?? null})`;
    const candidates: NameCandidate[] = rows.map((r) => ({
      personId: r.person_id,
      fullName: r.full_name,
      similarity: Number(r.similarity),
    }));
    const confident = candidates.filter((c) => c.similarity >= NAME_CONFIDENCE);
    // A name match only auto-links when scoped to a company and unambiguous
    // (ADR-006; CSV rule: "a confident name+company match").
    if (ref.companyId && confident.length === 1) {
      return {
        kind: 'matched',
        personId: confident[0].personId,
        matchedOn: 'name',
        similarity: confident[0].similarity,
      };
    }
    if (candidates.length > 0) return { kind: 'ambiguous', candidates };
  }

  return { kind: 'unmatched' };
}

/** Company match: exact domain, then case-insensitive exact name. Never fuzzy-creates. */
export async function resolveCompany(
  sql: Sql,
  ref: { name?: string | null; domain?: string | null },
): Promise<string | null> {
  if (ref.domain) {
    const rows = await sql`
      select company_id from company_domain where domain = ${ref.domain.trim()}`;
    if (rows.length > 0) return rows[0].company_id;
  }
  if (ref.name) {
    const rows = await sql`
      select id from company where lower(name) = lower(${ref.name.trim()})`;
    if (rows.length > 0) return rows[0].id;
  }
  return null;
}
