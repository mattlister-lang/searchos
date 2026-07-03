import Link from "next/link";
import { NewMandateDialog } from "@/components/forms/pipeline-forms";
import { db } from "@/lib/db";
import { label, TERMINAL_STAGES } from "@/lib/domain";
import { fmtDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function Jobs() {
  const { data } = await db
    .from("mandate")
    .select("id, title, status, seniority, location, opened_at, company(id, name), candidacy(stage)")
    .order("opened_at", { ascending: false });
  const mandates = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-semibold">Jobs</h1>
        <NewMandateDialog />
      </div>

      <Card>
        <CardContent>
          {mandates.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              No mandates yet — open one to start a search.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Live candidates</TableHead>
                  <TableHead className="text-right">Placed</TableHead>
                  <TableHead className="text-right">Opened</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mandates.map((m) => {
                  const live = m.candidacy.filter(
                    (c) => !(TERMINAL_STAGES as readonly string[]).includes(c.stage),
                  ).length;
                  const placed = m.candidacy.filter((c) => c.stage === "placed").length;
                  return (
                    <TableRow key={m.id}>
                      <TableCell>
                        <Link href={`/jobs/${m.id}`} className="font-medium hover:underline">
                          {m.title}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {m.company ? (
                          <Link href={`/companies/${m.company.id}`} className="hover:underline">
                            {m.company.name}
                          </Link>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={m.status === "open" ? "default" : "outline"}
                          className="capitalize">
                          {label(m.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{live}</TableCell>
                      <TableCell className="text-right tabular-nums">{placed}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {fmtDate(m.opened_at)}
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
