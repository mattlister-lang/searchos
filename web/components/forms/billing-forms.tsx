"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createInvoice, markInvoicePaid } from "@/lib/actions";
import { useActionForm } from "@/lib/use-action-form";
import { Button } from "@/components/ui/button";
import { FormDialog, TextField } from "@/components/forms/form-dialog";

export function CreateInvoiceDialog(props: {
  candidacyId: string;
  label: string;
  defaultAmount?: number | null;
}) {
  const f = useActionForm(createInvoice, {
    amount: props.defaultAmount?.toString() ?? "",
    terms: "",
    issuedAt: new Date().toISOString().slice(0, 10),
    dueDate: "",
  });

  return (
    <FormDialog
      trigger={<Button variant="outline" size="sm">Invoice</Button>}
      title={`Invoice — ${props.label}`}
      open={f.open} onOpenChange={f.onOpenChange}
      error={f.error} pending={f.pending}
      submitLabel="Create invoice" pendingLabel="Creating…"
      onSubmit={() => f.submit({ candidacyId: props.candidacyId })}
      submitDisabled={!f.form.amount}
    >
      <TextField label="Amount (£)" type="number" value={f.form.amount}
        onChange={f.setField("amount")} />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Issued" type="date" value={f.form.issuedAt}
          onChange={f.setField("issuedAt")} />
        <TextField label="Due" type="date" value={f.form.dueDate}
          onChange={f.setField("dueDate")} />
      </div>
      <TextField label="Terms" placeholder="e.g. 14 days from start date"
        value={f.form.terms} onChange={f.setField("terms")} />
    </FormDialog>
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
