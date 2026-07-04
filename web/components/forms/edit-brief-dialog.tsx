"use client";

import { updateMandateBrief } from "@/lib/actions";
import { useActionForm } from "@/lib/use-action-form";
import { Button } from "@/components/ui/button";
import { Field, FormDialog, TextField } from "@/components/forms/form-dialog";
import { PersonPicker } from "@/components/forms/person-picker";
import { Textarea } from "@/components/ui/textarea";

/**
 * R4/F2 — the role brief editor. Salary and location edit the existing 0006
 * mandate columns; team/package fields and the hiring manager (a real person
 * link, PersonPicker) are 0010. Submits the FULL brief state, so clearing a
 * field clears the column — the dialog is the brief, not a patch.
 */
export function EditBriefDialog(props: {
  mandateId: string;
  brief: string | null;
  salaryRange: string | null;
  location: string | null;
  team: string | null;
  bonus: string | null;
  carAllowance: string | null;
  pension: string | null;
  noticePeriod: string | null;
  hiringManagerId: string | null;
  hiringManagerName: string | null;
}) {
  const f = useActionForm(updateMandateBrief, {
    brief: props.brief ?? "",
    salaryRange: props.salaryRange ?? "",
    location: props.location ?? "",
    team: props.team ?? "",
    bonus: props.bonus ?? "",
    carAllowance: props.carAllowance ?? "",
    pension: props.pension ?? "",
    noticePeriod: props.noticePeriod ?? "",
    hiringManagerId: props.hiringManagerId ?? "",
  });

  return (
    <FormDialog
      trigger={<Button variant="outline" size="sm">Edit brief</Button>}
      title="Role brief"
      open={f.open} onOpenChange={f.onOpenChange}
      error={f.error} pending={f.pending}
      submitLabel="Save brief"
      onSubmit={() => f.submit({ mandateId: props.mandateId })}
    >
      <Field label="Brief">
        <Textarea rows={4} value={f.form.brief} onChange={f.setField("brief")} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Salary" placeholder="£120-150k" value={f.form.salaryRange}
          onChange={f.setField("salaryRange")} />
        <TextField label="Location" value={f.form.location}
          onChange={f.setField("location")} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Team" placeholder="Origination" value={f.form.team}
          onChange={f.setField("team")} />
        <TextField label="Notice period" placeholder="3 months" value={f.form.noticePeriod}
          onChange={f.setField("noticePeriod")} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Bonus" placeholder="20% of base" value={f.form.bonus}
          onChange={f.setField("bonus")} />
        <TextField label="Car allowance" value={f.form.carAllowance}
          onChange={f.setField("carAllowance")} />
      </div>
      <TextField label="Pension" placeholder="5% matched" value={f.form.pension}
        onChange={f.setField("pension")} />
      <Field label="Hiring manager">
        <PersonPicker
          value={f.form.hiringManagerId}
          onChange={f.set("hiringManagerId")}
          initialLabel={props.hiringManagerName ?? undefined}
          placeholder="Search people by name…"
        />
      </Field>
    </FormDialog>
  );
}
