import Link from "next/link";
import { AddPersonDialog } from "@/components/forms/add-person-dialog";
import { FilterBar, toOptions } from "@/components/filter-bar";
import { db } from "@/lib/db";
import { asMember, SECTOR_TAXONOMY, SENIORITY_LEVELS } from "@/lib/domain";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function People({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; seniority?: string; sector?: string }>;
}) {
  const { q, seniority: rawSeniority, sector: rawSector } = await searchParams;
  const seniority = asMember(SENIORITY_LEVELS, rawSeniority);
  const sector = asMember(SECTOR_TAXONOMY, rawSector);

  // Boolean search (I3): q runs through search_people_boolean — websearch
  // syntax (quoted phrases, OR, -negation) over name, skills/functions/
  // sectors and CV text, ranked in SQL. The client call stays dumb (L-018):
  // ranked ids in, `.in()` fetch out, rank order restored in TS. Erased
  // people never come back from the RPC.
  let rankedIds: string[] | null = null;
  if (q) {
    const { data: hits } = await db.rpc("search_people_boolean", { q });
    rankedIds = (hits ?? []).map((h) => h.person_id).slice(0, 200);
  }

  async function fetchPeople(ids: string[] | null) {
    let query = db
      .from("person")
      .select(
        "id, full_name, location, erased_at, person_email(email, is_primary), employment(title, is_current, company(name))",
      )
      .is("erased_at", null)
      .limit(200);
    query = ids ? query.in("id", ids) : query.order("full_name");
    if (seniority) query = query.eq("seniority", seniority);
    if (sector) query = query.contains("sectors", [sector]);
    const { data } = await query;
    const rows = data ?? [];
    if (ids) {
      const rank = new Map(ids.map((id, i) => [id, i]));
      rows.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
    }
    return rows;
  }
  // A boolean query with zero hits never touches the table.
  const people = rankedIds && rankedIds.length === 0 ? [] : await fetchPeople(rankedIds);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-heading text-2xl font-semibold">People</h1>
        <div className="flex items-center gap-2">
          <form method="get" className="w-64">
            {/* preserve active filters when the name search submits (GET) */}
            {seniority && <input type="hidden" name="seniority" value={seniority} />}
            {sector && <input type="hidden" name="sector" value={sector} />}
            <Input name="q" placeholder={'Search — "phrase", OR, -exclude…'} defaultValue={q ?? ""} />
          </form>
          <AddPersonDialog />
        </div>
      </div>

      <FilterBar filters={[
        { param: "seniority", label: "Seniority", options: toOptions(SENIORITY_LEVELS) },
        { param: "sector", label: "Sector", options: toOptions(SECTOR_TAXONOMY) },
      ]} />

      <Card>
        <CardContent>
          {people.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              {q ? `No one matches “${q}”.` : "No people yet."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Location</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {people.map((p) => {
                  const current = p.employment.find((e) => e.is_current);
                  const primary =
                    p.person_email.find((e) => e.is_primary) ?? p.person_email[0];
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Link
                          href={`/people/${p.id}`}
                          className="font-medium hover:underline"
                        >
                          {p.full_name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {current?.title ?? "—"}
                      </TableCell>
                      <TableCell>
                        {current?.company?.name ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {primary?.email ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {p.location ?? "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
