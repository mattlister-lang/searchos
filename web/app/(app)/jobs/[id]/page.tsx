import Link from "next/link";
import { notFound } from "next/navigation";
import { AddCandidacyDialog, MandateStatusControl, MoveStageControl } from "@/components/forms/pipeline-forms";
import { LogActivityDialog } from "@/components/forms/log-activity-dialog";
import { db } from "@/lib/db";
import { label, LIVE_STAGES, TERMINAL_STAGES } from "@/lib/domain";
import { daysSince, fmtDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function JobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [{ data: mandate }, { data: activities }] = await Promise.all([
    db
      .from("mandate")
      .select(
        `id, title, status, brief, seniority, location, salary_range, skills, opened_at,
         company(id, name),
         deal:deal_id(id, name, stage),
         candidacy(id, stage, stage_changed_at, outcome_reason,
                   person(id, full_name),
                   interview(id, round, kind, scheduled_at, outcome))`,
      )
      .eq("id", id)
      .maybeSingle(),
    db
      .from("activity")
      .select("id, type, occurred_at, subject, summary")
      .eq("mandate_id", id)
      .order("occurred_at", { ascending: false })
      .limit(10),
  ]);

  if (!mandate) notFound();

  const candidacies = mandate.candidacy ?? [];
  const columns = LIVE_STAGES.map((stage) => ({
    stage,
    cards: candidacies.filter((c) => c.stage === stage),
  }));
  const closed = candidacies.filter((c) =>
    (TERMINAL_STAGES as readonly string[]).includes(c.stage),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-semibold">{mandate.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {mandate.company && (
                <Link href={`/companies/${mandate.company.id}`} className="hover:underline">
                  {mandate.company.name}
                </Link>
              )}
              {mandate.location ? ` · ${mandate.location}` : ""}
              {mandate.salary_range ? ` · ${mandate.salary_range}` : ""}
              {" · opened "}{fmtDate(mandate.opened_at)}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <LogActivityDialog mandateId={mandate.id} contextLabel={mandate.title} />
            <AddCandidacyDialog mandates={[{ id: mandate.id, title: mandate.title }]}
              fixedMandateId={mandate.id} />
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge variant={mandate.status === "open" ? "default" : "outline"} className="capitalize">
            {label(mandate.status)}
          </Badge>
          <MandateStatusControl mandateId={mandate.id} status={mandate.status} />
          {mandate.seniority && (
            <Badge variant="secondary" className="capitalize">{label(mandate.seniority)}</Badge>
          )}
          {(mandate.skills ?? []).map((s) => (
            <Badge key={s} variant="outline">{s}</Badge>
          ))}
          {mandate.deal && (
            <Link href="/deals">
              <Badge variant="outline">BD: {mandate.deal.name} · {mandate.deal.stage}</Badge>
            </Link>
          )}
        </div>
      </div>

      {mandate.brief && (
        <Card>
          <CardHeader><CardTitle className="text-base">Brief</CardTitle></CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{mandate.brief}</p>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="mb-3 font-heading text-lg font-medium">Candidate pipeline</h2>
        <div className="overflow-x-auto">
          <div className="flex min-w-max gap-4">
            {columns.map((col) => (
              <div key={col.stage} className="w-60 shrink-0">
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-sm font-medium capitalize">{label(col.stage)}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {col.cards.length}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {col.cards.map((c) => {
                    const days = daysSince(c.stage_changed_at) ?? 0;
                    return (
                      <Card key={c.id} className="py-3">
                        <CardContent className="px-3">
                          <Link href={`/people/${c.person?.id}`}
                            className="text-sm font-medium hover:underline">
                            {c.person?.full_name}
                          </Link>
                          <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                            {days}d in stage{" "}
                            {days > 14 && <Badge variant="outline">stale</Badge>}
                          </p>
                          {(c.interview ?? []).length > 0 && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {(c.interview ?? []).length} interview
                              {(c.interview ?? []).length > 1 ? "s" : ""}
                            </p>
                          )}
                          <div className="mt-2">
                            <MoveStageControl candidacyId={c.id} stage={c.stage} />
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {closed.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Out of process</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {closed.map((c) => (
              <Link key={c.id} href={`/people/${c.person?.id}`}>
                <Badge variant="outline" className="capitalize">
                  {c.person?.full_name} — {label(c.stage)}
                  {c.outcome_reason ? ` (${c.outcome_reason})` : ""}
                </Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Recent activity</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2">
          {(activities ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing logged against this job yet.</p>
          )}
          {(activities ?? []).map((a) => (
            <div key={a.id} className="flex items-baseline justify-between text-sm">
              <span>
                <Badge variant="outline" className="mr-2 capitalize">{label(a.type)}</Badge>
                {a.subject ?? a.summary ?? "—"}
              </span>
              <span className="text-xs text-muted-foreground">{fmtDate(a.occurred_at)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
