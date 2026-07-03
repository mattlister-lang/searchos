import Link from "next/link";
import { notFound } from "next/navigation";
import {
  InterviewOutcomeControl,
  LogInterviewDialog,
  OfferDialog,
} from "@/components/forms/candidacy-forms";
import { EditProfileDialog } from "@/components/forms/edit-profile-dialog";
import { LogActivityDialog } from "@/components/forms/log-activity-dialog";
import { UploadCv } from "@/components/forms/upload-cv";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/format";
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
                     mandate(id, title, company(id, name)),
                     interview(id, round, kind, scheduled_at, outcome))`,
        )
        .eq("id", id)
        .maybeSingle(),
      db
        .from("activity_participant")
        .select("role, activity(id, type, occurred_at, subject, summary)")
        .eq("person_id", id)
        .order("occurred_at", { ascending: false, referencedTable: "activity" })
        .limit(25),
      db
        .from("document")
        .select("id, kind, filename, created_at, parsed_text")
        .eq("person_id", id)
        .order("created_at", { ascending: false }),
    ]);

  if (!person) notFound();

  const activities = (participation ?? [])
    .map((p) => ({ role: p.role, ...(p.activity as any) }))
    .filter((a) => a.id)
    .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <div className="flex items-start justify-between gap-4">
          <h1 className="font-heading text-2xl font-semibold">
            {person.full_name}
          </h1>
          <div className="flex shrink-0 gap-2">
            <LogActivityDialog personId={person.id} contextLabel={person.full_name} />
            <UploadCv personId={person.id} />
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
        <div className="mt-2 flex flex-wrap gap-2">
          {(person.person_email as any[]).map((e) => (
            <Badge key={e.email} variant="outline">
              {e.email}
            </Badge>
          ))}
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
          {(person.employment as any[]).length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing recorded.</p>
          )}
          {(person.employment as any[]).map((e, i) => (
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Candidacies</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {(person.candidacy as any[]).length === 0 && (
            <p className="text-sm text-muted-foreground">
              Not on any mandate yet.
            </p>
          )}
          {(person.candidacy as any[]).map((c, i) => (
            <div key={c.id ?? i} className="rounded-md border p-3">
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
              {(c.interview as any[])?.length > 0 && (
                <div className="mt-2 flex flex-col gap-1.5">
                  {(c.interview as any[])
                    .sort((a, b) => a.round - b.round)
                    .map((iv) => (
                      <div key={iv.id} className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="capitalize">
                          Round {iv.round} · {String(iv.kind).replaceAll("_", " ")}
                          {iv.scheduled_at ? ` · ${fmtDate(iv.scheduled_at)}` : ""}
                        </span>
                        <InterviewOutcomeControl interviewId={iv.id} outcome={iv.outcome} />
                      </div>
                    ))}
                </div>
              )}
              <div className="mt-2 flex gap-2">
                <LogInterviewDialog candidacyId={c.id} candidateName={person.full_name} />
                <OfferDialog candidacyId={c.id} candidateName={person.full_name}
                  mandateTitle={c.mandate?.title ?? ""} />
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
              <span className="text-xs text-muted-foreground">{fmtDate(d.created_at)}</span>
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
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium">
                  {a.subject ?? a.type}
                </span>
                <span className="text-xs text-muted-foreground">
                  {fmtDate(a.occurred_at)}
                </span>
              </div>
              {a.summary && (
                <p className="mt-1 text-sm text-muted-foreground">{a.summary}</p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
