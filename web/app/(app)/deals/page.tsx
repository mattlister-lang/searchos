import Link from "next/link";
import { DealDialog, NewCompanyDialog } from "@/components/forms/deal-dialogs";
import { FilterBar } from "@/components/filter-bar";
import { asMember, DEAL_STAGE_WEIGHTS, DEAL_STAGES, OPEN_DEAL_STAGES, toOptions } from "@/lib/domain";
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

/** Win probability for a deal stage — 0 for an unknown/absent stage. */
const weightFor = (stage: string | null | undefined) =>
  DEAL_STAGE_WEIGHTS[stage as (typeof DEAL_STAGES)[number]] ?? 0;

export default async function Deals({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>;
}) {
  const sp = await searchParams;
  const stage = asMember(DEAL_STAGES, sp.stage);

  let boardQuery = db.from("v_deal_board").select("*");
  if (stage) boardQuery = boardQuery.eq("stage", stage);

  const [board, pulse] = await Promise.all([
    boardQuery,
    db.from("v_activity_pulse").select("*"),
  ]);
  const pulseByCompany = new Map(
    (pulse.data ?? []).map((p) => [p.company, p]),
  );
  const deals = board.data ?? [];
  const open = deals.filter((d) => (OPEN_DEAL_STAGES as readonly string[]).includes(d.stage ?? ""));
  const closed = deals.filter((d) => !(OPEN_DEAL_STAGES as readonly string[]).includes(d.stage ?? ""));

  // Commercial view (P1): weighted forecast over the open deals in scope.
  const openPipeline = open.reduce((sum, d) => sum + (d.value ?? 0), 0);
  const weightedForecast = open.reduce((sum, d) => sum + (d.value ?? 0) * weightFor(d.stage), 0);
  const stats = [
    { label: "Open pipeline", value: fmtMoney(openPipeline) },
    { label: "Weighted forecast", value: fmtMoney(weightedForecast) },
    { label: "Open deals", value: String(open.length) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-semibold">Deals</h1>
        <div className="flex gap-2">
          <NewCompanyDialog />
          <DealDialog />
        </div>
      </div>

      <FilterBar filters={[{ param: "stage", label: "Stage", options: toOptions(DEAL_STAGES) }]} />

      <div className="grid grid-cols-3 gap-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm font-normal text-muted-foreground">
                {s.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="font-heading text-2xl font-semibold tabular-nums">
                {s.value}
              </span>
            </CardContent>
          </Card>
        ))}
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
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Win %</TableHead>
                <TableHead className="text-right">Weighted</TableHead>
                <TableHead>Next step</TableHead>
                <TableHead className="text-right">Pulse</TableHead>
                <TableHead className="text-right">Updated</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {open.map((d) => {
                const p = pulseByCompany.get(d.company);
                const w = weightFor(d.stage);
                return (
                  <TableRow key={d.deal_id}>
                    <TableCell className="font-medium">{d.name}</TableCell>
                    <TableCell>
                      {d.company_id ? (
                        <Link href={`/companies/${d.company_id}`} className="hover:underline">
                          {d.company}
                        </Link>
                      ) : d.company}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {d.primary_contact_id ? (
                        <Link href={`/people/${d.primary_contact_id}`} className="hover:underline">
                          {d.primary_contact}
                        </Link>
                      ) : (d.primary_contact ?? "—")}
                    </TableCell>
                    <TableCell>
                      <Badge className="capitalize">{d.stage}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoney(d.value)}</TableCell>
                    <TableCell className="text-right tabular-nums">{Math.round(w * 100)}%</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {d.value == null ? "—" : fmtMoney(d.value * w)}
                    </TableCell>
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
                      {d.deal_id && (
                        <DealDialog deal={{
                          deal_id: d.deal_id,
                          name: d.name ?? "",
                          stage: d.stage ?? "lead",
                          value: d.value,
                          next_step: d.next_step,
                        }} />
                      )}
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
