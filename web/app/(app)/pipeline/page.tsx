import Link from "next/link";
import {
  AddCandidacyDialog,
  MoveStageControl,
  NewMandateDialog,
} from "@/components/forms/pipeline-forms";
import { db } from "@/lib/db";
import { daysSince } from "@/lib/format";
import { label, LIVE_STAGES, TERMINAL_STAGES } from "@/lib/domain";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

// Grouped by mandate, and every open mandate is shown — including ones with
// no candidates yet. Absence of candidates is information (L-004).
export default async function Pipeline() {
  const [{ data: mandates }, { data: people }] = await Promise.all([
    db
      .from("mandate")
      .select(
        `id, title, status, company(id, name),
         candidacy(id, stage, stage_changed_at, person(id, full_name))`,
      )
      .eq("status", "open")
      .order("opened_at", { ascending: false }),
    db.from("person").select("id, full_name").is("erased_at", null).order("full_name").limit(500),
  ]);

  const jobs = mandates ?? [];
  const mandateOptions = jobs.map((m) => ({ id: m.id, title: m.title }));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-semibold">Pipeline</h1>
        <div className="flex gap-2">
          <AddCandidacyDialog mandates={mandateOptions} people={people ?? []} />
          <NewMandateDialog />
        </div>
      </div>

      {jobs.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No open mandates — open one to start a search.
        </p>
      )}

      {jobs.map((m) => {
        const columns = LIVE_STAGES.map((stage) => ({
          stage,
          cards: m.candidacy.filter((c) => c.stage === stage),
        }));
        const liveCount = m.candidacy.filter(
          (c) => !(TERMINAL_STAGES as readonly string[]).includes(c.stage),
        ).length;
        return (
          <section key={m.id}>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-heading text-lg font-medium">
                <Link href={`/jobs/${m.id}`} className="hover:underline">
                  {m.title}
                </Link>{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  ·{" "}
                  {m.company && (
                    <Link href={`/companies/${m.company.id}`} className="hover:underline">
                      {m.company.name}
                    </Link>
                  )}
                </span>
              </h2>
              <span className="text-xs text-muted-foreground tabular-nums">
                {liveCount} live
              </span>
            </div>

            {m.candidacy.length === 0 ? (
              <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                No candidates yet — use “Add candidate” to start the long list.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <div className="flex min-w-max gap-4">
                  {columns.map((col) => (
                    <div key={col.stage} className="w-56 shrink-0">
                      <div className="mb-2 flex items-center justify-between px-1">
                        <span className="text-xs font-medium capitalize">
                          {label(col.stage)}
                        </span>
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
                                  {days}d{" "}
                                  {days > 14 && <Badge variant="outline">stale</Badge>}
                                </p>
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
            )}
          </section>
        );
      })}
    </div>
  );
}
