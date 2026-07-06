import Link from "next/link";
import { notFound } from "next/navigation";
import {
  InterviewOutcomeControl,
  LogInterviewDialog,
  OfferDialog,
} from "@/components/forms/candidacy-forms";
import { EditProfileDialog } from "@/components/forms/edit-profile-dialog";
import { AddFeedbackDialog, DeleteFeedbackButton } from "@/components/forms/feedback-forms";
import { FindEmailDialog } from "@/components/forms/find-email-dialog";
import { LogActivityDialog } from "@/components/forms/log-activity-dialog";
import { AddCandidacyDialog } from "@/components/forms/pipeline-forms";
import { ActivityItem } from "@/components/activity-item";
import { StandardisedCv } from "@/components/standardised-cv";
import { UploadDocument } from "@/components/forms/upload-document";
import { DownloadDocumentButton } from "@/components/download-document-button";
import { ParsedCvSchema } from "@/lib/cv";
import { db } from "@/lib/db";
import { fmtDate, fmtMoney } from "@/lib/format";
import { label } from "@/lib/domain";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export const dynamic = "force-dynamic";

export default async function PersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [{ data: person }, { data: participation }, { data: documents }] =
    await Promise.all([
      db
        .from("person")
        .select(
          `id, full_name, location, profile, linkedin_url, erased_at, created_at,
           seniority, functions, skills, sectors,
           person_email(email, is_primary),
           employment(title, is_current, start_date, end_date, company(id, name)),
           candidacy(id, stage, stage_changed_at, placed_at, notes,
                     salary, fee_amount, offer_accepted_at, start_date, boarded_at,
                     mandate(id, title, company(id, name)),
                     interview(id, round, kind, scheduled_at, location, notes, feedback, outcome),
                     candidacy_feedback(id, source, author, body, created_at))`,
        )
        .eq("id", id)
        .maybeSingle(),
      db
        .from("activity_participant")
        .select("role, activity(id, type, occurred_at, subject, summary, body_raw)")
        .eq("person_id", id)
        .order("occurred_at", { ascending: false, referencedTable: "activity" })
        .limit(25),
      db
        .from("document")
        .select("id, kind, filename, created_at, parsed_text, parsed_cv")
        .eq("person_id", id)
        .order("created_at", { ascending: false }),
    ]);

  if (!person) notFound();

  const activities = (participation ?? [])
    .flatMap((p) => (p.activity ? [{ role: p.role, ...p.activity }] : []))
    .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));

  // The newest CV with a structured extraction drives the standardised CV
  // section (I1). Stored JSON is re-validated at render, never trusted blind.
  const cvDoc = (documents ?? []).find((d) => d.kind === "cv" && d.parsed_cv !== null);
  const parsedCv = cvDoc ? ParsedCvSchema.safeParse(cvDoc.parsed_cv) : null;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <div className="flex items-start justify-between gap-4">
          <h1 className="font-heading text-2xl font-semibold">
            {person.full_name}
          </h1>
          <div className="flex shrink-0 gap-2">
            {/* E-022: longlist the person you're looking at — no round trip.
                Hidden for erased people (their page stays read-only, E-013). */}
            {!person.erased_at && (
              <AddCandidacyDialog fixedPersonId={person.id} personName={person.full_name} />
            )}
            <LogActivityDialog personId={person.id} contextLabel={person.full_name} />
            <UploadDocument target={{ personId: person.id }} kind="cv" label="Upload CV" />
            <EditProfileDialog
              personId={person.id}
              seniority={person.seniority}
              functions={person.functions ?? []}
              skills={person.skills ?? []}
              sectors={person.sectors ?? []}
              location={person.location}
            />
          </div>
        </div>
        {(person.seniority || (person.skills ?? []).length > 0 || (person.sectors ?? []).length > 0) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {person.seniority && (
              <Badge className="capitalize">{String(person.seniority).replaceAll("_", " ")}</Badge>
            )}
            {(person.sectors ?? []).map((s: string) => (
              <Badge key={s} variant="secondary">{s}</Badge>
            ))}
            {(person.skills ?? []).map((s: string) => (
              <Badge key={s} variant="outline">{s}</Badge>
            ))}
          </div>
        )}
        <p className="mt-1 text-sm text-muted-foreground">
          {person.location ?? ""}
          {person.linkedin_url && (
            <>
              {person.location ? " · " : ""}
              <a
                href={`https://${person.linkedin_url}`}
                className="hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                LinkedIn
              </a>
            </>
          )}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {person.person_email.map((e) => (
            <Badge key={e.email} variant="outline">
              {e.email}
            </Badge>
          ))}
          {!person.erased_at && (
            <FindEmailDialog personId={person.id} personName={person.full_name} />
          )}
        </div>
      </div>

      {person.profile && (
        <p className="text-sm text-muted-foreground">{person.profile}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Experience</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {person.employment.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing recorded.</p>
          )}
          {person.employment.map((e, i) => (
            <div key={i} className="flex items-baseline justify-between text-sm">
              <span>
                <span className="font-medium">{e.title ?? "Role unknown"}</span>{" "}
                <span className="text-muted-foreground">
                  at {e.company ? (
                    <Link href={`/companies/${e.company.id}`} className="hover:underline">
                      {e.company.name}
                    </Link>
                  ) : "—"}
                </span>
              </span>
              {e.is_current && <Badge>current</Badge>}
            </div>
          ))}
        </CardContent>
      </Card>

      {parsedCv?.success && (
        <StandardisedCv cv={parsedCv.data} filename={cvDoc?.filename ?? null} />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Candidacies</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {person.candidacy.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Not on any mandate yet.
            </p>
          )}
          {person.candidacy.map((c) => (
            <div key={c.id} className="rounded-md border p-3">
              <div className="flex items-baseline justify-between text-sm">
                <span>
                  <Link href={`/jobs/${c.mandate?.id}`} className="font-medium hover:underline">
                    {c.mandate?.title}
                  </Link>{" "}
                  <span className="text-muted-foreground">
                    · {c.mandate?.company?.name}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <Badge className="capitalize">{label(c.stage)}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {fmtDate(c.stage_changed_at)}
                  </span>
                </span>
              </div>
              {c.interview.length > 0 && (
                <div className="mt-2 flex flex-col gap-1.5">
                  {[...c.interview]
                    .sort((a, b) => a.round - b.round)
                    .map((iv) => (
                      <div key={iv.id}>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="capitalize">
                            Round {iv.round} · {String(iv.kind).replaceAll("_", " ")}
                            {iv.scheduled_at ? ` · ${fmtDate(iv.scheduled_at)}` : ""}
                          </span>
                          <InterviewOutcomeControl interviewId={iv.id} outcome={iv.outcome} />
                        </div>
                        {/* E-006: location, notes and feedback render back —
                            inline expansion, never write-only. */}
                        {(iv.location || iv.notes || iv.feedback) && (
                          <details className="mt-0.5">
                            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                              Location, notes &amp; feedback
                            </summary>
                            <div className="mt-1 flex flex-col gap-1 rounded-md bg-muted/40 p-2 text-xs">
                              {iv.location && (
                                <p><span className="text-muted-foreground">Location:</span> {iv.location}</p>
                              )}
                              {iv.notes && (
                                <p className="whitespace-pre-wrap">
                                  <span className="text-muted-foreground">Notes:</span> {iv.notes}
                                </p>
                              )}
                              {iv.feedback && (
                                <p className="whitespace-pre-wrap">
                                  <span className="text-muted-foreground">Feedback:</span> {iv.feedback}
                                </p>
                              )}
                            </div>
                          </details>
                        )}
                      </div>
                    ))}
                </div>
              )}
              {/* E-007: offer figures + boarded state render back on the
                  candidacy where they were entered. */}
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
              {c.candidacy_feedback.length > 0 && (
                <div className="mt-2 flex flex-col gap-1.5 border-t pt-2">
                  {[...c.candidacy_feedback]
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
              <div className="mt-2 flex gap-2">
                <LogInterviewDialog candidacyId={c.id} candidateName={person.full_name} />
                <OfferDialog candidacyId={c.id} candidateName={person.full_name}
                  mandateTitle={c.mandate?.title ?? ""} />
                <AddFeedbackDialog candidacyId={c.id}
                  contextLabel={`${person.full_name} · ${c.mandate?.title ?? "job"}`} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Documents</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {(documents ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No documents yet.</p>
          )}
          {(documents ?? []).map((d) => (
            <div key={d.id} className="flex items-baseline justify-between text-sm">
              <span>
                <Badge variant="outline" className="mr-2 uppercase">{d.kind}</Badge>
                <span className="font-medium">{d.filename}</span>
                {d.parsed_text && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    text extracted · {Math.round(d.parsed_text.length / 1000)}k chars
                  </span>
                )}
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
        <CardHeader>
          <CardTitle className="text-base">Activity</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {activities.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No logged activity. History appears here as calls and meetings
              are captured.
            </p>
          )}
          {activities.map((a, i) => (
            <div key={a.id ?? i}>
              {i > 0 && <Separator className="mb-3" />}
              <ActivityItem type={a.type} subject={a.subject}
                bodyRaw={a.body_raw} summary={a.summary} occurredAt={a.occurred_at} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
