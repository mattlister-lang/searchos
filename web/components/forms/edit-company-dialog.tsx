"use client";

import { updateCompany } from "@/lib/actions";
import { COMPANY_STATUSES } from "@/lib/domain";
import { useActionForm } from "@/lib/use-action-form";
import { Button } from "@/components/ui/button";
import { FormDialog, Field, SelectField, TextField } from "@/components/forms/form-dialog";
import { TagInput } from "@/components/forms/tag-input";
import { Textarea } from "@/components/ui/textarea";

/** Edit a company in place (UAT Q5): status, sectors, notes, and add a domain.
 *  Built on the shared form system — no hand-rolled state (L-003). */
export function EditCompanyDialog(props: {
  companyId: string;
  status: string;
  sectors: string[];
  notes: string | null;
}) {
  const f = useActionForm(updateCompany, {
    status: props.status,
    sectors: props.sectors,
    notes: props.notes ?? "",
    addDomain: "",
  });

  return (
    <FormDialog
      trigger={<Button variant="outline" size="sm">Edit</Button>}
      title="Edit company"
      open={f.open} onOpenChange={f.onOpenChange}
      error={f.error} pending={f.pending}
      submitLabel="Save company"
      onSubmit={() => f.submit({ companyId: props.companyId })}
    >
      <SelectField label="Status" value={f.form.status} onChange={f.set("status")}
        options={COMPANY_STATUSES} />
      <Field label="Sectors">
        <TagInput field="sectors" value={f.form.sectors} onChange={f.set("sectors")}
          placeholder="hydrogen, solar…" />
      </Field>
      <Field label="Notes">
        <Textarea rows={4} value={f.form.notes} onChange={f.setField("notes")} />
      </Field>
      <TextField label="Add email domain (optional — powers matching)" placeholder="acme.com"
        value={f.form.addDomain} onChange={f.setField("addDomain")} />
    </FormDialog>
  );
}
