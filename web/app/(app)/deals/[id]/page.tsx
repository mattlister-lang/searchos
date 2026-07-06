import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityItem } from "@/components/activity-item";
import { DownloadDocumentButton } from "@/components/download-document-button";
import { DealDialog } from "@/components/forms/deal-dialogs";
import { LogActivityDialog } from "@/components/forms/log-activity-dialog";
import { NewMandateDialog } from "@/components/forms/pipeline-forms";
import { UploadDocument } from "@/components/forms/upload-document";
import { db } from "@/lib/db";
import { DEAL_STAGE_WEIGHTS, label } from "@/lib/domain";
import { fmtDate, fmtMoney } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

/**
 * The deal's workspace (E-001 — a deal is an entity, not a dialog). Header
 * with stage/value/win%, the company + primary contact, next step, notes, the
 * deal's OWN BD activity log (E-005 bodies expand inline), documents
 * (proposals/terms), and — once won — Convert to job (E-009, sets
 * mandate.deal_id); a converted deal shows its linked job instead.
 */
export default async function DealPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [{ data: deal }, { data: activities }, { data: documents }] = await Promise.all([
    db
      .from("deal")
      .select(
        `id, name, stage, value, next_step, notes, created_at, updated_at,
         company:company_id(id, name),
         primary_contact:primary_contact_id(id, full_name),
         mandate(id, title, status)`,
      )
      .eq("id", id)
      .maybeSingle(),
    db
      .from("activity")
      .select("id, type, occurred_at, subject, summary, body_raw")
      .eq("deal_id", id)
      .order("occurred_at", { ascending: false })
      .limit(15),
    db
      .from("document")
      .select("id, kind, filename, created_at")
      .eq("deal_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!deal) notFound();

  // deal.stage is the table's enum type — exactly DEAL_STAGE_WEIGHTS' key union.
  const winPct = Math.round(DEAL_STAGE_WEIGHTS[deal.stage] * 100);
  const linkedJobs = deal.mandate ?? [];
  const canConvert = deal.stage === "won" && linkedJobs.length === 0;
  // "Spec-in: Head of Hydrogen" → "Head of Hydrogen" as the job-title seed.
  const convertTitle = deal.name.replace(/^spec-in:\s*/i, "");

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-semibold">{deal.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {deal.company && (
                <Link href={`/companies/${deal.company.id}`} className="hover:underline">
                  {deal.company.name}
                </Link>
              )}
              {" · updated "}{fmtDate(deal.updated_at)}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <LogActivityDialog dealId={deal.id} contextLabel={deal.name} />
            <DealDialog
              deal={{
                deal_id: deal.id,
                name: deal.name,
                stage: deal.stage,
                value: deal.value,
                next_step: deal.next_step,
                notes: deal.notes,
                primary_contact_id: deal.primary_contact?.id ?? null,
                primary_contact: deal.primary_contact?.full_name ?? null,
              }}
            />
            {canConvert && (
              <NewMandateDialog
                dealId={deal.id}
                prefill={{ companyName: deal.company?.name ?? "", title: convertTitle }}
                trigger={<Button size="sm">Convert to job</Button>}
              />
            )}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge className="capitalize">{label(deal.stage)}</Badge>
          <Badge variant="secondary">win {winPct}%</Badge>
          <Badge variant="outline" className="tabular-nums">{fmtMoney(deal.value)}</Badge>
          {linkedJobs.map((m) => (
            <Link key={m.id} href={`/jobs/${m.id}`}>
              <Badge variant="outline">Job: {m.title} · {label(m.status)}</Badge>
            </Link>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Working the deal</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Next step</p>
            {deal.next_step ? (
              <p className="font-medium">{deal.next_step}</p>
            ) : (
              <Badge variant="destructive">missing — pipelines die without one</Badge>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Primary contact</p>
            {deal.primary_contact ? (
              <Link href={`/people/${deal.primary_contact.id}`} className="font-medium hover:underline">
                {deal.primary_contact.full_name}
              </Link>
            ) : (
              <p className="text-muted-foreground">— set one via Edit</p>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Notes</p>
            {deal.notes ? (
              <p className="whitespace-pre-wrap">{deal.notes}</p>
            ) : (
              <p className="text-muted-foreground">Nothing yet.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Documents</CardTitle>
          <UploadDocument target={{ dealId: deal.id }} kind="terms" label="Upload terms / proposal" />
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {(documents ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">
              No documents yet — proposals and terms attached here are one click
              away when the client asks.
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
        <CardHeader>
          <CardTitle className="text-base">BD activity</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {(activities ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nothing logged against this deal yet — calls and emails that
              advanced it belong here, not just on the company.
            </p>
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
