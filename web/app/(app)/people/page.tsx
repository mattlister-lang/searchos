import Link from "next/link";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
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

type PersonRow = {
  id: string;
  full_name: string;
  location: string | null;
  erased_at: string | null;
  person_email: { email: string; is_primary: boolean }[];
  employment: {
    title: string | null;
    is_current: boolean;
    company: { name: string } | null;
  }[];
};

export default async function People({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  let query = db
    .from("person")
    .select(
      "id, full_name, location, erased_at, person_email(email, is_primary), employment(title, is_current, company(name))",
    )
    .is("erased_at", null)
    .order("full_name")
    .limit(200);
  if (q) query = query.ilike("full_name", `%${q}%`);
  const { data } = await query;
  const people = (data ?? []) as unknown as PersonRow[];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-heading text-2xl font-semibold">People</h1>
        <form method="get" className="w-64">
          <Input name="q" placeholder="Search names…" defaultValue={q ?? ""} />
        </form>
      </div>

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
