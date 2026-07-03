"use client";

import { logActivity } from "@/lib/actions";
import { ACTIVITY_TYPES } from "@/lib/domain";
import { useActionForm } from "@/lib/use-action-form";
import { Button } from "@/components/ui/button";
import { FormDialog, Field, SelectField, TextField } from "@/components/forms/form-dialog";
import { Textarea } from "@/components/ui/textarea";

export function LogActivityDialog(props: {
  personId?: string;
  companyId?: string;
  dealId?: string;
  mandateId?: string;
  contextLabel: string;
}) {
  const f = useActionForm(logActivity, { type: "call", subject: "", body: "" });

  return (
    <FormDialog
      trigger={<Button variant="outline" size="sm">Log activity</Button>}
      title={`Log activity — ${props.contextLabel}`}
      open={f.open} onOpenChange={f.onOpenChange}
      error={f.error} pending={f.pending}
      submitLabel="Log it"
      onSubmit={() =>
        f.submit({
          personIds: props.personId ? [props.personId] : [],
          companyId: props.companyId,
          dealId: props.dealId,
          mandateId: props.mandateId,
        })
      }
    >
      <SelectField label="Type" value={f.form.type} onChange={f.set("type")}
        options={ACTIVITY_TYPES} />
      <TextField label="Subject" value={f.form.subject} onChange={f.setField("subject")} />
      <Field label="Notes">
        <Textarea rows={5} value={f.form.body} onChange={f.setField("body")} />
      </Field>
    </FormDialog>
  );
}
