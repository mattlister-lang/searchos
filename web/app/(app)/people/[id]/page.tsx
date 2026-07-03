import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { fmtDate, stageLabel } from "@/lib/format";
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

  const [{ data: person }, { data: participation }] = await Promise.all([
    db
      .from("person")
      .select(
        `id, full_name, location, profile, linkedin_url, erased_at, created_at,
         person_email(email, is_primary),
         employment(title, is_current, start_date, end_date, company(name)),
         candidacy(stage, stage_changed_at, placed_at, notes, mandate(title, company(name)))`,
      )
      .eq("id", id)
      .maybeSingle(),
    db
      .from("activity_participant")
      .select("role, activity(id, type, occurred_at, subject, summary)")
      .eq("person_id", id)
      .order("occurred_at", { ascending: false, referencedTable: "activity" })
      .limit(25),
  ]);

  if (!person) notFound();

  const activities = (participation ?? [])
    .map((p) => ({ role: p.role, ...(p.activity as any) }))
    .filter((a) => a.id)
    .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">
          {person.full_name}
        </h1>
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
                  at {e.company?.name ?? "—"}
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
            <div key={i} className="flex items-baseline justify-between text-sm">
              <span>
                <span className="font-medium">{c.mandate?.title}</span>{" "}
                <span className="text-muted-foreground">
                  · {c.mandate?.company?.name}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <Badge className="capitalize">{stageLabel(c.stage)}</Badge>
                <span className="text-xs text-muted-foreground">
                  {fmtDate(c.stage_changed_at)}
                </span>
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
