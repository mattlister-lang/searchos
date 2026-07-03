"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPerson, type ActionResult } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AddPersonDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [form, setForm] = useState({
    fullName: "", email: "", linkedinUrl: "", location: "", title: "", companyName: "",
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function submit(extra?: { forceCreate?: boolean; useExistingId?: string }) {
    setPending(true);
    const res = await createPerson({ ...form, ...extra });
    setPending(false);
    setResult(res);
    if (res.ok) {
      setOpen(false);
      setResult(null);
      setForm({ fullName: "", email: "", linkedinUrl: "", location: "", title: "", companyName: "" });
      router.push(`/people/${res.id}`);
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setResult(null); }}>
      <DialogTrigger render={<Button size="sm">Add person</Button>} />
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add person</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {(
            [
              ["fullName", "Full name *"], ["email", "Email"], ["linkedinUrl", "LinkedIn URL"],
              ["companyName", "Company"], ["title", "Job title"], ["location", "Location"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="grid gap-1.5">
              <Label htmlFor={key}>{label}</Label>
              <Input id={key} value={form[key]} onChange={set(key)} />
            </div>
          ))}

          {result && !result.ok && "error" in result && (
            <p className="text-sm text-destructive">{result.error}</p>
          )}

          {result && !result.ok && "matched" in result && (
            <div className="rounded-md border p-3 text-sm">
              <p>This person already exists (matched on {result.matched.matchedOn}).</p>
              <Button
                variant="outline" size="sm" className="mt-2"
                onClick={() => { setOpen(false); router.push(`/people/${result.matched.personId}`); }}
              >
                Open their record
              </Button>
            </div>
          )}

          {result && !result.ok && "ambiguous" in result && (
            <div className="rounded-md border p-3 text-sm">
              <p className="font-medium">Possible existing matches — pick one or create anyway:</p>
              <div className="mt-2 flex flex-col gap-1">
                {result.ambiguous.map((c) => (
                  <Button
                    key={c.personId} variant="outline" size="sm" disabled={pending}
                    onClick={() => submit({ useExistingId: c.personId })}
                  >
                    Use existing: {c.fullName} ({Math.round(c.similarity * 100)}%)
                  </Button>
                ))}
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => submit({ forceCreate: true })}>
                  None of these — create new
                </Button>
              </div>
            </div>
          )}

          {!(result && !result.ok && "ambiguous" in result) && (
            <Button disabled={pending || form.fullName.trim().length < 2} onClick={() => submit()}>
              {pending ? "Checking…" : "Add"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
