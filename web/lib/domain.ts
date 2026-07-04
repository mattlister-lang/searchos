/**
 * Domain constants — THE single source of truth (engineering.md §2, L-001).
 * Everything that names a stage, status, kind, or taxonomy is defined here
 * and imported everywhere else. Values mirror the database enums; a
 * migration touching these updates this file in the same PR (L-005).
 */

export const CANDIDACY_STAGES = [
  "identified", "approached", "screening", "shortlisted",
  "client_interview", "offer", "placed", "rejected", "withdrawn",
] as const;
export type CandidacyStage = (typeof CANDIDACY_STAGES)[number];

/** The stages that appear as kanban columns — pipeline-live, non-terminal. */
export const LIVE_STAGES = [
  "identified", "approached", "screening", "shortlisted",
  "client_interview", "offer",
] as const;

export const TERMINAL_STAGES = ["placed", "rejected", "withdrawn"] as const;

export const DEAL_STAGES = [
  "lead", "qualified", "proposal", "negotiation", "won", "lost",
] as const;
export const OPEN_DEAL_STAGES = ["lead", "qualified", "proposal", "negotiation"] as const;

/**
 * Stage-weighted win probability (P1). Operator-tunable estimates of the
 * probability a deal at each stage is won — used for the weighted pipeline
 * forecast (Σ value × weight). Not learned values; tune against reality later.
 */
export const DEAL_STAGE_WEIGHTS: Record<(typeof DEAL_STAGES)[number], number> = {
  lead: 0.1, qualified: 0.25, proposal: 0.5, negotiation: 0.75, won: 1, lost: 0,
};

export const MANDATE_STATUSES = ["open", "on_hold", "completed", "cancelled"] as const;

export const COMPANY_STATUSES = ["prospect", "client", "target", "source"] as const;

export const ACTIVITY_TYPES = [
  "call", "meeting", "email", "note", "linkedin_message", "linkedin_post", "event",
] as const;

export const INTERVIEW_KINDS = [
  "consultant", "phone", "video", "in_person", "panel", "final",
] as const;

export const INTERVIEW_OUTCOMES = [
  "scheduled", "passed", "failed", "cancelled", "no_show",
] as const;

/** Who candidacy feedback came from (F1, migration 0010). Mirrors the
 *  feedback_source DB enum. */
export const FEEDBACK_SOURCES = ["client", "consultant"] as const;

export const SENIORITY_LEVELS = [
  "junior", "mid", "senior", "manager", "head", "director", "vp", "c_suite",
] as const;

/** Sector taxonomy (ADR-004) — validated at this layer, never in the DB. */
export const SECTOR_TAXONOMY = [
  "hydrogen", "zev", "solar", "battery", "grid", "flexibility", "other",
] as const;

/**
 * Split candidate sector tags into taxonomy members and the rest (I1).
 * CV extraction maps sectors into SECTOR_TAXONOMY where possible; anything
 * that doesn't fit is not dropped — callers move it into the free-text
 * skills field so no information is lost.
 */
export function partitionSectors(values: string[]): { sectors: string[]; rest: string[] } {
  const sectors: string[] = [];
  const rest: string[] = [];
  for (const raw of values) {
    const v = raw.trim().toLowerCase();
    if (!v) continue;
    if ((SECTOR_TAXONOMY as readonly string[]).includes(v)) sectors.push(v);
    else rest.push(v);
  }
  return { sectors, rest };
}

/**
 * Tag hygiene shared by every taxonomy write path: lowercase, trimmed,
 * deduplicated, bounded to the limits the action-layer zod schemas enforce
 * (≤60 chars per tag, ≤30 tags).
 */
export function clampTags(values: string[]): string[] {
  const seen = new Set<string>();
  for (const raw of values) {
    const v = raw.trim().toLowerCase();
    if (v && v.length <= 60) seen.add(v);
  }
  return [...seen].slice(0, 30);
}

/**
 * Chance-to-fill weighting by candidacy stage (P2). Operator-tunable estimates
 * of the probability a candidacy at each stage ends in a placement. Same
 * discipline as DEAL_STAGE_WEIGHTS — estimates, not learned; tune later.
 */
export const CANDIDACY_STAGE_WEIGHTS: Record<(typeof CANDIDACY_STAGES)[number], number> = {
  identified: 0.05, approached: 0.1, screening: 0.2, shortlisted: 0.35,
  client_interview: 0.55, offer: 0.8, placed: 1, rejected: 0, withdrawn: 0,
};

/**
 * Chance-to-fill for a job = the MAX candidacy-stage weight across the stages
 * passed in. Simple and explainable ("our best-placed candidate is at offer →
 * ~80%"). Returns 0 for an empty list. The definition lives here so every
 * consumer agrees on the number.
 */
export function chanceToFill(stages: string[]): number {
  let best = 0;
  for (const s of stages) {
    const w = CANDIDACY_STAGE_WEIGHTS[s as (typeof CANDIDACY_STAGES)[number]] ?? 0;
    if (w > best) best = w;
  }
  return best;
}

/**
 * Narrow a raw querystring value to a member of a domain list, or undefined
 * (Q3). Server-rendered filter pages validate searchParams against the domain
 * lists before touching the query — unknown values are ignored, never trusted.
 */
export function asMember<T extends readonly string[]>(
  list: T,
  value: string | undefined,
): T[number] | undefined {
  return value != null && (list as readonly string[]).includes(value)
    ? (value as T[number])
    : undefined;
}

/** Human label for any snake_case domain value. */
export function label(value: string): string {
  return value.replaceAll("_", " ");
}

/** Domain list → Select options, labelled the same way as everywhere else.
 *  Lives here (not in the client FilterBar module) because server pages call
 *  it during render — client-module exports throw when called on the server,
 *  and only at request time on force-dynamic pages (L-025). */
export function toOptions(values: readonly string[]): { value: string; label: string }[] {
  return values.map((v) => ({ value: v, label: label(v) }));
}
