import { Badge } from "@/components/ui/badge";
import { label } from "@/lib/domain";
import { fmtDate } from "@/lib/format";

/**
 * The one activity row (E-005: nothing captured is write-only). Renders the
 * type badge + subject + date; when a note exists — body_raw, the manually
 * typed note, falling back to summary — the row expands inline to read it.
 * Plain <details>, no client JS; server-safe, shared by the person, company,
 * job and deal pages so the fallback rule has exactly one definition.
 */
export function ActivityItem(props: {
  type: string;
  subject: string | null;
  bodyRaw: string | null;
  summary: string | null;
  occurredAt: string | null;
}) {
  const note = props.bodyRaw ?? props.summary;
  const row = (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="min-w-0">
        <Badge variant="outline" className="mr-2 capitalize">{label(props.type)}</Badge>
        {props.subject ?? props.summary ?? "—"}
      </span>
      <span className="flex shrink-0 items-baseline gap-2 text-xs text-muted-foreground">
        {note && (
          <span className="transition-transform group-open:rotate-90" aria-hidden>
            ▸
          </span>
        )}
        <span>{fmtDate(props.occurredAt)}</span>
      </span>
    </div>
  );

  if (!note) return row;

  return (
    <details className="group">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        {row}
      </summary>
      <p className="mt-1 whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-sm text-muted-foreground">
        {note}
      </p>
    </details>
  );
}
