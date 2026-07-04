"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addFoundEmail, findPersonEmail } from "@/lib/actions";
import type { PersonMatch } from "@/lib/apollo";
import { label } from "@/lib/domain";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

/**
 * R5/F3 — find a person's work email via Apollo, human in the middle (same
 * preview→confirm shape as EnrichCompanyDialog). "Find email" spends one Apollo
 * credit and shows the revealed email + verification status; nothing is written
 * until "Add email" confirms it. The write action enforces both ADR-025 §5
 * rails server-side (suppression + person_email uniqueness) — their refusals
 * surface here.
 */
export function FindEmailDialog({
  personId,
  personName,
}: {
  personId: string;
  personName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [match, setMatch] = useState<PersonMatch | null>(null);

  function reset(next: boolean) {
    setOpen(next);
    if (!next) {
      setPending(false);
      setError(null);
      setMatch(null);
    }
  }

  async function find() {
    setPending(true);
    setError(null);
    const res = await findPersonEmail({ personId });
    setPending(false);
    if (res.ok) setMatch(res.match);
    else setError(res.error);
  }

  async function add() {
    if (!match) return;
    setPending(true);
    setError(null);
    const res = await addFoundEmail({ personId, email: match.email });
    setPending(false);
    if (!res.ok) return setError("error" in res ? res.error : "Could not add the email.");
    reset(false);
    router.refresh();
  }

  const rows: [string, string | null][] = match
    ? [
        ["Email", match.email],
        ["Status", match.emailStatus ? label(match.emailStatus) : null],
        ["Name", match.name],
        ["Title", match.title],
        ["Company", match.organizationName],
      ]
    : [];

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger render={<Button variant="outline" size="sm">Find email</Button>} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Find email from Apollo</DialogTitle>
          <DialogDescription>
            {match
              ? "Verify this is the right person before adding — the address is checked against the suppression list and every other record on save."
              : `Matches ${personName} against Apollo by their current employer's domain. Each lookup uses one Apollo credit; nothing is saved until you confirm.`}
          </DialogDescription>
        </DialogHeader>

        {match && (
          <div className="flex flex-col gap-1.5 text-sm">
            {rows.filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <span className="w-20 shrink-0 text-muted-foreground">{k}</span>
                <span className="min-w-0 break-words">{v}</span>
              </div>
            ))}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="ghost" onClick={() => reset(false)} disabled={pending}>
            Cancel
          </Button>
          {match ? (
            <Button onClick={add} disabled={pending}>
              {pending ? "Adding…" : "Add email"}
            </Button>
          ) : (
            <Button onClick={find} disabled={pending}>
              {pending ? "Searching…" : "Find email"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
