"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import type { ConfirmState } from "@/lib/use-confirm-action";

/** The one confirm-before-consequence dialog (engineering.md §3) — renders
 *  the `confirm` state produced by useConfirmableAction. */
export function ConfirmDialog(props: { confirm: ConfirmState; pending: boolean }) {
  return (
    <Dialog open={!!props.confirm} onOpenChange={(o) => !o && props.confirm?.cancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Are you sure?</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{props.confirm?.message}</p>
        <div className="flex gap-2">
          <Button disabled={props.pending} onClick={() => props.confirm?.accept()}>
            Confirm
          </Button>
          <Button variant="outline" onClick={() => props.confirm?.cancel()}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
