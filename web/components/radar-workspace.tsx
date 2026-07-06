"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  analyseJdFile,
  analyseJdText,
  matchSpecInternal,
  searchApolloCandidates,
  type CandidateSearchResult,
  type SpecMatch,
  type SpecMatchResult,
} from "@/lib/actions";
import type { ApolloPerson } from "@/lib/apollo";
import type { ParsedJd } from "@/lib/jd";
import { booleanQueryFromSpec, clampTags, label } from "@/lib/domain";
import { AddPersonDialog } from "@/components/forms/add-person-dialog";
import { NewMandateDialog } from "@/components/forms/pipeline-forms";
import { SpecDealDialog } from "@/components/forms/spec-deal-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

/**
 * R6 — the Radar page (product brief §12): value-first BD. Paste or drop a job
 * advert → one Claude call (purpose "jd_parse", ADR-024) → a standardised spec
 * → the spec immediately searches OUR pool (search_people_boolean) → act:
 * Create job (prefilled brief), Log BD deal (spec-in), or Search Apollo for
 * candidates when the pool is thin. The whole page is STATELESS — nothing
 * persists until Matt takes a confirm-gated action; every write is an existing
 * path. Sourcing stays human (the system finds, Matt calls).
 */
export function RadarWorkspace() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [spec, setSpec] = useState<ParsedJd | null>(null);
  // The file the CURRENT spec was analysed from (null for pasted text) — the
  // Create-job flow attaches it to the new mandate on the same confirm (E-B1).
  // Snapshot at analyse-time, not `file` itself: dropping a new file without
  // re-analysing must not attach a file the spec never saw.
  const [analysedFile, setAnalysedFile] = useState<File | null>(null);
  // Bumped on every successful analysis so the action dialogs (whose prefill
  // seeds their form state once, on mount) remount and re-seed for a new spec.
  const [analysisId, setAnalysisId] = useState(0);

  const [match, setMatch] = useState<SpecMatchResult | null>(null);
  const [matchPending, setMatchPending] = useState(false);

  const [apollo, setApollo] = useState<CandidateSearchResult | null>(null);
  const [apolloPending, setApolloPending] = useState(false);

  async function runMatch(s: ParsedJd) {
    setMatchPending(true);
    setMatch(null);
    const res = await matchSpecInternal({ title: s.title, skills: clampTags(s.skills) });
    setMatchPending(false);
    setMatch(res);
  }

  async function analyse() {
    if (pending) return;
    setPending(true);
    setError(null);
    setWarning(null);
    setApollo(null);

    const res = file
      ? await analyseJdFile(buildFileForm(file))
      : await analyseJdText({ text });
    setPending(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSpec(res.parsed);
    setAnalysedFile(file);
    setWarning(res.warning ?? null);
    setAnalysisId((n) => n + 1);
    void runMatch(res.parsed);
  }

  async function runApollo(s: ParsedJd) {
    setApolloPending(true);
    setApollo(null);
    const res = await searchApolloCandidates({
      title: s.title,
      location: s.location ?? undefined,
      keywords: clampTags(s.skills).join(" ").slice(0, 500) || undefined,
    });
    setApolloPending(false);
    setApollo(res);
  }

  function chooseFile(f: File | undefined) {
    if (!f) return;
    setFile(f);
    setError(null);
  }

  const canAnalyse = !pending && (file != null || text.trim().length >= 20);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Radar</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Paste or drop any job advert. Claude standardises it into a spec, then
          searches your pool for matches — so you can spec a candidate in, not
          ask for anything. Nothing is saved until you act.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Job advert in</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              chooseFile(e.dataTransfer.files?.[0]);
            }}
            className="rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground"
          >
            {file ? (
              <>
                File attached:{" "}
                <span className="font-medium text-foreground">{file.name}</span> —
                Analyse will read it.{" "}
                <button type="button" className="underline hover:text-foreground"
                  onClick={() => { setFile(null); if (fileInput.current) fileInput.current.value = ""; }}>
                  use pasted text instead
                </button>
              </>
            ) : (
              <>
                Drop a job-advert file here or{" "}
                <button type="button" className="underline hover:text-foreground"
                  onClick={() => fileInput.current?.click()}>
                  browse
                </button>{" "}
                (PDF/DOCX/TXT) — or paste below.
              </>
            )}
            <input
              ref={fileInput} type="file" hidden accept=".pdf,.docx,.txt,.md"
              onChange={(e) => { chooseFile(e.target.files?.[0]); }}
            />
          </div>

          <Textarea
            rows={8}
            placeholder="Paste the job advert / job description here…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={file != null}
          />

          {error && <p className="text-sm text-destructive">{error}</p>}
          {warning && <p className="text-sm text-amber-600 dark:text-amber-500">{warning}</p>}

          <div>
            <Button onClick={() => void analyse()} disabled={!canAnalyse}>
              {pending ? "Analysing…" : "Analyse"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {spec && (
        <>
          <SpecCard key={`spec-${analysisId}`} spec={spec} jdFile={analysedFile} />
          <MatchesCard
            key={`match-${analysisId}`}
            spec={spec}
            match={match}
            pending={matchPending}
          />
          <ApolloCard
            key={`apollo-${analysisId}`}
            spec={spec}
            result={apollo}
            pending={apolloPending}
            onSearch={() => void runApollo(spec)}
          />
        </>
      )}
    </div>
  );
}

// FormData can carry a File across the server-action boundary; a plain object
// can't (L-023). Small wrapper so analyse() stays readable.
function buildFileForm(file: File): FormData {
  const fd = new FormData();
  fd.set("file", file);
  return fd;
}

/** Compose a job brief from the spec — summary, requirements and package folded
 *  into one text field the New-job dialog accepts; Matt structures the rest via
 *  Edit brief on the job page. */
function composeBrief(spec: ParsedJd): string {
  const parts: string[] = [];
  if (spec.summary) parts.push(spec.summary);
  if (spec.requirements.length) {
    parts.push("Requirements:\n" + spec.requirements.slice(0, 8).map((r) => `• ${r}`).join("\n"));
  }
  const pkg = [
    spec.team && `Team: ${spec.team}`,
    spec.bonus && `Bonus: ${spec.bonus}`,
    spec.car_allowance && `Car allowance: ${spec.car_allowance}`,
    spec.pension && `Pension: ${spec.pension}`,
    spec.notice_period && `Notice period: ${spec.notice_period}`,
  ].filter(Boolean) as string[];
  if (pkg.length) parts.push("Package:\n" + pkg.map((l) => `• ${l}`).join("\n"));
  return parts.join("\n\n").slice(0, 10000);
}

/** The standardised spec — chips + fields, mirroring the person page's
 *  standardised CV. Company names come from extracted text (no entity id
 *  exists), so they render as plain text; an anonymised advert says so.
 *  `jdFile` is the analysed file (null for pasted text): Create job attaches
 *  it to the new mandate on the same confirm (E-B1). */
function SpecCard({ spec, jdFile }: { spec: ParsedJd; jdFile: File | null }) {
  const fields: [string, string | null][] = [
    ["Location", spec.location],
    ["Salary", spec.salary_range],
    ["Bonus", spec.bonus],
    ["Car allowance", spec.car_allowance],
    ["Pension", spec.pension],
    ["Notice", spec.notice_period],
    ["Team", spec.team],
  ];
  const shown = fields.filter(([, v]) => v);
  const skills = clampTags(spec.skills);
  const brief = composeBrief(spec);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">{spec.title || "Untitled role"}</CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {spec.company_name ?? "Company not named (anonymised advert)"}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <NewMandateDialog
            prefill={{
              companyName: spec.company_name ?? "",
              title: spec.title,
              brief,
              seniority: spec.seniority ?? "",
              location: spec.location ?? "",
              salaryRange: spec.salary_range ?? "",
              skills,
            }}
            jdFile={jdFile}
            trigger={<Button size="sm">Create job</Button>}
          />
          <SpecDealDialog
            companyName={spec.company_name ?? ""}
            title={spec.title}
            summary={spec.summary}
            trigger={<Button variant="outline" size="sm">Log BD deal</Button>}
          />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {spec.summary && <p className="text-sm text-muted-foreground">{spec.summary}</p>}

        {(spec.seniority || spec.sectors.length > 0 || spec.functions.length > 0 || skills.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {spec.seniority && <Badge className="capitalize">{label(spec.seniority)}</Badge>}
            {spec.sectors.map((s) => (
              <Badge key={`sec-${s}`} variant="secondary">{s}</Badge>
            ))}
            {spec.functions.map((s) => (
              <Badge key={`fn-${s}`} variant="secondary" className="capitalize">{s}</Badge>
            ))}
            {skills.map((s) => (
              <Badge key={`sk-${s}`} variant="outline">{s}</Badge>
            ))}
          </div>
        )}

        {shown.length > 0 && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
            {shown.map(([k, v]) => (
              <div key={k} className="flex flex-col">
                <span className="text-xs text-muted-foreground">{k}</span>
                <span className="break-words">{v}</span>
              </div>
            ))}
          </div>
        )}

        {spec.requirements.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground">Requirements</p>
            <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-5 text-sm">
              {spec.requirements.slice(0, 8).map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Internal pool matches — ranked people from search_people_boolean, each
 *  linking to their record. A thin pool (< 3) prominently offers Apollo. */
function MatchesCard({
  spec,
  match,
  pending,
}: {
  spec: ParsedJd;
  match: SpecMatchResult | null;
  pending: boolean;
}) {
  const query = booleanQueryFromSpec({ title: spec.title, skills: clampTags(spec.skills) });
  const people: SpecMatch[] = match?.ok ? match.people : [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">
          Matches in your pool{match?.ok ? ` (${people.length})` : ""}
        </CardTitle>
        <Link
          href={`/people?q=${encodeURIComponent(query)}`}
          className="text-xs font-medium text-primary hover:underline"
        >
          Open in People search
        </Link>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {pending && <p className="text-sm text-muted-foreground">Searching your pool…</p>}
        {match && !match.ok && <p className="text-sm text-destructive">{match.error}</p>}

        {match?.ok && people.length === 0 && !pending && (
          <p className="text-sm text-muted-foreground">
            No one in your pool matches this spec yet — search Apollo below to source candidates.
          </p>
        )}

        {people.map((p) => (
          <div
            key={p.id}
            className="flex items-baseline justify-between gap-3 border-b pb-2 text-sm last:border-b-0 last:pb-0"
          >
            <span className="min-w-0">
              <Link href={`/people/${p.id}`} className="font-medium hover:underline">
                {p.fullName}
              </Link>
              {p.currentRole && (
                <span className="text-muted-foreground"> · {p.currentRole}</span>
              )}
            </span>
            <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
              {p.seniority && (
                <Badge variant="secondary" className="capitalize">{label(p.seniority)}</Badge>
              )}
              {p.sectors.slice(0, 3).map((s) => (
                <Badge key={s} variant="outline">{s}</Badge>
              ))}
            </span>
          </div>
        ))}

        {match?.ok && people.length > 0 && people.length < 3 && (
          <p className="mt-1 text-sm text-muted-foreground">
            Only {people.length} pool match{people.length === 1 ? "" : "es"} — search Apollo below
            to widen the net.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Apollo candidate search — offered prominently when the pool is thin,
 *  available always. Display-only; each row's "Add person" opens the normal
 *  resolution flow (prefilled), so nothing auto-creates (ADR-025). */
function ApolloCard({
  spec,
  result,
  pending,
  onSearch,
}: {
  spec: ParsedJd;
  result: CandidateSearchResult | null;
  pending: boolean;
  onSearch: () => void;
}) {
  const people: ApolloPerson[] = result?.ok ? result.people : [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Search Apollo for candidates</CardTitle>
        <Button variant="outline" size="sm" onClick={onSearch} disabled={pending}>
          {pending ? "Searching…" : result ? "Re-search" : "Search Apollo"}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {!result && !pending && (
          <p className="text-sm text-muted-foreground">
            Search Apollo&apos;s index by the spec&apos;s title, location and skills — one click,
            one credit. Results are display-only; adding anyone runs the normal resolution flow.
          </p>
        )}
        {result && !result.ok && <p className="text-sm text-destructive">{result.error}</p>}
        {result?.ok && people.length === 0 && (
          <p className="text-sm text-muted-foreground">Apollo returned no matching people.</p>
        )}

        {people.map((p, i) => {
          const meta = [p.title, p.organizationName, p.location].filter(Boolean).join(" · ");
          return (
            <div
              key={i}
              className="flex items-baseline justify-between gap-3 border-b pb-2 text-sm last:border-b-0 last:pb-0"
            >
              <span className="min-w-0">
                <span className="font-medium">{p.name}</span>
                {meta && <span className="text-muted-foreground"> · {meta}</span>}
                {p.linkedinUrl && (
                  <>
                    {" · "}
                    <a
                      href={p.linkedinUrl.startsWith("http") ? p.linkedinUrl : `https://${p.linkedinUrl}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline"
                    >
                      LinkedIn
                    </a>
                  </>
                )}
              </span>
              <span className="shrink-0">
                <AddPersonDialog
                  prefill={{
                    fullName: p.name,
                    companyName: p.organizationName ?? "",
                    title: p.title ?? spec.title,
                  }}
                  trigger={<Button variant="ghost" size="sm">Add person</Button>}
                />
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
