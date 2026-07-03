import Link from "next/link";
import {
  AddCandidacyDialog,
  MoveStageControl,
  NewMandateDialog,
} from "@/components/forms/pipeline-forms";
import { db } from "@/lib/db";
import { daysSince, stageLabel, STAGE_ORDER } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

type Row = {
  candidacy_id: string;
  person_id: string;
  full_name: string;
  mandate: string;
  client: string;
  stage: string;
  stage_changed_at: string;
};

export default async function Pipeline() {
  const [{ data }, { data: mandates }, { data: people }] = await Promise.all([
    db
      .from("v_pipeline")
      .select("candidacy_id, person_id, full_name, mandate, client, stage, stage_changed_at"),
    db.from("mandate").select("id, title").eq("status", "open").order("title"),
    db.from("person").select("id, full_name").is("erased_at", null).order("full_name").limit(500),
  ]);
  const rows = (data ?? []) as Row[];

  const live = STAGE_ORDER.map((stage) => ({
    stage,
    cards: rows.filter((r) => r.stage === stage),
  }));
  const terminal = rows.filter(
    (r) => !STAGE_ORDER.includes(r.stage as (typeof STAGE_ORDER)[number]),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-semibold">Pipeline</h1>
        <div className="flex gap-2">
          <AddCandidacyDialog
            mandates={mandates ?? []}
            people={people ?? []}
          />
          <NewMandateDialog />
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No candidacies yet — open a mandate, then add candidates to it.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <div className="flex min-w-max gap-4">
            {live.map((col) => (
              <div key={col.stage} className="w-60 shrink-0">
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-sm font-medium capitalize">
                    {stageLabel(col.stage)}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {col.cards.length}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {col.cards.map((c) => {
                    const days = daysSince(c.stage_changed_at) ?? 0;
                    return (
                      <Card key={c.candidacy_id} className="py-3">
                        <CardContent className="px-3">
                          <Link
                            href={`/people/${c.person_id}`}
                            className="text-sm font-medium hover:underline"
                          >
                            {c.full_name}
                          </Link>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {c.mandate} · {c.client}
                          </p>
                          <p className="mt-2 text-xs text-muted-foreground tabular-nums">
                            {days}d in stage{" "}
                            {days > 14 && <Badge variant="outline">stale</Badge>}
                          </p>
                          <div className="mt-2">
                            <MoveStageControl
                              candidacyId={c.candidacy_id}
                              stage={c.stage}
                            />
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

      {terminal.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Closed this cycle</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {terminal.map((c) => (
              <Badge key={c.candidacy_id} variant="outline" className="capitalize">
                {c.full_name} — {stageLabel(c.stage)}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
