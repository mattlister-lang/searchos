import Link from "next/link";
import type { Database } from "@/lib/database.types";
import { db } from "@/lib/db";
import { label } from "@/lib/domain";
import { fmtDate } from "@/lib/format";
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

type NextActionRow = Database["public"]["Views"]["v_next_actions"]["Row"];

/**
 * E-002: every next-action row is one click from acting. The 0012 view carries
 * (target_type + ids); deal rows open the deal, candidacy rows open the JOB
 * (where the kanban action is) with the candidate's name linking their page —
 * the view formats a candidacy item as "name — title", so split on the first
 * separator; if the shape ever surprises, the whole item links to the job.
 * Person rows open the person. Missing ids degrade to plain text (L-015).
 */
function NextActionWhat({ a }: { a: NextActionRow }) {
  const item = a.item ?? "—";
  if (a.target_type === "deal" && a.deal_id) {
    return <Link href={`/deals/${a.deal_id}`} className="hover:underline">{item}</Link>;
  }
  if (a.target_type === "candidacy" && a.mandate_id) {
    const sep = item.indexOf(" — ");
    if (sep === -1) {
      return <Link href={`/jobs/${a.mandate_id}`} className="hover:underline">{item}</Link>;
    }
    const name = item.slice(0, sep);
    const rest = item.slice(sep + 3);
    return (
      <span>
        {a.person_id ? (
          <Link href={`/people/${a.person_id}`} className="hover:underline">{name}</Link>
        ) : name}
        {" — "}
        <Link href={`/jobs/${a.mandate_id}`} className="hover:underline">{rest}</Link>
      </span>
    );
  }
  if (a.target_type === "person" && a.person_id) {
    return <Link href={`/people/${a.person_id}`} className="hover:underline">{item}</Link>;
  }
  return <span>{item}</span>;
}

export default async function Dashboard() {
  const [people, deals, candidacies, actions, pulse, interviews, stale] = await Promise.all([
    db.from("person").select("id", { count: "exact", head: true }).is("erased_at", null),
    db.from("deal").select("id", { count: "exact", head: true }).not("stage", "in", '("won","lost")'),
    db.from("candidacy").select("id", { count: "exact", head: true }).not("stage", "in", '("placed","rejected","withdrawn")'),
    db.from("v_next_actions").select("*"),
    db.from("v_activity_pulse").select("*").order("last_30d", { ascending: false }),
    db.from("v_upcoming_interviews").select("*").limit(10),
    db.from("v_stale_candidacies").select("*").limit(15),
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
                        {REASON_LABEL[a.reason ?? ""] ?? a.reason}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      <NextActionWhat a={a} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {a.company_id && a.context ? (
                        <Link href={`/companies/${a.company_id}`} className="hover:underline">
                          {a.context}
                        </Link>
                      ) : (a.context ?? "—")}
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
          <CardTitle>Chase list — candidates sitting in stage</CardTitle>
        </CardHeader>
        <CardContent>
          {!stale.data?.length ? (
            <p className="text-sm text-muted-foreground">
              No one has been in a stage for more than a week. Momentum intact.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Job</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead className="text-right">Days</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stale.data.map((s) => (
                  <TableRow key={s.candidacy_id ?? `${s.person_id}-${s.mandate_id}`}>
                    <TableCell className="font-medium">
                      {s.person_id ? (
                        <Link href={`/people/${s.person_id}`} className="hover:underline">
                          {s.person_name ?? "—"}
                        </Link>
                      ) : (
                        s.person_name ?? "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {s.mandate_id ? (
                        <Link href={`/jobs/${s.mandate_id}`} className="hover:underline">
                          {s.mandate ?? "—"}
                        </Link>
                      ) : (
                        s.mandate ?? "—"
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.company_id ? (
                        <Link href={`/companies/${s.company_id}`} className="hover:underline">
                          {s.client ?? "—"}
                        </Link>
                      ) : (
                        s.client ?? "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {s.stage ? label(s.stage) : "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.days_in_stage ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {(interviews.data ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Upcoming interviews</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Mandate</TableHead>
                  <TableHead className="text-right">Round</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(interviews.data ?? []).map((iv) => (
                  <TableRow key={iv.interview_id}>
                    <TableCell className="tabular-nums">{fmtDate(iv.scheduled_at)}</TableCell>
                    <TableCell className="font-medium">
                      {iv.person_id ? (
                        <Link href={`/people/${iv.person_id}`} className="hover:underline">
                          {iv.candidate}
                        </Link>
                      ) : iv.candidate}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {iv.mandate_id ? (
                        <Link href={`/jobs/${iv.mandate_id}`} className="hover:underline">
                          {iv.mandate}
                        </Link>
                      ) : iv.mandate}
                      {" · "}
                      {iv.company_id ? (
                        <Link href={`/companies/${iv.company_id}`} className="hover:underline">
                          {iv.client}
                        </Link>
                      ) : iv.client}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {iv.round} <span className="capitalize text-muted-foreground">({String(iv.kind).replaceAll("_", " ")})</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

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
              {(pulse.data ?? []).map((p) => {
                const last = p.last_30d ?? 0;
                const prior = p.prior_30d ?? 0;
                return (
                <TableRow key={p.company_id}>
                  <TableCell className="font-medium">
                    {p.company_id ? (
                      <Link href={`/companies/${p.company_id}`} className="hover:underline">
                        {p.company}
                      </Link>
                    ) : p.company}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{last}</TableCell>
                  <TableCell className="text-right tabular-nums">{prior}</TableCell>
                  <TableCell className="text-right">
                    {last > prior ? (
                      <Badge>warming</Badge>
                    ) : last < prior ? (
                      <Badge variant="destructive">cooling</Badge>
                    ) : (
                      <Badge variant="outline">steady</Badge>
                    )}
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
