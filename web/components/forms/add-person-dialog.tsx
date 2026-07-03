"use client";

import { useRouter } from "next/navigation";
import { createPerson } from "@/lib/actions";
import { useActionForm } from "@/lib/use-action-form";
import { Button } from "@/components/ui/button";
import { FormDialog, TextField } from "@/components/forms/form-dialog";

const INITIAL = {
  fullName: "", email: "", linkedinUrl: "", location: "", title: "", companyName: "",
};

export function AddPersonDialog() {
  const router = useRouter();
  const f = useActionForm(createPerson, INITIAL, {
    onSuccess: (res) => res.id && router.push(`/people/${res.id}`),
  });
  const ambiguous = f.result && !f.result.ok && "ambiguous" in f.result ? f.result.ambiguous : null;
  const matched = f.result && !f.result.ok && "matched" in f.result ? f.result.matched : null;

  return (
    <FormDialog
      trigger={<Button size="sm">Add person</Button>}
      title="Add person"
      open={f.open} onOpenChange={f.onOpenChange}
      error={f.error} pending={f.pending}
      submitLabel="Add" pendingLabel="Checking…"
      onSubmit={() => f.submit()}
      submitDisabled={f.form.fullName.trim().length < 2}
      hideSubmit={!!ambiguous}
    >
      <TextField label="Full name *" value={f.form.fullName} onChange={f.setField("fullName")} />
      <TextField label="Email" type="email" value={f.form.email} onChange={f.setField("email")} />
      <TextField label="LinkedIn URL" value={f.form.linkedinUrl} onChange={f.setField("linkedinUrl")} />
      <TextField label="Company" value={f.form.companyName} onChange={f.setField("companyName")} />
      <TextField label="Job title" value={f.form.title} onChange={f.setField("title")} />
      <TextField label="Location" value={f.form.location} onChange={f.setField("location")} />

      {matched && (
        <div className="rounded-md border p-3 text-sm">
          <p>This person already exists (matched on {matched.matchedOn}).</p>
          <Button variant="outline" size="sm" className="mt-2"
            onClick={() => { f.onOpenChange(false); router.push(`/people/${matched.personId}`); }}>
            Open their record
          </Button>
        </div>
      )}

      {ambiguous && (
        <div className="rounded-md border p-3 text-sm">
          <p className="font-medium">Possible existing matches — pick one or create anyway:</p>
          <div className="mt-2 flex flex-col gap-1">
            {ambiguous.map((c) => (
              <Button key={c.personId} variant="outline" size="sm" disabled={f.pending}
                onClick={() => f.submit({ useExistingId: c.personId })}>
                Use existing: {c.fullName} ({Math.round(c.similarity * 100)}%)
              </Button>
            ))}
            <Button variant="ghost" size="sm" disabled={f.pending}
              onClick={() => f.submit({ forceCreate: true })}>
              None of these — create new
            </Button>
          </div>
        </div>
      )}
    </FormDialog>
  );
}
