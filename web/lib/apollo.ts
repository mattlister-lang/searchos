import "server-only";
import { z } from "zod";

/**
 * Apollo.io company enrichment (UAT I2) — the ONLY module that talks to the
 * Apollo API. Server-side only; APOLLO_API_KEY never leaves Vercel server env.
 * Same discipline as lib/ai.ts: gracefully inert until the key is configured,
 * every call user-initiated (Apollo credits are metered — never called in a
 * loop or on page load), and nothing is written without operator confirmation.
 */

const APOLLO_ENRICH_URL = "https://api.apollo.io/api/v1/organizations/enrich";

/** The subset of Apollo's organization payload the product uses. Everything
 *  optional — Apollo omits fields freely; unknown keys are ignored. */
export const CompanyEnrichmentSchema = z.object({
  name: z.string().nullish(),
  website_url: z.string().nullish(),
  linkedin_url: z.string().nullish(),
  industry: z.string().nullish(),
  keywords: z.array(z.string()).nullish(),
  estimated_num_employees: z.number().nullish(),
  founded_year: z.number().nullish(),
  city: z.string().nullish(),
  country: z.string().nullish(),
  short_description: z.string().nullish(),
});
export type CompanyEnrichment = z.infer<typeof CompanyEnrichmentSchema>;

export type EnrichResult =
  | { ok: true; enrichment: CompanyEnrichment }
  | { ok: false; error: string };

/** One enrichment lookup by domain. Costs an Apollo credit — call only on an
 *  explicit operator click, and only once per preview→confirm round trip. */
export async function enrichOrganization(domain: string): Promise<EnrichResult> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error: "Apollo enrichment needs an API key — add APOLLO_API_KEY to the Vercel server environment, then retry.",
    };
  }

  let res: Response;
  try {
    res = await fetch(`${APOLLO_ENRICH_URL}?domain=${encodeURIComponent(domain)}`, {
      headers: { "X-Api-Key": apiKey, "Content-Type": "application/json" },
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "Could not reach Apollo — try again shortly." };
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: "Apollo rejected the API key — check APOLLO_API_KEY in Vercel." };
  }
  if (res.status === 429) {
    return { ok: false, error: "Apollo rate limit hit — try again in a minute." };
  }
  if (!res.ok) {
    return { ok: false, error: `Apollo error (${res.status}) — try again shortly.` };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, error: "Apollo returned an unreadable response." };
  }

  const parsed = z.object({ organization: CompanyEnrichmentSchema.nullish() }).safeParse(body);
  if (!parsed.success || !parsed.data.organization) {
    return { ok: false, error: `Apollo has no organisation data for "${domain}".` };
  }
  return { ok: true, enrichment: parsed.data.organization };
}
