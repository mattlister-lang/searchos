"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addCandidacy, createMandate, moveStage } from "@/lib/actions";
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

const ALL_STAGES = [
  "identified", "approached", "screening", "shortlisted",
  "client_interview", "offer", "placed", "rejected", "withdrawn",
] as const;

export function NewMandateDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    companyName: "", title: "", brief: "",
    seniority: "", location: "", salaryRange: "", skills: "",
  });

  async function submit() {
    setPending(true);
    setError(null);
    const res = await createMandate(form);
    setPending(false);
    if (res.ok) { setOpen(false); router.refresh(); }
    else if ("error" in res) setError(res.error);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm">New mandate</Button>} />
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>New mandate</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="grid gap-1.5">
            <Label>Client company (must already exist)</Label>
            <Input value={form.companyName}
              onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label>Role title</Label>
            <Input value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label>Brief</Label>
            <Textarea rows={4} value={form.brief}
              onChange={(e) => setForm({ ...form, brief: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Seniority</Label>
              <Input placeholder="director" value={form.seniority}
                onChange={(e) => setForm({ ...form, seniority: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Location</Label>
              <Input value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Salary range</Label>
              <Input placeholder="£120-150k" value={form.salaryRange}
                onChange={(e) => setForm({ ...form, salaryRange: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Skills (comma-sep)</Label>
              <Input placeholder="ppa, origination" value={form.skills}
                onChange={(e) => setForm({ ...form, skills: e.target.value })} />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button disabled={pending} onClick={submit}>
            {pending ? "Creating…" : "Open mandate"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AddCandidacyDialog(props: {
  mandates: { id: string; title: string }[];
  people: { id: string; full_name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [personId, setPersonId] = useState("");
  const [mandateId, setMandateId] = useState("");

  async function submit() {
    setPending(true);
    setError(null);
    const res = await addCandidacy({ personId, mandateId });
    setPending(false);
    if (res.ok) { setOpen(false); router.refresh(); }
    else if ("error" in res) setError(res.error);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm">Add candidate to mandate</Button>} />
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add candidate to mandate</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="grid gap-1.5">
            <Label>Candidate</Label>
            <Select value={personId} onValueChange={(v) => v && setPersonId(v)}>
              <SelectTrigger><SelectValue placeholder="Pick a person" /></SelectTrigger>
              <SelectContent>
                {props.people.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Mandate</Label>
            <Select value={mandateId} onValueChange={(v) => v && setMandateId(v)}>
              <SelectTrigger><SelectValue placeholder="Pick a mandate" /></SelectTrigger>
              <SelectContent>
                {props.mandates.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button disabled={pending || !personId || !mandateId} onClick={submit}>
            {pending ? "Adding…" : "Add at identified"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

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
          {ALL_STAGES.map((s) => (
            <SelectItem key={s} value={s} className="capitalize text-xs">
              {s.replaceAll("_", " ")}
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
