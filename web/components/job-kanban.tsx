"use client";

import { useState } from "react";
import Link from "next/link";
import { moveStage } from "@/lib/actions";
import { label, LIVE_STAGES } from "@/lib/domain";
import { useConfirmableAction } from "@/lib/use-confirm-action";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { MoveStageControl } from "@/components/forms/pipeline-forms";

export type KanbanCard = {
  candidacyId: string;
  stage: string;
  personId: string | null;
  personName: string;
  daysInStage: number;
  interviews: number;
};

/**
 * Drag-and-drop candidate kanban (UAT P3). Native HTML5 drag events, no
 * dependency. A drop calls the same moveStage action as the click fallback
 * (MoveStageControl, kept on every card), through the same shared confirm
 * machine — so stage regressions and moves to placed surface the identical
 * confirm-before-consequence dialog (ADR-013) regardless of input method.
 * Terminal stages (placed/rejected/withdrawn) aren't drop columns; they
 * remain reachable via the per-card select.
 */
export function JobKanban(props: { cards: KanbanCard[] }) {
  const move = useConfirmableAction<{ candidacyId: string; stage: string }>(moveStage);
  const [overStage, setOverStage] = useState<string | null>(null);

  const columns = LIVE_STAGES.map((stage) => ({
    stage,
    cards: props.cards.filter((c) => c.stage === stage),
  }));

  function onDrop(e: React.DragEvent<HTMLDivElement>, stage: string) {
    e.preventDefault();
    setOverStage(null);
    const candidacyId = e.dataTransfer.getData("text/plain");
    const card = props.cards.find((c) => c.candidacyId === candidacyId);
    if (!card || card.stage === stage) return;
    void move.run({ candidacyId, stage });
  }

  /** Explicit drag image: a plain-styled clone of just the card. Left to its
   *  own devices the browser can rasterise far more than the dragged element
   *  (Matt saw the entire UI move) — a detached clone is deterministic. */
  function setCardDragImage(e: React.DragEvent<HTMLDivElement>) {
    const node = e.currentTarget;
    const ghost = node.cloneNode(true) as HTMLElement;
    ghost.style.position = "fixed";
    ghost.style.top = "-1000px";
    ghost.style.left = "-1000px";
    ghost.style.width = `${node.offsetWidth}px`;
    ghost.style.pointerEvents = "none";
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, node.offsetWidth / 2, 20);
    // The browser snapshots the image synchronously on dragstart; the clone
    // can go on the next tick.
    setTimeout(() => ghost.remove(), 0);
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-max gap-4">
        {columns.map((col) => (
          <div
            key={col.stage}
            className="w-60 shrink-0"
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setOverStage(col.stage);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setOverStage((s) => (s === col.stage ? null : s));
              }
            }}
            onDrop={(e) => onDrop(e, col.stage)}
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-sm font-medium capitalize">{label(col.stage)}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {col.cards.length}
              </span>
            </div>
            <div
              className={`flex min-h-24 flex-col gap-2 rounded-lg transition-colors ${
                overStage === col.stage ? "bg-accent/60 ring-1 ring-ring" : ""
              }`}
            >
              {col.cards.map((c) => (
                <Card
                  key={c.candidacyId}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", c.candidacyId);
                    e.dataTransfer.effectAllowed = "move";
                    setCardDragImage(e);
                  }}
                  className="cursor-grab py-3 active:cursor-grabbing"
                >
                  <CardContent className="px-3">
                    {c.personId ? (
                      <Link href={`/people/${c.personId}`} draggable={false}
                        className="text-sm font-medium hover:underline">
                        {c.personName}
                      </Link>
                    ) : (
                      <span className="text-sm font-medium">{c.personName}</span>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                      {c.daysInStage}d in stage{" "}
                      {c.daysInStage > 14 && <Badge variant="outline">stale</Badge>}
                    </p>
                    {c.interviews > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {c.interviews} interview{c.interviews > 1 ? "s" : ""}
                      </p>
                    )}
                    <div className="mt-2">
                      <MoveStageControl candidacyId={c.candidacyId} stage={c.stage} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
      {move.error && <p className="mt-2 text-xs text-destructive">{move.error}</p>}
      <ConfirmDialog confirm={move.confirm} pending={move.pending} />
    </div>
  );
}
