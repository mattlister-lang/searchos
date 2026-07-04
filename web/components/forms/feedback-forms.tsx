"use client";

import { deleteFeedback, logFeedback } from "@/lib/actions";
import { FEEDBACK_SOURCES } from "@/lib/domain";
import { useActionForm } from "@/lib/use-action-form";
import { useConfirmableAction } from "@/lib/use-confirm-action";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { Field, FormDialog, SelectField, TextField } from "@/components/forms/form-dialog";
import { Textarea } from "@/components/ui/textarea";

/**
 * R4/F1 — candidacy feedback capture. One dialog, used from both the job page
 * (per candidate) and the person page (per candidacy); the action revalidates
 * both routes so the single entry stays in sync everywhere.
 */
export function AddFeedbackDialog(props: {
  candidacyId: string;
  contextLabel: string;
}) {
  const f = useActionForm(logFeedback, {
    source: "client",
    author: "",
    body: "",
  });

  return (
    <FormDialog
      trigger={<Button variant="outline" size="sm">Feedback</Button>}
      title={`Feedback — ${props.contextLabel}`}
      open={f.open} onOpenChange={f.onOpenChange}
      error={f.error} pending={f.pending}
      submitLabel="Save feedback"
      onSubmit={() => f.submit({ candidacyId: props.candidacyId })}
      submitDisabled={f.form.body.trim().length < 2}
    >
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="From" value={f.form.source} onChange={f.set("source")}
          options={FEEDBACK_SOURCES} />
        <TextField label="Who (optional)" placeholder="Jane, GeoPura"
          value={f.form.author} onChange={f.setField("author")} />
      </div>
      <Field label="Feedback">
        <Textarea rows={4} value={f.form.body} onChange={f.setField("body")}
          placeholder="e.g. client thought he was light on grid experience" />
      </Field>
    </FormDialog>
  );
}

/** Confirmed delete (ADR-013 rule 1) via the shared confirm machine — the
 *  same one stage moves and job closes use. */
export function DeleteFeedbackButton(props: { feedbackId: string }) {
  const del = useConfirmableAction<{ feedbackId: string }>(deleteFeedback);

  return (
    <>
      <button
        type="button"
        onClick={() => void del.run({ feedbackId: props.feedbackId })}
        disabled={del.pending}
        aria-label="Delete feedback"
        className="text-xs text-muted-foreground hover:text-destructive"
      >
        delete
      </button>
      {del.error && <span className="text-xs text-destructive">{del.error}</span>}
      <ConfirmDialog confirm={del.confirm} pending={del.pending} />
    </>
  );
}
