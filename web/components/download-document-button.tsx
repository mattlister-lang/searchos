"use client";

import { useState } from "react";
import { getDocumentUrl } from "@/lib/actions";

/**
 * R4/F3 — one-click (re)download from the private documents bucket. Each
 * click mints a short-lived signed URL server-side (getDocumentUrl); the URL
 * carries content-disposition: attachment with the original filename, so
 * assigning location downloads in place without navigating away.
 */
export function DownloadDocumentButton(props: { documentId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setPending(true);
    setError(null);
    const res = await getDocumentUrl({ documentId: props.documentId });
    setPending(false);
    if (res.ok) window.location.assign(res.url);
    else setError(res.error);
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={pending}
        className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
      >
        {pending ? "Preparing…" : "Download"}
      </button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
