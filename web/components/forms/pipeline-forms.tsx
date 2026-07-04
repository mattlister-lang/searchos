"use client";

import { addCandidacy, createMandate, moveStage, setMandateStatus } from "@/lib/actions";
import { CANDIDACY_STAGES, label, MANDATE_STATUSES } from "@/lib/domain";
import { useActionForm } from "@/lib/use-action-form";
import { useConfirmableAction } from "@/lib/use-confirm-action";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { FormDialog, Field, TextField } from "@/components/forms/form-dialog";
import { PersonPicker } from "@/components/forms/person-picker";
import { TagInput } from "@/components/forms/tag-input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function NewMandateDialog() {
  const f = useActionForm(createMandate, {
    companyName: "", title: "", brief: "",
    seniority: "", location: "", salaryRange: "", skills: [] as string[],
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
      <TextField label="Salary range" placeholder="£120-150k" value={f.form.salaryRange}
        onChange={f.setField("salaryRange")} />
      <Field label="Skills">
        <TagInput field="skills" value={f.form.skills} onChange={f.set("skills")}
          placeholder="ppa, origination…" />
      </Field>
    </FormDialog>
  );
}

export function AddCandidacyDialog(props: {
  mandates: { id: string; title: string }[];
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
        <PersonPicker
          value={f.form.personId}
          onChange={f.set("personId")}
          placeholder="Search people by name…"
        />
      </Field>
      {!props.fixedMandateId && (
        <Field label="Mandate">
          <Select value={f.form.mandateId} onValueChange={(v) => v && f.set("mandateId")(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Pick a mandate">
                {props.mandates.find((m) => m.id === f.form.mandateId)?.title ?? null}
              </SelectValue>
            </SelectTrigger>
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

/** Stage mover — the click/keyboard fallback beside the kanban drag path.
 *  Both surfaces run the SAME confirm machine (useConfirmableAction), so a
 *  regression or a move to placed asks first no matter how it was triggered. */
export function MoveStageControl(props: { candidacyId: string; stage: string }) {
  const move = useConfirmableAction<{ candidacyId: string; stage: string }>(moveStage);

  return (
    <>
      <Select value={props.stage}
        onValueChange={(v) => v && void move.run({ candidacyId: props.candidacyId, stage: v })}>
        <SelectTrigger className="h-7 w-full text-xs capitalize">
          <SelectValue>{label(props.stage)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {CANDIDACY_STAGES.map((s) => (
            <SelectItem key={s} value={s} className="capitalize text-xs">
              {label(s)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {move.error && <p className="mt-1 text-xs text-destructive">{move.error}</p>}
      <ConfirmDialog confirm={move.confirm} pending={move.pending} />
    </>
  );
}

/** Archive/close a job (UAT Q4). Same confirm-before-consequence machine as
 *  MoveStageControl: closing an open job asks first, reopening/on-hold don't. */
export function MandateStatusControl(props: { mandateId: string; status: string }) {
  const set = useConfirmableAction<{ mandateId: string; status: string }>(setMandateStatus);

  return (
    <>
      <Select value={props.status}
        onValueChange={(v) => v && void set.run({ mandateId: props.mandateId, status: v })}>
        <SelectTrigger className="h-8 w-36 text-xs capitalize">
          <SelectValue>{label(props.status)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {MANDATE_STATUSES.map((s) => (
            <SelectItem key={s} value={s} className="capitalize text-xs">
              {label(s)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {set.error && <p className="mt-1 text-xs text-destructive">{set.error}</p>}
      <ConfirmDialog confirm={set.confirm} pending={set.pending} />
    </>
  );
}
