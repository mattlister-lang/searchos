"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPerson, createPersonFromCv, parseCv, type ActionResult } from "@/lib/actions";
import type { ParsedCv } from "@/lib/cv";
import { partitionSectors, SENIORITY_LEVELS } from "@/lib/domain";
import { useActionForm } from "@/lib/use-action-form";
import { Button } from "@/components/ui/button";
import { FormDialog, Field, SelectField, TextField } from "@/components/forms/form-dialog";
import { TagInput } from "@/components/forms/tag-input";

const INITIAL = {
  fullName: "", email: "", linkedinUrl: "", location: "", title: "", companyName: "",
  seniority: "",
  functions: [] as string[],
  skills: [] as string[],
  sectors: [] as string[],
};

type CvState = {
  file: File;
  parsed: ParsedCv;
  aiLogId: string | null;
  warning?: string;
};

/**
 * Add person — plain entry, or CV-first (I1, ADR-024): drop/select a CV and
 * one Claude call pre-fills every field for HUMAN confirmation. Nothing is
 * created until the operator submits, and the submit runs the unchanged
 * createPerson resolution path (golden rule 2) — with the CV attached and the
 * standardised-CV JSON persisted server-side on confirm.
 */
export function AddPersonDialog() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [cv, setCv] = useState<CvState | null>(null);
  const [cvPending, setCvPending] = useState(false);
  const [cvError, setCvError] = useState<string | null>(null);

  // One form machine (engineering.md §3): the same useActionForm drives both
  // paths — the action just switches on whether a parsed CV is attached.
  // The File can't ride a plain-object server-action payload, so the CV path
  // wraps everything into FormData client-side.
  async function submitAction(input: unknown): Promise<ActionResult> {
    if (!cv) return createPerson(input);
    const fd = new FormData();
    fd.set("file", cv.file);
    fd.set(
      "payload",
      JSON.stringify({
        ...(input as Record<string, unknown>),
        parsedCv: cv.parsed,
        aiLogId: cv.aiLogId ?? "",
      }),
    );
    return createPersonFromCv(fd);
  }

  const f = useActionForm(submitAction, INITIAL, {
    onSuccess: (res) => {
      setCv(null);
      if (res.id) router.push(`/people/${res.id}`);
    },
  });
  const ambiguous = f.result && !f.result.ok && "ambiguous" in f.result ? f.result.ambiguous : null;
  const matched = f.result && !f.result.ok && "matched" in f.result ? f.result.matched : null;

  async function onCvFile(file: File | undefined) {
    if (!file || cvPending) return;
    setCvPending(true);
    setCvError(null);
    const fd = new FormData();
    fd.set("file", file);
    const res = await parseCv(fd);
    setCvPending(false);
    if (!res.ok) {
      setCvError(res.error);
      return;
    }
    const p = res.parsed;
    setCv({ file, parsed: p, aiLogId: res.aiLogId, warning: res.warning });
    // Pre-fill for confirmation. Non-taxonomy sectors aren't dropped — they
    // move into skills, exactly what the server will persist.
    const current = p.employment_history.find((e) => e.is_current) ?? p.employment_history[0];
    const { sectors, rest } = partitionSectors(p.sectors);
    f.set("fullName")(p.full_name);
    f.set("email")(p.emails[0] ?? "");
    f.set("linkedinUrl")(p.linkedin_url ?? "");
    f.set("location")(p.location ?? "");
    f.set("title")(current?.title ?? "");
    f.set("companyName")(current?.company ?? "");
    f.set("seniority")(p.seniority ?? "");
    f.set("functions")(p.functions.map((v) => v.trim().toLowerCase()).filter(Boolean));
    f.set("skills")([...p.skills.map((v) => v.trim().toLowerCase()).filter(Boolean), ...rest]);
    f.set("sectors")(sectors);
  }

  function onOpenChange(open: boolean) {
    f.onOpenChange(open);
    if (!open) {
      setCv(null);
      setCvError(null);
    }
  }

  return (
    <FormDialog
      trigger={<Button size="sm">Add person</Button>}
      title="Add person"
      open={f.open} onOpenChange={onOpenChange}
      error={f.error} pending={f.pending}
      submitLabel={cv ? "Add with CV" : "Add"} pendingLabel="Checking…"
      onSubmit={() => f.submit()}
      submitDisabled={f.form.fullName.trim().length < 2 || cvPending}
      hideSubmit={!!ambiguous}
    >
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void onCvFile(e.dataTransfer.files?.[0]);
        }}
        className="rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground"
      >
        {cvPending ? (
          "Parsing CV…"
        ) : cv ? (
          <>
            CV parsed:{" "}
            <span className="font-medium text-foreground">{cv.file.name}</span> — review
            below; nothing is saved until you confirm.
          </>
        ) : (
          <>
            Drop a CV here or{" "}
            <button type="button" className="underline hover:text-foreground"
              onClick={() => fileInput.current?.click()}>
              browse
            </button>{" "}
            to pre-fill (PDF/DOCX)
          </>
        )}
        <input
          ref={fileInput} type="file" hidden accept=".pdf,.docx,.txt"
          onChange={(e) => {
            void onCvFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      {cvError && <p className="text-xs text-destructive">{cvError}</p>}
      {cv?.warning && <p className="text-xs text-amber-600 dark:text-amber-500">{cv.warning}</p>}

      <TextField label="Full name *" value={f.form.fullName} onChange={f.setField("fullName")} />
      <TextField label="Email" type="email" value={f.form.email} onChange={f.setField("email")} />
      <TextField label="LinkedIn URL" value={f.form.linkedinUrl} onChange={f.setField("linkedinUrl")} />
      <TextField label="Company" value={f.form.companyName} onChange={f.setField("companyName")} />
      <TextField label="Job title" value={f.form.title} onChange={f.setField("title")} />
      <TextField label="Location" value={f.form.location} onChange={f.setField("location")} />

      {cv && (
        <>
          <SelectField label="Seniority" value={f.form.seniority} onChange={f.set("seniority")}
            options={SENIORITY_LEVELS} placeholder="Pick a level" />
          <Field label="Functions">
            <TagInput field="functions" value={f.form.functions} onChange={f.set("functions")} />
          </Field>
          <Field label="Skills">
            <TagInput field="skills" value={f.form.skills} onChange={f.set("skills")} />
          </Field>
          <Field label="Sectors">
            <TagInput field="sectors" value={f.form.sectors} onChange={f.set("sectors")} />
          </Field>
          {cv.parsed.summary && (
            <p className="text-xs text-muted-foreground">{cv.parsed.summary}</p>
          )}
          {cv.parsed.employment_history.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {cv.parsed.employment_history.length} role
              {cv.parsed.employment_history.length > 1 ? "s" : ""} captured — the full history
              renders as the standardised CV on the person page.
            </p>
          )}
        </>
      )}

      {matched && (
        <div className="rounded-md border p-3 text-sm">
          <p>This person already exists (matched on {matched.matchedOn}).</p>
          <Button variant="outline" size="sm" className="mt-2"
            onClick={() => { onOpenChange(false); router.push(`/people/${matched.personId}`); }}>
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
