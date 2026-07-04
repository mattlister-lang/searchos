"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { appendCompanyNews, fetchCompanyNews } from "@/lib/actions";
import type { NewsArticle } from "@/lib/apollo";
import { fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * R5/F2 — recent company news from Apollo, on the company page. Explicit
 * "Fetch news" click only (ADR-025: metered credit, nothing on page load).
 * Results are display-only; the optional "Append to notes" writes a dated,
 * append-never-clobber digest into the company notes (confirmed by the click).
 */
export function CompanyNews({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [articles, setArticles] = useState<NewsArticle[] | null>(null);

  async function fetchNews() {
    setPending(true);
    setError(null);
    setSaved(false);
    const res = await fetchCompanyNews({ companyId });
    setPending(false);
    if (res.ok) setArticles(res.articles);
    else setError(res.error);
  }

  async function append() {
    if (!articles?.length) return;
    setSaving(true);
    setError(null);
    const res = await appendCompanyNews({ companyId, articles });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      router.refresh();
    } else {
      setError("error" in res ? res.error : "Save failed.");
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">News</CardTitle>
        <div className="flex items-center gap-2">
          {articles && articles.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => void append()} disabled={saving || saved}>
              {saved ? "Saved" : saving ? "Saving…" : "Append to notes"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => void fetchNews()} disabled={pending}>
            {pending ? "Fetching…" : articles ? "Refresh" : "Fetch news"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!articles && !error && (
          <p className="text-sm text-muted-foreground">
            Recent, well-sourced news from Apollo — one click, one credit.
          </p>
        )}
        {articles && articles.length === 0 && (
          <p className="text-sm text-muted-foreground">Apollo found no recent news.</p>
        )}
        {articles?.map((a, i) => {
          const outlet = a.source ?? a.publisher;
          const meta = [outlet, a.published_at ? fmtDate(a.published_at) : null]
            .filter(Boolean)
            .join(" · ");
          return (
            <div key={a.id ?? i} className="flex flex-col gap-0.5 border-b pb-2 last:border-b-0 last:pb-0">
              <span className="text-sm font-medium">
                {a.url ? (
                  <a href={a.url} target="_blank" rel="noreferrer" className="hover:underline">
                    {a.title}
                  </a>
                ) : (
                  a.title
                )}
              </span>
              {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
              {a.description && (
                <p className="text-sm text-muted-foreground">{a.description}</p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
