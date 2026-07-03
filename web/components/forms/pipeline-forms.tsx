"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addCandidacy, createMandate, moveStage } from "@/lib/actions";
import { CANDIDACY_STAGES, label } from "@/lib/domain";
import { useActionForm } from "@/lib/use-action-form";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { FormDialog, Field, TextField } from "@/components/forms/form-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function NewMandateDialog() {
  const f = useActionForm(createMandate, {
    companyName: "", title: "", brief: "",
    seniority: "", location: "", salaryRange: "", skills: "",
  });

  return (
    <FormDialog
      trigger={<Button size="sm">New job</Button>}
      title="New job (mandate)"
      open={f.open} onOpenChange={f.onOpenChange}
      error={f.error} pending={f.pending}
      submitLabel="Open mandate" pendingLabel="Creating…"
      onSubmit={() => f.submit()}
    >
      <TextField label="Client company (must already exist)" value={f.form.companyName}
        onChange={f.setField("companyName")} />
      <TextField label="Role title" value={f.form.title} onChange={f.setField("title")} />
      <Field label="Brief">
        <Textarea rows={4} value={f.form.brief} onChange={f.setField("brief")} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Seniority" placeholder="director" value={f.form.seniority}
          onChange={f.setField("seniority")} />
        <TextField label="Location" value={f.form.location}
          onChange={f.setField("location")} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Salary range" placeholder="£120-150k" value={f.form.salaryRange}
          onChange={f.setField("salaryRange")} />
        <TextField label="Skills (comma-sep)" placeholder="ppa, origination"
          value={f.form.skills} onChange={f.setField("skills")} />
      </div>
    </FormDialog>
  );
}

export function AddCandidacyDialog(props: {
  mandates: { id: string; title: string }[];
  people: { id: string; full_name: string }[];
  fixedMandateId?: string;
}) {
  const f = useActionForm(addCandidacy, {
    personId: "",
    mandateId: props.fixedMandateId ?? "",
  });

  return (
    <FormDialog
      trigger={<Button variant="outline" size="sm">Add candidate</Button>}
      title="Add candidate to mandate"
      open={f.open} onOpenChange={f.onOpenChange}
      error={f.error} pending={f.pending}
      submitLabel="Add at identified" pendingLabel="Adding…"
      onSubmit={() => f.submit()}
      submitDisabled={!f.form.personId || !f.form.mandateId}
    >
      <Field label="Candidate">
        <Select value={f.form.personId} onValueChange={(v) => v && f.set("personId")(v)}>
          <SelectTrigger><SelectValue placeholder="Pick a person" /></SelectTrigger>
          <SelectContent>
            {props.people.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {!props.fixedMandateId && (
        <Field label="Mandate">
          <Select value={f.form.mandateId} onValueChange={(v) => v && f.set("mandateId")(v)}>
            <SelectTrigger><SelectValue placeholder="Pick a mandate" /></SelectTrigger>
            <SelectContent>
              {props.mandates.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
    </FormDialog>
  );
}

/** Stage mover with confirm-before-consequence — stateful beyond a plain
 *  form, so it composes the primitives rather than FormDialog. */
export function MoveStageControl(props: { candidacyId: string; stage: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<{ message: string; stage: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function move(stage: string, confirmed = false) {
    setPending(true);
    setError(null);
    const res = await moveStage({ candidacyId: props.candidacyId, stage, confirmed });
    setPending(false);
    if (res.ok) { setConfirm(null); router.refresh(); return; }
    if ("needsConfirm" in res) setConfirm({ message: res.needsConfirm, stage });
    else if ("error" in res) setError(res.error);
  }

  return (
    <>
      <Select value={props.stage} onValueChange={(v) => v && move(v)}>
        <SelectTrigger className="h-7 w-full text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {CANDIDACY_STAGES.map((s) => (
            <SelectItem key={s} value={s} className="capitalize text-xs">
              {label(s)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Are you sure?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{confirm?.message}</p>
          <div className="flex gap-2">
            <Button disabled={pending} onClick={() => confirm && move(confirm.stage, true)}>
              Confirm
            </Button>
            <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
