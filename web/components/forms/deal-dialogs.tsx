"use client";

import { useRouter } from "next/navigation";
import { createCompany, upsertDeal } from "@/lib/actions";
import { COMPANY_STATUSES, DEAL_STAGES } from "@/lib/domain";
import { useActionForm } from "@/lib/use-action-form";
import { Button } from "@/components/ui/button";
import { FormDialog, Field, SelectField, TextField } from "@/components/forms/form-dialog";
import { PersonPicker } from "@/components/forms/person-picker";
import { Textarea } from "@/components/ui/textarea";

export function NewCompanyDialog() {
  const router = useRouter();
  const f = useActionForm(
    createCompany,
    { name: "", domain: "", status: "prospect" },
    // Part B: a create lands on the thing created.
    { onSuccess: (res) => { if (res.id) router.push(`/companies/${res.id}`); } },
  );

  return (
    <FormDialog
      trigger={<Button variant="outline" size="sm">New company</Button>}
      title="New company"
      open={f.open} onOpenChange={f.onOpenChange}
      error={f.error} pending={f.pending}
      submitLabel="Create company" pendingLabel="Creating…"
      onSubmit={() => f.submit()}
      submitDisabled={f.form.name.trim().length < 2}
    >
      <TextField label="Name" value={f.form.name} onChange={f.setField("name")} />
      <TextField label="Email domain (optional — powers matching)" placeholder="acme.com"
        value={f.form.domain} onChange={f.setField("domain")} />
      <SelectField label="Status" value={f.form.status} onChange={f.set("status")}
        options={COMPANY_STATUSES} />
    </FormDialog>
  );
}

export function DealDialog(props: {
  deal?: {
    deal_id: string;
    name: string;
    stage: string;
    value: number | null;
    next_step: string | null;
    notes?: string | null;
    primary_contact_id?: string | null;
    primary_contact?: string | null;
  };
  /** Seed a NEW deal's company + name (e.g. from a company page or an Apollo
   *  job posting). Ignored when editing. The company must already exist —
   *  upsertDeal resolves it by name, so pass the exact company name. */
  prefill?: { companyName?: string; name?: string };
  /** Override the default trigger button (label/variant varies by context). */
  trigger?: React.ReactElement;
}) {
  const router = useRouter();
  const editing = !!props.deal;
  const f = useActionForm(
    upsertDeal,
    {
      companyName: props.prefill?.companyName ?? "",
      name: props.deal?.name ?? props.prefill?.name ?? "",
      stage: props.deal?.stage ?? "lead",
      value: props.deal?.value?.toString() ?? "",
      nextStep: props.deal?.next_step ?? "",
      notes: props.deal?.notes ?? "",
      primaryContactId: props.deal?.primary_contact_id ?? "",
    },
    // Part B: creates land on the new deal's page; edits stay put (refresh).
    { onSuccess: (res) => { if (!editing && res.id) router.push(`/deals/${res.id}`); } },
  );

  return (
    <FormDialog
      trigger={props.trigger ?? (editing
        ? <Button variant="ghost" size="sm">Edit</Button>
        : <Button size="sm">New deal</Button>)}
      title={editing ? `Edit — ${props.deal!.name}` : "New deal"}
      open={f.open} onOpenChange={f.onOpenChange}
      error={f.error} pending={f.pending}
      submitLabel={editing ? "Save" : "Create deal"}
      onSubmit={() => f.submit({ dealId: props.deal?.deal_id })}
    >
      {!editing && (
        <TextField label="Company (must already exist)" value={f.form.companyName}
          onChange={f.setField("companyName")} />
      )}
      <TextField label="Deal name" value={f.form.name} onChange={f.setField("name")} />
      <SelectField label="Stage" value={f.form.stage} onChange={f.set("stage")}
        options={DEAL_STAGES} />
      <TextField label="Value (£)" type="number" value={f.form.value}
        onChange={f.setField("value")} />
      <TextField label="Next step (required — pipelines die without one)"
        value={f.form.nextStep} onChange={f.setField("nextStep")} />
      {/* E-008: the deal's contact + notes are settable in the UI. Patch-only
          semantics server-side — a cleared picker doesn't null a saved contact. */}
      <Field label="Primary contact">
        <PersonPicker
          value={f.form.primaryContactId}
          onChange={f.set("primaryContactId")}
          initialLabel={props.deal?.primary_contact ?? undefined}
        />
      </Field>
      <Field label="Notes">
        <Textarea rows={3} value={f.form.notes} onChange={f.setField("notes")} />
      </Field>
    </FormDialog>
  );
}
