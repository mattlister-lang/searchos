"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/actions";

/**
 * The one form-state machine (engineering.md §3). Owns pending/error/result,
 * submit, reset-on-success, and router.refresh. Dialogs supply fields and a
 * payload builder; nothing hand-rolls this again (L-003).
 */
export function useActionForm<T extends Record<string, unknown>>(
  action: (input: unknown) => Promise<ActionResult>,
  initial: T,
  opts?: { onSuccess?: (res: { ok: true; id?: string }) => void },
) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<T>(initial);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);

  const set = <K extends keyof T>(key: K) => (value: T[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const setField = <K extends keyof T>(key: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      set(key)(e.target.value as T[K]);

  async function submit(extra?: Record<string, unknown>) {
    setPending(true);
    setResult(null);
    const res = await action({ ...form, ...extra });
    setPending(false);
    setResult(res);
    if (res.ok) {
      setOpen(false);
      setForm(initial);
      setResult(null);
      opts?.onSuccess?.(res);
      router.refresh();
    }
    return res;
  }

  const error = result && !result.ok && "error" in result ? result.error : null;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setResult(null);
  }

  return { open, onOpenChange, form, set, setField, submit, pending, result, error };
}
