"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/actions";

export type ConfirmState = {
  message: string;
  accept: () => void;
  cancel: () => void;
} | null;

/**
 * The one confirm-before-consequence state machine (ADR-013 rule 1,
 * engineering.md §3 no-third-copy). Wraps any server action that may return
 * `needsConfirm`: `run(args)` fires it unconfirmed; a `needsConfirm` result
 * becomes `confirm` state for <ConfirmDialog>; accepting re-fires the same
 * args with `confirmed: true`. Used by MoveStageControl, MandateStatusControl
 * and the kanban drop path — one machine, three surfaces.
 */
export function useConfirmableAction<A extends Record<string, unknown>>(
  action: (args: A & { confirmed: boolean }) => Promise<ActionResult>,
) {
  const router = useRouter();
  const [pendingConfirm, setPendingConfirm] = useState<{ message: string; args: A } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run(args: A, confirmed = false) {
    setPending(true);
    setError(null);
    const res = await action({ ...args, confirmed });
    setPending(false);
    if (res.ok) {
      setPendingConfirm(null);
      router.refresh();
      return;
    }
    if ("needsConfirm" in res) setPendingConfirm({ message: res.needsConfirm, args });
    else if ("error" in res) {
      setPendingConfirm(null);
      setError(res.error);
    }
  }

  const confirm: ConfirmState = pendingConfirm
    ? {
        message: pendingConfirm.message,
        accept: () => void run(pendingConfirm.args, true),
        cancel: () => setPendingConfirm(null),
      }
    : null;

  return { run, confirm, pending, error };
}
