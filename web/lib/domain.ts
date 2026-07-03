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

export const SENIORITY_LEVELS = [
  "junior", "mid", "senior", "manager", "head", "director", "vp", "c_suite",
] as const;

/** Sector taxonomy (ADR-004) — validated at this layer, never in the DB. */
export const SECTOR_TAXONOMY = [
  "hydrogen", "zev", "solar", "battery", "grid", "flexibility", "other",
] as const;

/** Human label for any snake_case domain value. */
export function label(value: string): string {
  return value.replaceAll("_", " ");
}
