"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { applyCompanyEnrichment, fetchCompanyEnrichment } from "@/lib/actions";
import type { CompanyEnrichment } from "@/lib/apollo";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Apollo enrichment (UAT I2), human in the middle: an explicit "Fetch" click
 * spends the Apollo credit and shows a preview; nothing touches the record
 * until "Append to notes" confirms it. Two distinct actions (fetch/apply), so
 * this is a preview dialog rather than a form — the one form system
 * (useActionForm/FormDialog) stays for forms.
 */
export function EnrichCompanyDialog({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ enrichment: CompanyEnrichment; domain: string } | null>(null);

  function reset(next: boolean) {
    setOpen(next);
    if (!next) {
      setPending(false);
      setError(null);
      setPreview(null);
    }
  }

  async function fetchPreview() {
    setPending(true);
    setError(null);
    const res = await fetchCompanyEnrichment({ companyId });
    setPending(false);
    if (!res.ok) return setError(res.error);
    setPreview({ enrichment: res.enrichment, domain: res.domain });
  }

  async function apply() {
    if (!preview) return;
    setPending(true);
    setError(null);
    const res = await applyCompanyEnrichment({ companyId, enrichment: preview.enrichment });
    setPending(false);
    if (!res.ok) return setError("error" in res ? res.error : "Update failed.");
    reset(false);
    router.refresh();
  }

  const rows: [string, string | null | undefined][] = preview
    ? [
        ["Name", preview.enrichment.name],
        ["Industry", preview.enrichment.industry],
        ["Employees", preview.enrichment.estimated_num_employees?.toString()],
        ["Founded", preview.enrichment.founded_year?.toString()],
        ["HQ", [preview.enrichment.city, preview.enrichment.country].filter(Boolean).join(", ") || null],
        ["LinkedIn", preview.enrichment.linkedin_url],
        ["Keywords", preview.enrichment.keywords?.slice(0, 12).join(", ") || null],
        ["About", preview.enrichment.short_description],
      ]
    : [];

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger
        render={<Button variant="outline" size="sm">Enrich</Button>}
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Enrich from Apollo</DialogTitle>
          <DialogDescription>
            {preview
              ? `Data found for ${preview.domain} — appended to notes on confirm, nothing is overwritten.`
              : "Looks the company up by its domain. Each fetch uses one Apollo credit; nothing is saved until you confirm."}
          </DialogDescription>
        </DialogHeader>

        {preview && (
          <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto text-sm">
            {rows.filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <span className="w-24 shrink-0 text-muted-foreground">{k}</span>
                <span className="min-w-0 break-words">{v}</span>
              </div>
            ))}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="ghost" onClick={() => reset(false)} disabled={pending}>
            Cancel
          </Button>
          {preview ? (
            <Button onClick={apply} disabled={pending}>
              {pending ? "Saving…" : "Append to notes"}
            </Button>
          ) : (
            <Button onClick={fetchPreview} disabled={pending}>
              {pending ? "Fetching…" : "Fetch from Apollo"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
