"use client";

import { useState } from "react";
import Link from "next/link";
import { fetchCompanyOpenings } from "@/lib/actions";
import type { JobPosting } from "@/lib/apollo";
import { booleanQueryFromTitle } from "@/lib/domain";
import { fmtDate } from "@/lib/format";
import { DealDialog } from "@/components/forms/deal-dialogs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * R5/F1 — live job postings from Apollo, on the company page. Explicit "Check
 * openings" click only (ADR-025: metered credit, nothing on page load).
 * Postings are display-only, never persisted. Per posting: "Find matches"
 * links to the people search with a Boolean query built from the title, and
 * "Create deal" reuses DealDialog prefilled with this company + the role title.
 */
export function CompanyOpenings({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [postings, setPostings] = useState<JobPosting[] | null>(null);

  async function check() {
    setPending(true);
    setError(null);
    const res = await fetchCompanyOpenings({ companyId });
    setPending(false);
    if (res.ok) setPostings(res.postings);
    else setError(res.error);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Openings</CardTitle>
        <Button variant="outline" size="sm" onClick={() => void check()} disabled={pending}>
          {pending ? "Checking…" : postings ? "Re-check" : "Check openings"}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!postings && !error && (
          <p className="text-sm text-muted-foreground">
            Live roles from Apollo — one click, one credit. Nothing is stored.
          </p>
        )}
        {postings && postings.length === 0 && (
          <p className="text-sm text-muted-foreground">Apollo lists no current openings.</p>
        )}
        {postings?.map((p, i) => {
          const location = [p.city, p.state, p.country].filter(Boolean).join(", ");
          const posted = p.posted_at ?? p.last_seen_at;
          const query = booleanQueryFromTitle(p.title ?? "");
          return (
            <div
              key={p.id ?? i}
              className="flex flex-col gap-1 border-b pb-2 last:border-b-0 last:pb-0"
            >
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">
                  {p.url ? (
                    <a href={p.url} target="_blank" rel="noreferrer" className="hover:underline">
                      {p.title}
                    </a>
                  ) : (
                    p.title
                  )}
                </span>
                {posted && (
                  <span className="shrink-0 text-xs text-muted-foreground">{fmtDate(posted)}</span>
                )}
              </div>
              {location && <span className="text-xs text-muted-foreground">{location}</span>}
              <div className="mt-0.5 flex items-center gap-3">
                <Link
                  href={`/people?q=${encodeURIComponent(query)}`}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Find matches
                </Link>
                <DealDialog
                  prefill={{ companyName, name: p.title ?? "" }}
                  trigger={
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0 text-xs font-medium text-primary hover:bg-transparent hover:underline"
                    >
                      Create deal
                    </Button>
                  }
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
