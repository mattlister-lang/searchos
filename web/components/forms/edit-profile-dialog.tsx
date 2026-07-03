"use client";

import { updatePersonProfile } from "@/lib/actions";
import { SENIORITY_LEVELS } from "@/lib/domain";
import { useActionForm } from "@/lib/use-action-form";
import { Button } from "@/components/ui/button";
import { FormDialog, SelectField, TextField } from "@/components/forms/form-dialog";

export function EditProfileDialog(props: {
  personId: string;
  seniority: string | null;
  functions: string[];
  skills: string[];
  sectors: string[];
  location: string | null;
}) {
  const f = useActionForm(updatePersonProfile, {
    seniority: props.seniority ?? "",
    functions: props.functions.join(", "),
    skills: props.skills.join(", "),
    sectors: props.sectors.join(", "),
    location: props.location ?? "",
  });

  return (
    <FormDialog
      trigger={<Button variant="outline" size="sm">Edit profile</Button>}
      title="Profile & matching attributes"
      open={f.open} onOpenChange={f.onOpenChange}
      error={f.error} pending={f.pending}
      submitLabel="Save profile"
      onSubmit={() => f.submit({ personId: props.personId })}
    >
      <SelectField label="Seniority" value={f.form.seniority} onChange={f.set("seniority")}
        options={SENIORITY_LEVELS} placeholder="Pick a level" />
      <TextField label="Functions (comma-separated)" placeholder="commercial, origination"
        value={f.form.functions} onChange={f.setField("functions")} />
      <TextField label="Skills (comma-separated)" placeholder="ppa, project finance"
        value={f.form.skills} onChange={f.setField("skills")} />
      <TextField label="Sectors (hydrogen, zev, solar, battery, grid, flexibility, other)"
        value={f.form.sectors} onChange={f.setField("sectors")} />
      <TextField label="Location" value={f.form.location} onChange={f.setField("location")} />
    </FormDialog>
  );
}
