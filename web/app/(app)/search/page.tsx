import Link from "next/link";
import { db } from "@/lib/db";
import { label } from "@/lib/domain";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function Search({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const term = (q ?? "").trim();

  if (!term) {
    return (
      <div>
        <h1 className="font-heading text-2xl font-semibold">Search</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Type in the search box above — people, companies, jobs and deals.
        </p>
      </div>
    );
  }

  const like = `%${term}%`;
  const [people, companies, jobs, deals] = await Promise.all([
    db.from("person").select("id, full_name, location").is("erased_at", null)
      .ilike("full_name", like).limit(15),
    db.from("company").select("id, name, status").ilike("name", like).limit(15),
    db.from("mandate").select("id, title, status, company(name)").ilike("title", like).limit(15),
    db.from("deal").select("id, name, stage, company(id, name)").ilike("name", like).limit(15),
  ]);

  const total =
    (people.data?.length ?? 0) + (companies.data?.length ?? 0) +
    (jobs.data?.length ?? 0) + (deals.data?.length ?? 0);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="font-heading text-2xl font-semibold">
        Search — “{term}”
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          {total} result{total === 1 ? "" : "s"}
        </span>
      </h1>

      {(people.data?.length ?? 0) > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">People</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {people.data!.map((p) => (
              <Link key={p.id} href={`/people/${p.id}`} className="text-sm hover:underline">
                <span className="font-medium">{p.full_name}</span>
                {p.location && <span className="text-muted-foreground"> · {p.location}</span>}
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {(companies.data?.length ?? 0) > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Companies</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {companies.data!.map((c) => (
              <Link key={c.id} href={`/companies/${c.id}`}
                className="flex items-center gap-2 text-sm hover:underline">
                <span className="font-medium">{c.name}</span>
                <Badge variant="outline" className="capitalize">{label(c.status)}</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {(jobs.data?.length ?? 0) > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Jobs</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {jobs.data!.map((m) => (
              <Link key={m.id} href={`/jobs/${m.id}`}
                className="flex items-center gap-2 text-sm hover:underline">
                <span className="font-medium">{m.title}</span>
                <span className="text-muted-foreground">{m.company?.name}</span>
                <Badge variant="outline" className="capitalize">{label(m.status)}</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {(deals.data?.length ?? 0) > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Deals</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {deals.data!.map((d) => (
              <div key={d.id} className="flex items-center gap-2 text-sm">
                <Link href="/deals" className="font-medium hover:underline">{d.name}</Link>
                {d.company && (
                  <Link href={`/companies/${d.company.id}`}
                    className="text-muted-foreground hover:underline">
                    {d.company.name}
                  </Link>
                )}
                <Badge variant="outline" className="capitalize">{d.stage}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {total === 0 && (
        <p className="text-sm text-muted-foreground">Nothing matches. Try fewer letters.</p>
      )}
    </div>
  );
}
