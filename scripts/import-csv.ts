/**
 * Candidate pool CSV import (~120 records, CLAUDE.md Phase 0 checklist).
 * Accepts LinkedIn connection exports and similar spreadsheets.
 *
 * Every row runs the full ADR-006 resolution chain and the suppression check
 * before anything is created. Rows without an email need a LinkedIn URL or a
 * confident name+company match; otherwise they are reported for review —
 * never blind-created (CLAUDE.md pipeline rules). Generic mailboxes never
 * become person emails.
 *
 * Dry-run by default; nothing is written without --commit.
 *
 * Usage: npm run import-csv -- <file.csv> [--commit] [--report <out.csv>]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import postgres from 'postgres';
import { loadEnv, requireEnv } from './lib/env.ts';
import {
  isGenericMailbox,
  isSuppressed,
  normaliseLinkedinUrl,
  resolveCompany,
  resolvePerson,
} from './lib/resolve.ts';

type Row = {
  fullName: string;
  email: string | null;
  linkedinUrl: string | null;
  company: string | null;
  title: string | null;
};

type Disposition =
  | 'linked' // resolved to an existing person
  | 'created' // new person (or would-create in dry-run)
  | 'suppressed' // erased person — never resurrected (ADR-008)
  | 'review' // ambiguous or insufficient identifiers — human decides
  | 'skipped'; // empty/unusable row

type Report = { row: number; name: string; disposition: Disposition; detail: string };

// --- CLI -------------------------------------------------------------------

const args = process.argv.slice(2);
const commit = args.includes('--commit');
const reportIdx = args.indexOf('--report');
const reportPath = reportIdx >= 0 ? args[reportIdx + 1] : 'import-report.csv';
const file = args.find((a) => !a.startsWith('--') && a !== reportPath);
if (!file) {
  console.error('Usage: npm run import-csv -- <file.csv> [--commit] [--report <out.csv>]');
  process.exit(1);
}

// --- Header mapping ---------------------------------------------------------

const HEADER_ALIASES: Record<keyof Row, string[]> = {
  fullName: ['name', 'full name'],
  email: ['email', 'email address', 'e-mail'],
  linkedinUrl: ['url', 'profile url', 'linkedin', 'linkedin url', 'profile'],
  company: ['company', 'company name', 'organisation', 'organization', 'employer'],
  title: ['position', 'title', 'job title', 'role'],
};

function mapRow(raw: Record<string, string>): Row {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) lower[k.trim().toLowerCase()] = v?.trim() ?? '';

  const pick = (field: keyof Row): string | null => {
    for (const alias of HEADER_ALIASES[field]) if (lower[alias]) return lower[alias];
    return null;
  };

  let fullName = pick('fullName') ?? '';
  if (!fullName) {
    const first = lower['first name'] ?? '';
    const last = lower['last name'] ?? '';
    fullName = `${first} ${last}`.trim();
  }
  return {
    fullName,
    email: pick('email'),
    linkedinUrl: pick('linkedinUrl'),
    company: pick('company'),
    title: pick('title'),
  };
}

// --- Import -----------------------------------------------------------------

loadEnv();
const sql = postgres(requireEnv('SUPABASE_DB_URL'), { prepare: false });

const rawRows: Record<string, string>[] = parse(readFileSync(file, 'utf8'), {
  columns: true,
  skip_empty_lines: true,
  bom: true,
  trim: true,
});

const report: Report[] = [];
// Dry-run doesn't write, so duplicates inside the file must be tracked
// in memory to report accurately.
const seenEmails = new Set<string>();
const seenLinkedin = new Set<string>();

async function getOrCreateCompany(name: string): Promise<string | null> {
  const existing = await resolveCompany(sql, { name });
  if (existing) return existing;
  if (!commit) return null; // dry-run: company would be created
  const [row] = await sql`
    insert into company (name, status, sectors)
    values (${name}, 'source', '{}')
    returning id`;
  return row.id;
}

async function importRow(row: Row, n: number): Promise<void> {
  if (!row.fullName) {
    report.push({ row: n, name: '', disposition: 'skipped', detail: 'no name on row' });
    return;
  }

  let email = row.email;
  let detailNotes: string[] = [];
  if (email && isGenericMailbox(email)) {
    detailNotes.push(`generic mailbox ${email} dropped — never becomes a person email`);
    email = null;
  }
  const linkedin = row.linkedinUrl ? normaliseLinkedinUrl(row.linkedinUrl) : null;

  if (email && (await isSuppressed(sql, email))) {
    report.push({ row: n, name: row.fullName, disposition: 'suppressed', detail: 'email hash on suppression_list' });
    return;
  }

  // In-file duplicate tracking (matters in dry-run where nothing persists).
  if (email && seenEmails.has(email.toLowerCase())) {
    report.push({ row: n, name: row.fullName, disposition: 'linked', detail: 'duplicate of earlier row in this file (email)' });
    return;
  }
  if (linkedin && seenLinkedin.has(linkedin)) {
    report.push({ row: n, name: row.fullName, disposition: 'linked', detail: 'duplicate of earlier row in this file (linkedin)' });
    return;
  }
  if (email) seenEmails.add(email.toLowerCase());
  if (linkedin) seenLinkedin.add(linkedin);

  const companyId = row.company ? await resolveCompany(sql, { name: row.company }) : null;
  const resolution = await resolvePerson(sql, {
    email,
    linkedinUrl: linkedin,
    name: row.fullName,
    companyId,
  });

  if (resolution.kind === 'suppressed') {
    report.push({ row: n, name: row.fullName, disposition: 'suppressed', detail: 'email hash on suppression_list' });
    return;
  }

  if (resolution.kind === 'matched') {
    if (commit) {
      // Modest enrichment of the existing record — add identifiers it lacks.
      if (email) {
        await sql`
          insert into person_email (person_id, email)
          values (${resolution.personId}, ${email})
          on conflict (email) do nothing`;
      }
      if (linkedin) {
        await sql`
          update person set linkedin_url = ${linkedin}
          where id = ${resolution.personId} and linkedin_url is null`;
      }
    }
    report.push({
      row: n,
      name: row.fullName,
      disposition: 'linked',
      detail: [`matched on ${resolution.matchedOn}`, ...detailNotes].join('; '),
    });
    return;
  }

  if (resolution.kind === 'ambiguous') {
    const candidates = resolution.candidates
      .map((c) => `${c.fullName} (${c.similarity.toFixed(2)})`)
      .join(' | ');
    report.push({ row: n, name: row.fullName, disposition: 'review', detail: `ambiguous name match: ${candidates}` });
    return;
  }

  // Unmatched. Creation requires a real identifier (CLAUDE.md pipeline rules).
  if (!email && !linkedin) {
    report.push({
      row: n,
      name: row.fullName,
      disposition: 'review',
      detail: [`no email, no LinkedIn URL, no confident name+company match`, ...detailNotes].join('; '),
    });
    return;
  }

  if (commit) {
    const [person] = await sql`
      insert into person (full_name, linkedin_url)
      values (${row.fullName}, ${linkedin})
      returning id`;
    if (email) {
      await sql`
        insert into person_email (person_id, email, is_primary)
        values (${person.id}, ${email}, true)`;
    }
    const employerId = row.company ? await getOrCreateCompany(row.company) : null;
    if (employerId) {
      await sql`
        insert into employment (person_id, company_id, title, is_current)
        values (${person.id}, ${employerId}, ${row.title}, true)`;
    }
  }
  report.push({
    row: n,
    name: row.fullName,
    disposition: 'created',
    detail: [commit ? 'created' : 'would create', ...detailNotes].join('; '),
  });
}

try {
  console.log(`${commit ? 'IMPORTING' : 'DRY RUN'} — ${rawRows.length} rows from ${file}`);
  for (let i = 0; i < rawRows.length; i++) {
    await importRow(mapRow(rawRows[i]), i + 2); // +2: 1-based plus header line
  }

  const counts = report.reduce<Record<string, number>>((acc, r) => {
    acc[r.disposition] = (acc[r.disposition] ?? 0) + 1;
    return acc;
  }, {});
  console.log('Dispositions:', counts);

  const csv = [
    'row,name,disposition,detail',
    ...report.map((r) => `${r.row},"${r.name.replaceAll('"', '""')}",${r.disposition},"${r.detail.replaceAll('"', '""')}"`),
  ].join('\n');
  writeFileSync(reportPath, csv);
  console.log(`Report written to ${reportPath}`);
  if (!commit) console.log('Nothing was written. Re-run with --commit to apply.');
} finally {
  await sql.end();
}
