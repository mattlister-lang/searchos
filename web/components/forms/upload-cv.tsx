"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadDocument } from "@/lib/actions";
import { Button } from "@/components/ui/button";

export function UploadCv(props: { personId: string }) {
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
    fd.set("personId", props.personId);
    fd.set("kind", "cv");
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
        {pending ? "Uploading…" : "Upload CV"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
