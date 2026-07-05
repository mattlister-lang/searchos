import { z } from "zod";
import { SENIORITY_LEVELS } from "@/lib/domain";

/**
 * The standardised job-spec shape (R6 / the Radar page, product brief §12) —
 * sibling of lib/cv.ts. One schema, two consumers: the Claude structured-output
 * format (lib/ai.ts) and the client-side render of the parsed spec on /radar.
 * The Radar page is stateless — nothing is persisted, so (unlike ParsedCv)
 * this shape is never written to a column or re-validated server-side; it lives
 * only for the length of the operator's session.
 *
 * Structured-outputs discipline (same as ParsedCv): every field required,
 * absence is `null` (never `.optional()`), objects carry no unknown keys — this
 * is what lets the API guarantee schema-valid JSON.
 */
export const ParsedJdSchema = z.object({
  title: z.string(),
  company_name: z.string().nullable(),
  seniority: z.enum(SENIORITY_LEVELS).nullable(),
  location: z.string().nullable(),
  salary_range: z.string().nullable(),
  bonus: z.string().nullable(),
  car_allowance: z.string().nullable(),
  pension: z.string().nullable(),
  notice_period: z.string().nullable(),
  team: z.string().nullable(),
  functions: z.array(z.string()),
  skills: z.array(z.string()),
  sectors: z.array(z.string()),
  summary: z.string(),
  requirements: z.array(z.string()),
});

export type ParsedJd = z.infer<typeof ParsedJdSchema>;
