import { db } from "@/lib/db";
import { daysSince, fmtDate } from "@/lib/format";
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

const REASON_LABEL: Record<string, string> = {
  deal_missing_next_step: "No next step",
  candidacy_stalled: "Stalled",
  relationship_going_stale: "Going stale",
};

export default async function Dashboard() {
  const [people, deals, candidacies, actions, pulse] = await Promise.all([
    db.from("person").select("id", { count: "exact", head: true }).is("erased_at", null),
    db.from("deal").select("id", { count: "exact", head: true }).not("stage", "in", '("won","lost")'),
    db.from("candidacy").select("id", { count: "exact", head: true }).not("stage", "in", '("placed","rejected","withdrawn")'),
    db.from("v_next_actions").select("*"),
    db.from("v_activity_pulse").select("*").order("last_30d", { ascending: false }),
  ]);

  const stats = [
    { label: "People", value: people.count ?? 0 },
    { label: "Open deals", value: deals.count ?? 0 },
    { label: "Live candidacies", value: candidacies.count ?? 0 },
    { label: "Next actions", value: actions.data?.length ?? 0 },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl font-semibold">Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm font-normal text-muted-foreground">
                {s.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="font-heading text-3xl font-semibold tabular-nums">
                {s.value}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Next actions</CardTitle>
        </CardHeader>
        <CardContent>
          {!actions.data?.length ? (
            <p className="text-sm text-muted-foreground">
              Nothing needs you. Rare — enjoy it.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Why</TableHead>
                  <TableHead>What</TableHead>
                  <TableHead>Where</TableHead>
                  <TableHead className="text-right">Since</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {actions.data.map((a, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Badge variant="outline">
                        {REASON_LABEL[a.reason] ?? a.reason}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{a.item}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {a.context ?? "—"}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {fmtDate(a.since)}
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
          <CardTitle>Activity pulse — last 30 days</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead className="text-right">Last 30d</TableHead>
                <TableHead className="text-right">Prior 30d</TableHead>
                <TableHead className="text-right">Trend</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(pulse.data ?? []).map((p) => (
                <TableRow key={p.company_id}>
                  <TableCell className="font-medium">{p.company}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.last_30d}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.prior_30d}</TableCell>
                  <TableCell className="text-right">
                    {p.last_30d > p.prior_30d ? (
                      <Badge>warming</Badge>
                    ) : p.last_30d < p.prior_30d ? (
                      <Badge variant="destructive">cooling</Badge>
                    ) : (
                      <Badge variant="outline">steady</Badge>
                    )}
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
