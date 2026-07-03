import type { ParsedCv } from "@/lib/cv";
import { label } from "@/lib/domain";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * The standardised CV (I1, ADR-024): one uniform layout regardless of the
 * source document's formatting, rendered from document.parsed_cv. Company
 * names here come from extracted text — no entity ids exist, so they render
 * as plain text (a link without a real id would be an invented join).
 */
export function StandardisedCv(props: { cv: ParsedCv; filename: string | null }) {
  const { cv } = props;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Standardised CV</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {cv.summary && <p className="text-sm text-muted-foreground">{cv.summary}</p>}

        {(cv.seniority || cv.sectors.length > 0 || cv.functions.length > 0 || cv.skills.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {cv.seniority && <Badge className="capitalize">{label(cv.seniority)}</Badge>}
            {cv.sectors.map((s) => (
              <Badge key={`sec-${s}`} variant="secondary">{s}</Badge>
            ))}
            {cv.functions.map((s) => (
              <Badge key={`fn-${s}`} variant="secondary" className="capitalize">{s}</Badge>
            ))}
            {cv.skills.map((s) => (
              <Badge key={`sk-${s}`} variant="outline">{s}</Badge>
            ))}
          </div>
        )}

        {cv.employment_history.length > 0 && (
          <div className="flex flex-col gap-2">
            {cv.employment_history.map((e, i) => (
              <div key={i} className="flex items-baseline justify-between gap-3 text-sm">
                <span>
                  <span className="font-medium">{e.title}</span>{" "}
                  <span className="text-muted-foreground">at {e.company}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground tabular-nums">
                  {(e.start_date || e.end_date) && (
                    <span>
                      {e.start_date ?? "?"} – {e.is_current ? "present" : (e.end_date ?? "?")}
                    </span>
                  )}
                  {e.is_current && <Badge>current</Badge>}
                </span>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Extracted by Claude from {props.filename ?? "the attached CV"} — the original file
          stays attached under Documents.
        </p>
      </CardContent>
    </Card>
  );
}
