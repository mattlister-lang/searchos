"use client";

import { updatePersonProfile } from "@/lib/actions";
import { SENIORITY_LEVELS } from "@/lib/domain";
import { useActionForm } from "@/lib/use-action-form";
import { Button } from "@/components/ui/button";
import { FormDialog, Field, SelectField, TextField } from "@/components/forms/form-dialog";
import { TagInput } from "@/components/forms/tag-input";

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
    functions: props.functions,
    skills: props.skills,
    sectors: props.sectors,
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
      <Field label="Functions">
        <TagInput field="functions" value={f.form.functions} onChange={f.set("functions")}
          placeholder="commercial, origination…" />
      </Field>
      <Field label="Skills">
        <TagInput field="skills" value={f.form.skills} onChange={f.set("skills")}
          placeholder="ppa, project finance…" />
      </Field>
      <Field label="Sectors">
        <TagInput field="sectors" value={f.form.sectors} onChange={f.set("sectors")}
          placeholder="hydrogen, solar…" />
      </Field>
      <TextField label="Location" value={f.form.location} onChange={f.setField("location")} />
    </FormDialog>
  );
}
