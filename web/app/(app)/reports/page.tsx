import { db } from "@/lib/db";
import { fmtMoney } from "@/lib/format";
import { label, LIVE_STAGES } from "@/lib/domain";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function Reports() {
  const [funnel, dwell, fees] = await Promise.all([
    db.from("v_funnel").select("*"),
    db.from("v_stage_dwell").select("*").order("days_in_stage", { ascending: false }),
    db.from("v_fee_income").select("*"),
  ]);

  const mandates = [...new Set((funnel.data ?? []).map((f) => f.mandate))];
  const maxCount = Math.max(1, ...(funnel.data ?? []).map((f) => f.candidates ?? 0));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl font-semibold">Reports</h1>

      <Card>
        <CardHeader>
          <CardTitle>Funnel by mandate</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {mandates.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No open mandates with candidates yet.
            </p>
          )}
          {mandates.map((m) => {
            const rows = (funnel.data ?? []).filter((f) => f.mandate === m);
            const client = rows[0]?.client;
            return (
              <div key={m}>
                <p className="mb-2 text-sm font-medium">
                  {m} <span className="text-muted-foreground">· {client}</span>
                </p>
                <div className="flex flex-col gap-1.5">
                  {LIVE_STAGES.map((stage) => {
                    const row = rows.find((r) => r.stage === stage);
                    const count = row?.candidates ?? 0;
                    return (
                      <div key={stage} className="flex items-center gap-3 text-sm">
                        <span className="w-32 shrink-0 capitalize text-muted-foreground">
                          {label(stage)}
                        </span>
                        <div className="flex h-2 flex-1 items-center">
                          <div
                            className="h-2 rounded-r-[4px] bg-primary"
                            style={{ width: `${(count / maxCount) * 100}%` }}
                            title={`${label(stage)}: ${count}`}
                          />
                        </div>
                        <span className="w-6 text-right tabular-nums">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Time in stage</CardTitle>
        </CardHeader>
        <CardContent>
          {!dwell.data?.length ? (
            <p className="text-sm text-muted-foreground">No live candidacies.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Mandate</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead className="text-right">Days</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dwell.data.map((d) => (
                  <TableRow key={d.candidacy_id}>
                    <TableCell className="font-medium">{d.full_name}</TableCell>
                    <TableCell className="text-muted-foreground">{d.mandate}</TableCell>
                    <TableCell className="capitalize">{label(d.stage ?? "")}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {d.days_in_stage}{" "}
                      {d.stale && <Badge variant="outline">stale</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fee income</CardTitle>
        </CardHeader>
        <CardContent>
          {!fees.data?.length ? (
            <p className="text-sm text-muted-foreground">
              No placements yet — this fills as the `placed` stage is reached.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Placements</TableHead>
                  <TableHead className="text-right">Fees</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fees.data.map((f) => (
                  <TableRow key={f.month}>
                    <TableCell>{f.month}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {f.placements}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtMoney(f.fees)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
