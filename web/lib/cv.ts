import { z } from "zod";
import { SENIORITY_LEVELS } from "@/lib/domain";

/**
 * The standardised-CV shape (I1, ADR-024) — one schema, three consumers:
 * the Claude structured-output format (lib/ai.ts), server-side validation of
 * the client-echoed parse (lib/actions.ts), and render-time parsing of
 * document.parsed_cv on the person page. One definition, imported everywhere
 * (engineering.md §2).
 *
 * Structured-outputs discipline: every field is required, absence is `null`
 * (never `.optional()`), and objects carry no unknown keys — this is what
 * lets the API guarantee schema-valid JSON.
 */
export const ParsedCvSchema = z.object({
  full_name: z.string(),
  emails: z.array(z.string()),
  linkedin_url: z.string().nullable(),
  location: z.string().nullable(),
  seniority: z.enum(SENIORITY_LEVELS).nullable(),
  functions: z.array(z.string()),
  skills: z.array(z.string()),
  sectors: z.array(z.string()),
  employment_history: z.array(
    z.object({
      company: z.string(),
      title: z.string(),
      start_date: z.string().nullable(),
      end_date: z.string().nullable(),
      is_current: z.boolean(),
    }),
  ),
  summary: z.string(),
});

export type ParsedCv = z.infer<typeof ParsedCvSchema>;
