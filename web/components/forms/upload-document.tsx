"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadDocument } from "@/lib/actions";
import { Button } from "@/components/ui/button";

/**
 * The one hidden-file-input upload control (engineering.md §3 — was UploadCv;
 * R4/F3 generalised it when the JD upload became its second use). Target is a
 * person (CVs) or a mandate (JD/spec); the uploadDocument action routes the
 * file to the right Storage prefix and document row.
 */
export function UploadDocument(props: {
  target: { personId: string } | { mandateId: string };
  kind: "cv" | "spec" | "terms" | "other";
  label: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    if ("personId" in props.target) fd.set("personId", props.target.personId);
    else fd.set("mandateId", props.target.mandateId);
    fd.set("kind", props.kind);
    const res = await uploadDocument(fd);
    setPending(false);
    if (res.ok) router.refresh();
    else if ("error" in res) setError(res.error);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <span className="inline-flex items-center gap-2">
      <input ref={inputRef} type="file" accept=".pdf,.doc,.docx,.txt" hidden onChange={onChange} />
      <Button variant="outline" size="sm" disabled={pending}
        onClick={() => inputRef.current?.click()}>
        {pending ? "Uploading…" : props.label}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
