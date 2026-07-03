"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createInvoice, markInvoicePaid } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CreateInvoiceDialog(props: {
  candidacyId: string;
  label: string;
  defaultAmount?: number | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    amount: props.defaultAmount?.toString() ?? "",
    terms: "",
    issuedAt: new Date().toISOString().slice(0, 10),
    dueDate: "",
  });

  async function submit() {
    setPending(true);
    setError(null);
    const res = await createInvoice({ candidacyId: props.candidacyId, ...form });
    setPending(false);
    if (res.ok) { setOpen(false); router.refresh(); }
    else if ("error" in res) setError(res.error);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm">Invoice</Button>} />
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Invoice — {props.label}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="grid gap-1.5">
            <Label>Amount (£)</Label>
            <Input type="number" value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Issued</Label>
              <Input type="date" value={form.issuedAt}
                onChange={(e) => setForm({ ...form, issuedAt: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Due</Label>
              <Input type="date" value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Terms</Label>
            <Input placeholder="e.g. 14 days from start date" value={form.terms}
              onChange={(e) => setForm({ ...form, terms: e.target.value })} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button disabled={pending || !form.amount} onClick={submit}>
            {pending ? "Creating…" : "Create invoice"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function MarkPaidButton(props: { invoiceId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button variant="outline" size="sm" disabled={pending}
      onClick={async () => {
        setPending(true);
        const res = await markInvoicePaid({ invoiceId: props.invoiceId });
        setPending(false);
        if (res.ok) router.refresh();
      }}>
      {pending ? "…" : "Mark paid"}
    </Button>
  );
}
