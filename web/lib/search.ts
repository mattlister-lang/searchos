import "server-only";
import { db } from "@/lib/db";

/**
 * The one global-search implementation (engineering.md §2, no-third-copy).
 * Used by BOTH the header typeahead action (searchAll) and the /search results
 * page, at different limits. One set of queries, one shape — the two consumers
 * can never drift apart.
 */
export async function searchEntities(term: string, limit: number) {
  const like = `%${term}%`;
  const [people, companies, jobs, deals] = await Promise.all([
    db.from("person").select("id, full_name, location").is("erased_at", null)
      .ilike("full_name", like).limit(limit),
    db.from("company").select("id, name, status").ilike("name", like).limit(limit),
    db.from("mandate").select("id, title, status, company(id, name)")
      .ilike("title", like).limit(limit),
    db.from("deal").select("id, name, stage, company(id, name)")
      .ilike("name", like).limit(limit),
  ]);
  return {
    people: people.data ?? [],
    companies: companies.data ?? [],
    jobs: jobs.data ?? [],
    deals: deals.data ?? [],
  };
}

export type SearchResults = Awaited<ReturnType<typeof searchEntities>>;
