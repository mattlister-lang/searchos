"use client";

import { useRouter } from "next/navigation";
import { logInterview, recordOffer, setInterviewOutcome } from "@/lib/actions";
import { INTERVIEW_KINDS, INTERVIEW_OUTCOMES, label } from "@/lib/domain";
import { useActionForm } from "@/lib/use-action-form";
import { Button } from "@/components/ui/button";
import { FormDialog, SelectField, TextField, Field } from "@/components/forms/form-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function LogInterviewDialog(props: { candidacyId: string; candidateName: string }) {
  const f = useActionForm(logInterview, {
    round: "1", kind: "video", scheduledAt: "", location: "", notes: "",
  });

  return (
    <FormDialog
      trigger={<Button variant="outline" size="sm">Interview</Button>}
      title={`Interview — ${props.candidateName}`}
      open={f.open} onOpenChange={f.onOpenChange}
      error={f.error} pending={f.pending}
      submitLabel="Log interview"
      onSubmit={() => f.submit({ candidacyId: props.candidacyId })}
    >
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Round" type="number" value={f.form.round}
          onChange={f.setField("round")} />
        <SelectField label="Kind" value={f.form.kind} onChange={f.set("kind")}
          options={INTERVIEW_KINDS} />
      </div>
      <TextField label="Scheduled for" type="datetime-local" value={f.form.scheduledAt}
        onChange={f.setField("scheduledAt")} />
      <TextField label="Location / link" value={f.form.location}
        onChange={f.setField("location")} />
      <Field label="Notes">
        <Textarea rows={3} value={f.form.notes} onChange={f.setField("notes")} />
      </Field>
    </FormDialog>
  );
}

export function InterviewOutcomeControl(props: { interviewId: string; outcome: string }) {
  const router = useRouter();
  async function change(outcome: string) {
    const res = await setInterviewOutcome({ interviewId: props.interviewId, outcome });
    if (res.ok) router.refresh();
  }
  return (
    <Select value={props.outcome} onValueChange={(v) => v && change(v)}>
      <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>
        {INTERVIEW_OUTCOMES.map((o) => (
          <SelectItem key={o} value={o} className="capitalize text-xs">
            {label(o)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function OfferDialog(props: {
  candidacyId: string;
  candidateName: string;
  mandateTitle: string;
}) {
  const f = useActionForm(recordOffer, {
    salary: "", feeAmount: "", offerAcceptedAt: "", startDate: "", board: false,
  });

  return (
    <FormDialog
      trigger={<Button variant="outline" size="sm">Offer</Button>}
      title={`Offer — ${props.candidateName} · ${props.mandateTitle}`}
      open={f.open} onOpenChange={f.onOpenChange}
      error={f.error} pending={f.pending}
      submitLabel={f.form.board ? "Save & board fee" : "Save offer details"}
      onSubmit={() => f.submit({ candidacyId: props.candidacyId })}
    >
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Salary (£)" type="number" value={f.form.salary}
          onChange={f.setField("salary")} />
        <TextField label="Fee (£)" type="number" value={f.form.feeAmount}
          onChange={f.setField("feeAmount")} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Offer accepted" type="date" value={f.form.offerAcceptedAt}
          onChange={f.setField("offerAcceptedAt")} />
        <TextField label="Start date" type="date" value={f.form.startDate}
          onChange={f.setField("startDate")} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.form.board}
          onChange={(e) => f.set("board")(e.target.checked)} />
        Board this fee (requires accepted offer + start date)
      </label>
    </FormDialog>
  );
}
