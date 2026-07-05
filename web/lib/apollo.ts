import "server-only";
import { z } from "zod";

/**
 * Apollo.io — the ONLY module that talks to the Apollo API (ADR-025 §2, the
 * mirror of ADR-024's single-module rule for Claude). Server-side only;
 * APOLLO_API_KEY never leaves Vercel server env. Same discipline throughout:
 * gracefully inert until the key is configured, every call user-initiated
 * (Apollo credits are metered — never called in a loop or on page load), and
 * nothing is written without operator confirmation.
 *
 * Apollo omits and renames response fields freely, so every schema is an
 * optional-everything subset; unknown keys are ignored (zod strips them) and
 * a missing shape degrades to "nothing found", never a crash.
 */

const APOLLO_BASE = "https://api.apollo.io/api/v1";

// ---------------------------------------------------------------------------
// One request path — key guard, transport guard, status ladder, JSON parse.
// Every Apollo call funnels through here so the error contract is written
// once (engineering.md §3, no-third-copy).
// ---------------------------------------------------------------------------

type ApolloRaw = { ok: true; body: unknown } | { ok: false; error: string };

async function apolloRequest(
  path: string,
  init?: { method?: "GET" | "POST"; body?: unknown },
): Promise<ApolloRaw> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error: "Apollo needs an API key — add APOLLO_API_KEY to the Vercel server environment, then retry.",
    };
  }

  let res: Response;
  try {
    res = await fetch(`${APOLLO_BASE}${path}`, {
      method: init?.method ?? "GET",
      headers: { "X-Api-Key": apiKey, "Content-Type": "application/json" },
      body: init?.body != null ? JSON.stringify(init.body) : undefined,
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
  return { ok: true, body };
}

// ---------------------------------------------------------------------------
// Organization enrichment (UAT I2)
// ---------------------------------------------------------------------------

/** The subset of Apollo's organization payload the product uses. Everything
 *  optional — Apollo omits fields freely; unknown keys are ignored. `id` is
 *  Apollo's organization id: cached on `company.apollo_org_id` (migration 0011)
 *  so job-postings / news lookups don't re-spend an enrichment credit
 *  (ADR-025 §4). */
export const CompanyEnrichmentSchema = z.object({
  id: z.string().nullish(),
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
  const raw = await apolloRequest(`/organizations/enrich?domain=${encodeURIComponent(domain)}`);
  if (!raw.ok) return raw;

  const parsed = z.object({ organization: CompanyEnrichmentSchema.nullish() }).safeParse(raw.body);
  if (!parsed.success || !parsed.data.organization) {
    return { ok: false, error: `Apollo has no organisation data for "${domain}".` };
  }
  return { ok: true, enrichment: parsed.data.organization };
}

// ---------------------------------------------------------------------------
// Job postings (R5/F1) — GET /organizations/{id}/job_postings
// Display-only, never persisted (ADR-025: postings are stateless opportunity
// intelligence). Response shape assumed from the Apollo API (docs truncate the
// example): { organization_job_postings: [{ id, title, url, city, state,
// country, posted_at, last_seen_at }] } — all optional, defensively parsed.
// ---------------------------------------------------------------------------

export const JobPostingSchema = z.object({
  id: z.string().nullish(),
  title: z.string().nullish(),
  url: z.string().nullish(),
  city: z.string().nullish(),
  state: z.string().nullish(),
  country: z.string().nullish(),
  posted_at: z.string().nullish(),
  last_seen_at: z.string().nullish(),
});
export type JobPosting = z.infer<typeof JobPostingSchema>;

export type JobPostingsResult =
  | { ok: true; postings: JobPosting[] }
  | { ok: false; error: string };

/** An organization's live job postings. Costs Apollo credits per page returned
 *  — one explicit click, one page. */
export async function fetchJobPostings(orgId: string): Promise<JobPostingsResult> {
  const raw = await apolloRequest(`/organizations/${encodeURIComponent(orgId)}/job_postings?per_page=25`);
  if (!raw.ok) return raw;

  const parsed = z
    .object({ organization_job_postings: z.array(JobPostingSchema).nullish() })
    .safeParse(raw.body);
  if (!parsed.success) {
    return { ok: false, error: "Apollo returned job postings in an unexpected shape." };
  }
  // Keep only postings with a title — the rest are unrenderable noise.
  const postings = (parsed.data.organization_job_postings ?? []).filter((p) => p.title);
  return { ok: true, postings };
}

// ---------------------------------------------------------------------------
// Company news (R5/F2) — POST /news_articles/search with organization_ids[]
// Response shape assumed (docs truncate the example): { news_articles: [{ id,
// title, url, published_at, description, source, publisher, category }] }.
// Apollo names the outlet inconsistently (source vs publisher) — read both.
// ---------------------------------------------------------------------------

export const NewsArticleSchema = z.object({
  id: z.string().nullish(),
  title: z.string().nullish(),
  url: z.string().nullish(),
  published_at: z.string().nullish(),
  description: z.string().nullish(),
  source: z.string().nullish(),
  publisher: z.string().nullish(),
  category: z.string().nullish(),
});
export type NewsArticle = z.infer<typeof NewsArticleSchema>;

export type NewsResult =
  | { ok: true; articles: NewsArticle[] }
  | { ok: false; error: string };

/** Recent news for an organization. Costs Apollo credits per page returned. */
export async function fetchOrgNews(orgId: string): Promise<NewsResult> {
  const raw = await apolloRequest("/news_articles/search", {
    method: "POST",
    body: { organization_ids: [orgId], per_page: 10 },
  });
  if (!raw.ok) return raw;

  const parsed = z
    .object({ news_articles: z.array(NewsArticleSchema).nullish() })
    .safeParse(raw.body);
  if (!parsed.success) {
    return { ok: false, error: "Apollo returned news in an unexpected shape." };
  }
  const articles = (parsed.data.news_articles ?? []).filter((a) => a.title);
  return { ok: true, articles };
}

// ---------------------------------------------------------------------------
// People match / find-email (R5/F3) — POST /people/match
// The revealed work email and its verification status carry the feature, so
// they're read explicitly; everything else is context for the preview. A
// person Apollo can't enrich, or whose email is still locked (Apollo returns a
// "email_not_unlocked@…" placeholder), degrades to "no verified email".
// ---------------------------------------------------------------------------

const PersonMatchSchema = z.object({
  email: z.string().nullish(),
  email_status: z.string().nullish(),
  name: z.string().nullish(),
  first_name: z.string().nullish(),
  last_name: z.string().nullish(),
  title: z.string().nullish(),
  linkedin_url: z.string().nullish(),
  organization: z.object({ name: z.string().nullish() }).nullish(),
});

/** A normalised, camel-cased match with a guaranteed real email — the shape
 *  the preview dialog and the write action consume. */
export type PersonMatch = {
  email: string;
  emailStatus: string | null;
  name: string | null;
  title: string | null;
  organizationName: string | null;
  linkedinUrl: string | null;
};

export type PersonMatchResult =
  | { ok: true; match: PersonMatch }
  | { ok: false; error: string };

// Apollo returns a placeholder when the email isn't revealed on the plan
// (e.g. "email_not_unlocked@domain.com"). Match the placeholder token, never a
// real domain that merely ends in "domain.com".
const LOCKED_EMAIL = /not_unlocked|email_not_found/i;

/** Find a person's work email by full name + their employer's domain. Costs an
 *  Apollo credit — explicit click only. B2B legitimate interest (ADR-025 §5);
 *  the write path enforces suppression + uniqueness before anything is saved. */
export async function matchPerson(ref: {
  name: string;
  domain: string;
}): Promise<PersonMatchResult> {
  const raw = await apolloRequest("/people/match", {
    method: "POST",
    body: { name: ref.name, domain: ref.domain },
  });
  if (!raw.ok) return raw;

  const parsed = z.object({ person: PersonMatchSchema.nullish() }).safeParse(raw.body);
  if (!parsed.success || !parsed.data.person) {
    return { ok: false, error: `Apollo found no match for "${ref.name}" at ${ref.domain}.` };
  }
  const p = parsed.data.person;
  const email = p.email?.trim().toLowerCase();
  if (!email || LOCKED_EMAIL.test(email)) {
    return {
      ok: false,
      error: `Apollo matched ${p.name ?? ref.name} but has no verified email to reveal.`,
    };
  }
  return {
    ok: true,
    match: {
      email,
      emailStatus: p.email_status ?? null,
      name: p.name ?? ([p.first_name, p.last_name].filter(Boolean).join(" ") || null),
      title: p.title ?? null,
      organizationName: p.organization?.name ?? null,
      linkedinUrl: p.linkedin_url ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// People search (R6 / Radar, product brief §12) — POST /mixed_people/api_search
// Display-only candidate sourcing by title/location/keywords; results are
// shown, never persisted, and each carries an "Add person" affordance that runs
// the normal resolution flow (nothing auto-creates). This endpoint deliberately
// does NOT return emails/phones (Apollo reveals those only via people/match,
// the find-email path) — so a match is pure context for the operator to decide.
// Response shape assumed (docs truncate the example, L-030): { people: [{ id,
// name, first_name, last_name, title, linkedin_url, city, state, country,
// organization: { name } }] } — all optional, defensively parsed.
// ---------------------------------------------------------------------------

const ApolloPersonSchema = z.object({
  id: z.string().nullish(),
  name: z.string().nullish(),
  first_name: z.string().nullish(),
  last_name: z.string().nullish(),
  title: z.string().nullish(),
  linkedin_url: z.string().nullish(),
  city: z.string().nullish(),
  state: z.string().nullish(),
  country: z.string().nullish(),
  organization: z.object({ name: z.string().nullish() }).nullish(),
});

/** A normalised, camel-cased person hit — the shape the Radar list + Add-person
 *  prefill consume. */
export type ApolloPerson = {
  name: string;
  title: string | null;
  organizationName: string | null;
  location: string | null;
  linkedinUrl: string | null;
};

export type PeopleSearchResult =
  | { ok: true; people: ApolloPerson[] }
  | { ok: false; error: string };

/** Search Apollo's people index by title / location / keywords. Costs Apollo
 *  credits per page — one explicit click, one page (per_page 10). */
export async function searchPeople(ref: {
  titles?: string[];
  locations?: string[];
  keywords?: string;
}): Promise<PeopleSearchResult> {
  const body: Record<string, unknown> = { per_page: 10 };
  if (ref.titles?.length) body.person_titles = ref.titles;
  if (ref.locations?.length) body.person_locations = ref.locations;
  if (ref.keywords?.trim()) body.q_keywords = ref.keywords.trim();

  const raw = await apolloRequest("/mixed_people/api_search", { method: "POST", body });
  if (!raw.ok) return raw;

  // Apollo has keyed people search results as "people" and (historically)
  // "contacts" — read both, prefer whichever is populated.
  const parsed = z
    .object({
      people: z.array(ApolloPersonSchema).nullish(),
      contacts: z.array(ApolloPersonSchema).nullish(),
    })
    .safeParse(raw.body);
  if (!parsed.success) {
    return { ok: false, error: "Apollo returned people in an unexpected shape." };
  }
  const rows = parsed.data.people?.length ? parsed.data.people : (parsed.data.contacts ?? []);

  const people: ApolloPerson[] = rows
    .map((p) => ({
      name: p.name ?? ([p.first_name, p.last_name].filter(Boolean).join(" ") || ""),
      title: p.title ?? null,
      organizationName: p.organization?.name ?? null,
      location: [p.city, p.state, p.country].filter(Boolean).join(", ") || null,
      linkedinUrl: p.linkedin_url ?? null,
    }))
    // Drop rows with no usable name — unrenderable, and Add-person needs one.
    .filter((p) => p.name.length > 0);

  return { ok: true, people };
}
