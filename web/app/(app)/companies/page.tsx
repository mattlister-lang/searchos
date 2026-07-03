import Link from "next/link";
import { NewCompanyDialog } from "@/components/forms/deal-dialogs";
import { db } from "@/lib/db";
import { label } from "@/lib/domain";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function Companies() {
  const { data } = await db
    .from("company")
    .select("id, name, status, sectors, company_domain(domain), employment(id), deal(id, stage), mandate(id, status)")
    .order("name");
  const companies = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-semibold">Companies</h1>
        <NewCompanyDialog />
      </div>

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sectors</TableHead>
                <TableHead>Domains</TableHead>
                <TableHead className="text-right">People</TableHead>
                <TableHead className="text-right">Open deals</TableHead>
                <TableHead className="text-right">Open jobs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.map((co) => (
                <TableRow key={co.id}>
                  <TableCell>
                    <Link href={`/companies/${co.id}`} className="font-medium hover:underline">
                      {co.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">{label(co.status)}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {(co.sectors ?? []).join(", ") || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {co.company_domain.map((d) => d.domain).join(", ") || "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{co.employment.length}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {co.deal.filter((d) => !["won", "lost"].includes(d.stage)).length}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {co.mandate.filter((m) => m.status === "open").length}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
