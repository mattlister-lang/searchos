import { DealDialog, NewCompanyDialog } from "@/components/forms/deal-dialogs";
import { db } from "@/lib/db";
import { fmtDate, fmtMoney } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

const OPEN_STAGES = ["lead", "qualified", "proposal", "negotiation"];

export default async function Deals() {
  const [board, pulse] = await Promise.all([
    db.from("v_deal_board").select("*"),
    db.from("v_activity_pulse").select("*"),
  ]);
  const pulseByCompany = new Map(
    (pulse.data ?? []).map((p) => [p.company, p]),
  );
  const deals = board.data ?? [];
  const open = deals.filter((d) => OPEN_STAGES.includes(d.stage));
  const closed = deals.filter((d) => !OPEN_STAGES.includes(d.stage));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-semibold">Deals</h1>
        <div className="flex gap-2">
          <NewCompanyDialog />
          <DealDialog />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Open</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Deal</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Next step</TableHead>
                <TableHead className="text-right">Pulse</TableHead>
                <TableHead className="text-right">Updated</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {open.map((d) => {
                const p = pulseByCompany.get(d.company);
                return (
                  <TableRow key={d.deal_id}>
                    <TableCell className="font-medium">{d.name}</TableCell>
                    <TableCell>{d.company}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {d.primary_contact ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge className="capitalize">{d.stage}</Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">{fmtMoney(d.value)}</TableCell>
                    <TableCell>
                      {d.next_step ?? (
                        <Badge variant="destructive">missing</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {p ? `${p.last_30d} / ${p.prior_30d}` : "—"}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {fmtDate(d.updated_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <DealDialog deal={d} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {closed.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Won / lost</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {closed.map((d) => (
              <Badge key={d.deal_id} variant="outline" className="capitalize">
                {d.name} — {d.stage}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
