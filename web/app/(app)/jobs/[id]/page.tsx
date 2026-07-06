import Link from "next/link";
import { notFound } from "next/navigation";
import { AddCandidacyDialog, MandateStatusControl } from "@/components/forms/pipeline-forms";
import { EditBriefDialog } from "@/components/forms/edit-brief-dialog";
import { AddFeedbackDialog, DeleteFeedbackButton } from "@/components/forms/feedback-forms";
import { JobKanban, type KanbanCard } from "@/components/job-kanban";
import { LogActivityDialog } from "@/components/forms/log-activity-dialog";
import { DownloadDocumentButton } from "@/components/download-document-button";
import { UploadDocument } from "@/components/forms/upload-document";
import { ActivityItem } from "@/components/activity-item";
import { db } from "@/lib/db";
import { label, LIVE_STAGES, TERMINAL_STAGES } from "@/lib/domain";
import { daysSince, fmtDate, fmtMoney } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function JobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [{ data: mandate }, { data: activities }, { data: documents }] = await Promise.all([
    db
      .from("mandate")
      .select(
        `id, title, status, brief, seniority, location, salary_range, skills, opened_at,
         team, bonus, car_allowance, pension, notice_period,
         hiring_manager:hiring_manager_id(id, full_name),
         company(id, name),
         deal:deal_id(id, name, stage),
         candidacy(id, stage, stage_changed_at, outcome_reason,
                   salary, fee_amount, offer_accepted_at, start_date, boarded_at,
                   person(id, full_name),
                   interview(id, round, kind, scheduled_at, outcome),
                   candidacy_feedback(id, source, author, body, created_at))`,
      )
      .eq("id", id)
      .maybeSingle(),
    db
      .from("activity")
      .select("id, type, occurred_at, subject, summary, body_raw")
      .eq("mandate_id", id)
      .order("occurred_at", { ascending: false })
      .limit(10),
    db
      .from("document")
      .select("id, kind, filename, created_at")
      .eq("mandate_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!mandate) notFound();

  const candidacies = mandate.candidacy ?? [];
  const cards: KanbanCard[] = candidacies
    .filter((c) => (LIVE_STAGES as readonly string[]).includes(c.stage))
    .map((c) => ({
      candidacyId: c.id,
      stage: c.stage,
      personId: c.person?.id ?? null,
      personName: c.person?.full_name ?? "—",
      daysInStage: daysSince(c.stage_changed_at) ?? 0,
      interviews: (c.interview ?? []).length,
    }));
  const closed = candidacies.filter((c) =>
    (TERMINAL_STAGES as readonly string[]).includes(c.stage),
  );

  // F2 — the role brief rows. Empty fields still render ("—"): an incomplete
  // brief is information (engineering.md §4), and the card invites completion.
  const briefRows: { name: string; value: React.ReactNode }[] = [
    { name: "Salary", value: mandate.salary_range ?? "—" },
    { name: "Location", value: mandate.location ?? "—" },
    { name: "Team", value: mandate.team ?? "—" },
    { name: "Bonus", value: mandate.bonus ?? "—" },
    { name: "Car allowance", value: mandate.car_allowance ?? "—" },
    { name: "Pension", value: mandate.pension ?? "—" },
    { name: "Notice period", value: mandate.notice_period ?? "—" },
    {
      name: "Hiring manager",
      value: mandate.hiring_manager ? (
        <Link href={`/people/${mandate.hiring_manager.id}`} className="hover:underline">
          {mandate.hiring_manager.full_name}
        </Link>
      ) : (
        "—"
      ),
    },
  ];

  const feedbackTotal = candidacies.reduce(
    (n, c) => n + (c.candidacy_feedback ?? []).length,
    0,
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
            <Link href={`/deals/${mandate.deal.id}`}>
              <Badge variant="outline">BD: {mandate.deal.name} · {mandate.deal.stage}</Badge>
            </Link>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Role brief</CardTitle>
          <EditBriefDialog
            mandateId={mandate.id}
            brief={mandate.brief}
            salaryRange={mandate.salary_range}
            location={mandate.location}
            team={mandate.team}
            bonus={mandate.bonus}
            carAllowance={mandate.car_allowance}
            pension={mandate.pension}
            noticePeriod={mandate.notice_period}
            hiringManagerId={mandate.hiring_manager?.id ?? null}
            hiringManagerName={mandate.hiring_manager?.full_name ?? null}
          />
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {mandate.brief && (
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{mandate.brief}</p>
          )}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm md:grid-cols-4">
            {briefRows.map((row) => (
              <div key={row.name}>
                <p className="text-xs text-muted-foreground">{row.name}</p>
                <p className="font-medium">{row.value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 font-heading text-lg font-medium">Candidate pipeline</h2>
        <JobKanban cards={cards} />
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

      {candidacies.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Candidate feedback</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            {feedbackTotal === 0 && (
              <p className="text-sm text-muted-foreground">
                Nothing captured yet — client and consultant feedback lands here and on
                each candidate&apos;s page.
              </p>
            )}
            {[...candidacies]
              .sort((a, b) =>
                (a.person?.full_name ?? "").localeCompare(b.person?.full_name ?? ""),
              )
              .map((c) => (
                <div key={c.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm">
                      {c.person ? (
                        <Link href={`/people/${c.person.id}`} className="font-medium hover:underline">
                          {c.person.full_name}
                        </Link>
                      ) : (
                        <span className="font-medium">—</span>
                      )}{" "}
                      <Badge variant="outline" className="ml-1 capitalize">{label(c.stage)}</Badge>
                    </span>
                    <AddFeedbackDialog candidacyId={c.id}
                      contextLabel={c.person?.full_name ?? mandate.title} />
                  </div>
                  {/* E-007: offer figures render back where the money lives. */}
                  {(c.salary != null || c.fee_amount != null || c.offer_accepted_at ||
                    c.start_date || c.boarded_at) && (
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Offer</span>
                      {c.salary != null && <span>salary {fmtMoney(c.salary)}</span>}
                      {c.fee_amount != null && <span>fee {fmtMoney(c.fee_amount)}</span>}
                      {c.offer_accepted_at && <span>accepted {fmtDate(c.offer_accepted_at)}</span>}
                      {c.start_date && <span>starts {fmtDate(c.start_date)}</span>}
                      {c.boarded_at && <Badge>boarded</Badge>}
                    </div>
                  )}
                  {(c.candidacy_feedback ?? []).length > 0 && (
                    <div className="mt-2 flex flex-col gap-1.5 border-t pt-2">
                      {[...(c.candidacy_feedback ?? [])]
                        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
                        .map((fb) => (
                          <div key={fb.id} className="text-sm">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-xs text-muted-foreground">
                                <Badge variant="outline" className="mr-1.5 capitalize">{label(fb.source)}</Badge>
                                {fb.author ? `${fb.author} · ` : ""}{fmtDate(fb.created_at)}
                              </span>
                              <DeleteFeedbackButton feedbackId={fb.id} />
                            </div>
                            <p className="mt-0.5 whitespace-pre-wrap">{fb.body}</p>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Documents</CardTitle>
          <UploadDocument target={{ mandateId: mandate.id }} kind="spec" label="Upload JD" />
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {(documents ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">
              No documents yet — attach the JD so it&apos;s one click away when a
              candidate asks.
            </p>
          )}
          {(documents ?? []).map((d) => (
            <div key={d.id} className="flex items-baseline justify-between text-sm">
              <span>
                <Badge variant="outline" className="mr-2 uppercase">{d.kind}</Badge>
                <span className="font-medium">{d.filename}</span>
              </span>
              <span className="flex shrink-0 items-baseline gap-3">
                <DownloadDocumentButton documentId={d.id} />
                <span className="text-xs text-muted-foreground">{fmtDate(d.created_at)}</span>
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent activity</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2">
          {(activities ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing logged against this job yet.</p>
          )}
          {(activities ?? []).map((a) => (
            <ActivityItem key={a.id} type={a.type} subject={a.subject}
              bodyRaw={a.body_raw} summary={a.summary} occurredAt={a.occurred_at} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
