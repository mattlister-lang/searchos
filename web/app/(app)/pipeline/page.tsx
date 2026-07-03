import Link from "next/link";
import {
  AddCandidacyDialog,
  NewMandateDialog,
} from "@/components/forms/pipeline-forms";
import { db } from "@/lib/db";
import { daysSince } from "@/lib/format";
import { chanceToFill, label, LIVE_STAGES } from "@/lib/domain";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

// Slimmed pipeline (P2): one compact summary per open mandate — live count,
// stage distribution, chance-to-fill, movement recency. The full kanban lives
// on the job page (/jobs/[id]); this is the birds-eye. Every open mandate is
// shown, including ones with no candidates yet — absence is information (L-004).
export default async function Pipeline() {
  const { data: mandates } = await db
    .from("mandate")
    .select(
      `id, title, company(id, name),
       candidacy(stage, stage_changed_at)`,
    )
    .eq("status", "open")
    .order("opened_at", { ascending: false });

  const jobs = mandates ?? [];
  const mandateOptions = jobs.map((m) => ({ id: m.id, title: m.title }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-semibold">Pipeline</h1>
        <div className="flex gap-2">
          <AddCandidacyDialog mandates={mandateOptions} />
          <NewMandateDialog />
        </div>
      </div>

      {jobs.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No open mandates — open one to start a search.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {jobs.map((m) => {
          const dist = LIVE_STAGES.map((stage) => ({
            stage,
            n: m.candidacy.filter((c) => c.stage === stage).length,
          }));
          const liveStages = m.candidacy
            .map((c) => c.stage)
            .filter((s) => (LIVE_STAGES as readonly string[]).includes(s));
          const liveCount = liveStages.length;
          const chance = chanceToFill(liveStages);

          // Days since the most recent stage movement across all candidacies.
          const moveDays = m.candidacy
            .map((c) => daysSince(c.stage_changed_at))
            .filter((d): d is number => d != null);
          const sinceMove = moveDays.length ? Math.min(...moveDays) : null;
          const stale = sinceMove != null && sinceMove > 14;

          return (
            <Card key={m.id}>
              <CardContent className="flex flex-col gap-3 py-4">
                <div className="flex items-baseline justify-between gap-4">
                  <div className="min-w-0 truncate">
                    <Link href={`/jobs/${m.id}`} className="font-heading font-medium hover:underline">
                      {m.title}
                    </Link>
                    {m.company && (
                      <span className="text-sm text-muted-foreground">
                        {" · "}
                        <Link href={`/companies/${m.company.id}`} className="hover:underline">
                          {m.company.name}
                        </Link>
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-baseline gap-3 text-sm">
                    <span className="text-muted-foreground tabular-nums">{liveCount} live</span>
                    <span className="font-semibold tabular-nums">{Math.round(chance * 100)}%</span>
                  </div>
                </div>

                <div className="flex h-2 w-full gap-px overflow-hidden rounded-full bg-muted">
                  {dist
                    .filter((d) => d.n > 0)
                    .map((d) => (
                      <div
                        key={d.stage}
                        style={{ flexGrow: d.n }}
                        title={`${label(d.stage)}: ${d.n}`}
                        className="bg-primary"
                      />
                    ))}
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>chance to fill</span>
                  {m.candidacy.length === 0 ? (
                    <span>no candidates yet</span>
                  ) : (
                    <span className="flex items-center gap-2 tabular-nums">
                      {sinceMove == null ? "no movement yet" : `${sinceMove}d since last move`}
                      {stale && <Badge variant="outline">stale</Badge>}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
