import { CreateInvoiceDialog, MarkPaidButton } from "@/components/forms/billing-forms";
import { db } from "@/lib/db";
import { fmtDate, fmtMoney } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function Billings() {
  const [board, placements, invoices] = await Promise.all([
    db.from("v_sales_board").select("*"),
    db
      .from("candidacy")
      .select("id, salary, fee_amount, offer_accepted_at, start_date, boarded_at, placed_at, person:person_id(full_name), mandate:mandate_id(title, company(name))")
      .not("placed_at", "is", null)
      .order("placed_at", { ascending: false }),
    db
      .from("invoice")
      .select("id, amount, status, issued_at, due_date, paid_at, terms, candidacy:candidacy_id(person:person_id(full_name), mandate:mandate_id(title))")
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl font-semibold">Billings</h1>

      <Card>
        <CardHeader><CardTitle>Sales board</CardTitle></CardHeader>
        <CardContent>
          {!board.data?.length ? (
            <p className="text-sm text-muted-foreground">
              Nothing boarded yet — a fee boards when an offer is accepted and
              a start date is agreed.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Placements</TableHead>
                  <TableHead className="text-right">Boarded</TableHead>
                  <TableHead className="text-right">Invoiced</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {board.data.map((r) => (
                  <TableRow key={r.month}>
                    <TableCell>{r.month}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.placements_boarded}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoney(r.fees_boarded)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoney(r.invoiced)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoney(r.paid)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Placements</CardTitle></CardHeader>
        <CardContent>
          {!placements.data?.length ? (
            <p className="text-sm text-muted-foreground">No placements yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Mandate</TableHead>
                  <TableHead className="text-right">Salary</TableHead>
                  <TableHead className="text-right">Fee</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {placements.data.map((p) => {
                  const person = p.person as unknown as { full_name: string } | null;
                  const mandate = p.mandate as unknown as { title: string; company: { name: string } | null } | null;
                  const label = `${person?.full_name ?? "[erased]"} · ${mandate?.title ?? ""}`;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{person?.full_name ?? "[erased]"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {mandate?.title} · {mandate?.company?.name}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMoney(p.salary)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMoney(p.fee_amount)}</TableCell>
                      <TableCell>{fmtDate(p.start_date)}</TableCell>
                      <TableCell>
                        {p.boarded_at
                          ? <Badge>boarded</Badge>
                          : <Badge variant="outline">not boarded</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <CreateInvoiceDialog candidacyId={p.id} label={label}
                          defaultAmount={p.fee_amount} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Invoices</CardTitle></CardHeader>
        <CardContent>
          {!invoices.data?.length ? (
            <p className="text-sm text-muted-foreground">No invoices yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>For</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.data.map((i) => {
                  const c = i.candidacy as unknown as {
                    person: { full_name: string } | null;
                    mandate: { title: string } | null;
                  } | null;
                  return (
                    <TableRow key={i.id}>
                      <TableCell className="font-medium">
                        {c?.person?.full_name ?? "[erased]"} · {c?.mandate?.title}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMoney(i.amount)}</TableCell>
                      <TableCell>{fmtDate(i.issued_at)}</TableCell>
                      <TableCell>{fmtDate(i.due_date)}</TableCell>
                      <TableCell>
                        <Badge variant={i.status === "paid" ? "default" : "outline"}>
                          {i.status}{i.paid_at ? ` ${fmtDate(i.paid_at)}` : ""}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {i.status !== "paid" && i.status !== "void" && (
                          <MarkPaidButton invoiceId={i.id} />
                        )}
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
