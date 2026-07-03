"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCompany, upsertDeal } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const STAGES = ["lead", "qualified", "proposal", "negotiation", "won", "lost"] as const;
const COMPANY_STATUSES = ["prospect", "client", "target", "source"] as const;

export function NewCompanyDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", domain: "", status: "prospect" });

  async function submit() {
    setPending(true);
    setError(null);
    const res = await createCompany(form);
    setPending(false);
    if (res.ok) { setOpen(false); setForm({ name: "", domain: "", status: "prospect" }); router.refresh(); }
    else if ("error" in res) setError(res.error);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm">New company</Button>} />
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>New company</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="coName">Name</Label>
            <Input id="coName" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="coDomain">Email domain (optional — powers matching)</Label>
            <Input id="coDomain" placeholder="acme.com" value={form.domain}
              onChange={(e) => setForm({ ...form, domain: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => v && setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {COMPANY_STATUSES.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button disabled={pending || form.name.trim().length < 2} onClick={submit}>
            {pending ? "Creating…" : "Create company"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DealDialog(props: {
  deal?: {
    deal_id: string;
    name: string;
    stage: string;
    value: number | null;
    next_step: string | null;
  };
}) {
  const router = useRouter();
  const editing = !!props.deal;
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    companyName: "",
    name: props.deal?.name ?? "",
    stage: props.deal?.stage ?? "lead",
    value: props.deal?.value?.toString() ?? "",
    nextStep: props.deal?.next_step ?? "",
  });

  async function submit() {
    setPending(true);
    setError(null);
    const res = await upsertDeal({
      dealId: props.deal?.deal_id,
      companyName: form.companyName,
      name: form.name,
      stage: form.stage,
      value: form.value,
      nextStep: form.nextStep,
    });
    setPending(false);
    if (res.ok) {
      setOpen(false);
      router.refresh();
    } else if ("error" in res) {
      setError(res.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          editing
            ? <Button variant="ghost" size="sm">Edit</Button>
            : <Button size="sm">New deal</Button>
        }
      />
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit — ${props.deal!.name}` : "New deal"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {!editing && (
            <div className="grid gap-1.5">
              <Label htmlFor="companyName">Company (must already exist)</Label>
              <Input id="companyName" value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="dealName">Deal name</Label>
            <Input id="dealName" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label>Stage</Label>
            <Select value={form.stage} onValueChange={(v) => v && setForm({ ...form, stage: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STAGES.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="value">Value (£)</Label>
            <Input id="value" type="number" value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="nextStep">Next step (required — pipelines die without one)</Label>
            <Input id="nextStep" value={form.nextStep}
              onChange={(e) => setForm({ ...form, nextStep: e.target.value })} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button disabled={pending} onClick={submit}>
            {pending ? "Saving…" : editing ? "Save" : "Create deal"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
