"use client";

import { useRouter } from "next/navigation";
import { logSpecDeal } from "@/lib/actions";
import { useActionForm } from "@/lib/use-action-form";
import { Button } from "@/components/ui/button";
import { FormDialog, Field, TextField } from "@/components/forms/form-dialog";

/**
 * R6/F3 — log a BD deal straight from a Radar spec (product brief §12: open the
 * conversation by bringing value). Resolution before creation: the deal is
 * created at `lead` via the existing upsertDeal path; if the company isn't in
 * the CRM yet, logSpecDeal returns needsConfirm and this dialog confirms
 * creating it (as a prospect) — a spec-in never blind-creates. The spec summary
 * is appended to the company notes (append-never-clobber), all server-side.
 */
export function SpecDealDialog(props: {
  companyName?: string;
  title: string;
  summary: string;
  trigger?: React.ReactElement;
}) {
  const router = useRouter();
  const f = useActionForm(
    logSpecDeal,
    {
      companyName: props.companyName ?? "",
      name: `Spec-in: ${props.title}`,
      nextStep: "",
      summary: props.summary,
    },
    // Part B: land on the created deal — its page is where it gets worked.
    { onSuccess: (res) => { if (res.id) router.push(`/deals/${res.id}`); } },
  );

  const needsConfirm =
    f.result && !f.result.ok && "needsConfirm" in f.result ? f.result.needsConfirm : null;

  return (
    <FormDialog
      trigger={props.trigger ?? <Button size="sm">Log BD deal</Button>}
      title="Log BD deal from spec"
      open={f.open} onOpenChange={f.onOpenChange}
      error={f.error} pending={f.pending}
      submitLabel="Log deal" pendingLabel="Logging…"
      onSubmit={() => f.submit()}
      submitDisabled={
        f.form.companyName.trim().length < 2 ||
        f.form.name.trim().length < 2 ||
        f.form.nextStep.trim().length < 2
      }
      hideSubmit={!!needsConfirm}
    >
      <TextField label="Company" value={f.form.companyName}
        onChange={f.setField("companyName")} />
      <TextField label="Deal name" value={f.form.name} onChange={f.setField("name")} />
      <TextField label="Next step (required — pipelines die without one)"
        value={f.form.nextStep} onChange={f.setField("nextStep")} />
      {props.summary && (
        <Field label="Appended to company notes">
          <p className="rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
            {props.summary}
          </p>
        </Field>
      )}

      {needsConfirm && (
        <div className="rounded-md border p-3 text-sm">
          <p>{needsConfirm}</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" disabled={f.pending}
              onClick={() => f.submit({ createCompany: true })}>
              Create company &amp; log deal
            </Button>
            <Button variant="ghost" size="sm" disabled={f.pending}
              onClick={() => f.onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </FormDialog>
  );
}
