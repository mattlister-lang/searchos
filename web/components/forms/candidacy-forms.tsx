"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { logInterview, recordOffer, setInterviewOutcome } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const KINDS = ["consultant", "phone", "video", "in_person", "panel", "final"] as const;
const OUTCOMES = ["scheduled", "passed", "failed", "cancelled", "no_show"] as const;

export function LogInterviewDialog(props: { candidacyId: string; candidateName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    round: "1", kind: "video", scheduledAt: "", location: "", notes: "",
  });

  async function submit() {
    setPending(true);
    setError(null);
    const res = await logInterview({ candidacyId: props.candidacyId, ...form });
    setPending(false);
    if (res.ok) { setOpen(false); router.refresh(); }
    else if ("error" in res) setError(res.error);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm">Interview</Button>} />
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Interview — {props.candidateName}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Round</Label>
              <Input type="number" min={1} value={form.round}
                onChange={(e) => setForm({ ...form, round: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Kind</Label>
              <Select value={form.kind} onValueChange={(v) => v && setForm({ ...form, kind: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => (
                    <SelectItem key={k} value={k} className="capitalize">
                      {k.replaceAll("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Scheduled for</Label>
            <Input type="datetime-local" value={form.scheduledAt}
              onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label>Location / link</Label>
            <Input value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label>Notes</Label>
            <Textarea rows={3} value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button disabled={pending} onClick={submit}>
            {pending ? "Saving…" : "Log interview"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
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
        {OUTCOMES.map((o) => (
          <SelectItem key={o} value={o} className="capitalize text-xs">
            {o.replaceAll("_", " ")}
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
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    salary: "", feeAmount: "", offerAcceptedAt: "", startDate: "", board: false,
  });

  async function submit() {
    setPending(true);
    setError(null);
    const res = await recordOffer({ candidacyId: props.candidacyId, ...form });
    setPending(false);
    if (res.ok) { setOpen(false); router.refresh(); }
    else if ("error" in res) setError(res.error);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm">Offer</Button>} />
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Offer — {props.candidateName} · {props.mandateTitle}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Salary (£)</Label>
              <Input type="number" value={form.salary}
                onChange={(e) => setForm({ ...form, salary: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Fee (£)</Label>
              <Input type="number" value={form.feeAmount}
                onChange={(e) => setForm({ ...form, feeAmount: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Offer accepted</Label>
              <Input type="date" value={form.offerAcceptedAt}
                onChange={(e) => setForm({ ...form, offerAcceptedAt: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Start date</Label>
              <Input type="date" value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.board}
              onChange={(e) => setForm({ ...form, board: e.target.checked })} />
            Board this fee (requires accepted offer + start date)
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button disabled={pending} onClick={submit}>
            {pending ? "Saving…" : form.board ? "Save & board fee" : "Save offer details"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
