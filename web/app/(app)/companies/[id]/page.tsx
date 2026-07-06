import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityItem } from "@/components/activity-item";
import { CompanyNews } from "@/components/company-news";
import { CompanyOpenings } from "@/components/company-openings";
import { EditCompanyDialog } from "@/components/forms/edit-company-dialog";
import { EnrichCompanyDialog } from "@/components/forms/enrich-company-dialog";
import { LogActivityDialog } from "@/components/forms/log-activity-dialog";
import { db } from "@/lib/db";
import { label } from "@/lib/domain";
import { fmtMoney } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [{ data: company }, { data: activities }] = await Promise.all([
    db
      .from("company")
      .select(
        `id, name, status, sectors, notes,
         company_domain(domain),
         employment(id, title, is_current, person(id, full_name)),
         deal(id, name, stage, value, next_step),
         mandate(id, title, status)`,
      )
      .eq("id", id)
      .maybeSingle(),
    db
      .from("activity")
      .select("id, type, occurred_at, subject, summary, body_raw")
      .eq("company_id", id)
      .order("occurred_at", { ascending: false })
      .limit(10),
  ]);

  if (!company) notFound();

  const currentPeople = company.employment.filter((e) => e.is_current);
  const pastPeople = company.employment.filter((e) => !e.is_current);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <div className="flex items-start justify-between gap-4">
          <h1 className="font-heading text-2xl font-semibold">{company.name}</h1>
          <div className="flex shrink-0 gap-2">
            <EnrichCompanyDialog companyId={company.id} />
            <EditCompanyDialog companyId={company.id} status={company.status}
              sectors={company.sectors ?? []} notes={company.notes} />
            <LogActivityDialog companyId={company.id} contextLabel={company.name} />
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge className="capitalize">{label(company.status)}</Badge>
          {(company.sectors ?? []).map((s) => (
            <Badge key={s} variant="secondary">{s}</Badge>
          ))}
          {company.company_domain.map((d) => (
            <Badge key={d.domain} variant="outline">{d.domain}</Badge>
          ))}
        </div>
        {company.notes && (
          <p className="mt-2 text-sm text-muted-foreground">{company.notes}</p>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">People</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2">
          {company.employment.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No one linked yet — talent maps grow from employment records.
            </p>
          )}
          {currentPeople.map((e) => (
            <div key={e.id} className="flex items-baseline justify-between text-sm">
              <span>
                <Link href={`/people/${e.person?.id}`} className="font-medium hover:underline">
                  {e.person?.full_name}
                </Link>{" "}
                <span className="text-muted-foreground">{e.title ?? ""}</span>
              </span>
              <Badge>current</Badge>
            </div>
          ))}
          {pastPeople.map((e) => (
            <div key={e.id} className="flex items-baseline justify-between text-sm">
              <span>
                <Link href={`/people/${e.person?.id}`} className="hover:underline">
                  {e.person?.full_name}
                </Link>{" "}
                <span className="text-muted-foreground">{e.title ?? ""}</span>
              </span>
              <span className="text-xs text-muted-foreground">past</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Deals</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2">
          {company.deal.length === 0 && (
            <p className="text-sm text-muted-foreground">No deals yet.</p>
          )}
          {company.deal.map((d) => (
            <div key={d.id} className="flex items-baseline justify-between text-sm">
              <span>
                <Link href={`/deals/${d.id}`} className="font-medium hover:underline">{d.name}</Link>{" "}
                <span className="text-muted-foreground">
                  {d.next_step ? `· next: ${d.next_step}` : ""}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <Badge variant="outline" className="capitalize">{d.stage}</Badge>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {fmtMoney(d.value)}
                </span>
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Jobs</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2">
          {company.mandate.length === 0 && (
            <p className="text-sm text-muted-foreground">No mandates yet.</p>
          )}
          {company.mandate.map((m) => (
            <div key={m.id} className="flex items-baseline justify-between text-sm">
              <Link href={`/jobs/${m.id}`} className="font-medium hover:underline">
                {m.title}
              </Link>
              <Badge variant={m.status === "open" ? "default" : "outline"} className="capitalize">
                {label(m.status)}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <CompanyOpenings companyId={company.id} companyName={company.name} />

      <CompanyNews companyId={company.id} />

      <Card>
        <CardHeader><CardTitle className="text-base">Recent activity</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2">
          {(activities ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing logged yet.</p>
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
