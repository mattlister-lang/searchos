/**
 * Phase 0 seed: Kraken deal + Amy Park, GeoPura + Theo Elmer, priority
 * targets, and Matt's own person record (CLAUDE.md Phase 0 checklist).
 *
 * Confirmed values only — unknowns stay null rather than inventing data,
 * and are filled in conversationally later. The script is idempotent — it
 * resolves before creating (ADR-013 rule 2) and is safe to re-run after
 * any edit.
 *
 * Embeddings are deliberately not set here; the Phase 1 pipeline backfills
 * them (ADR-005/007). No API calls happen in this script.
 *
 * Usage: npm run seed
 */
import postgres from 'postgres';
import { loadEnv, requireEnv } from './lib/env.ts';
import { resolveCompany, resolvePerson } from './lib/resolve.ts';

// ---------------------------------------------------------------------------
// EDIT THIS BLOCK — unknown values stay null rather than inventing data.
// ---------------------------------------------------------------------------

// Record-only data. Nothing in this system ever sends anything to anyone.
const SEED = {
  operator: {
    fullName: 'Matt Lister',
    email: 'matt.lister@offtakesearch.com',
    linkedinUrl: null as string | null, // add when Matt supplies it
    location: null as string | null,
    company: 'Offtake Search',
    title: 'Founder',
  },
  companies: [
    {
      name: 'Offtake Search',
      status: 'source',
      sectors: ['other'],
      domains: ['offtakesearch.com'],
      notes: 'Own company — home of the operator record.',
    },
    {
      name: 'Kraken',
      status: 'prospect',
      sectors: ['flexibility', 'grid'],
      domains: ['kraken.tech'], // confirmed by amy.park@kraken.tech
      notes: null as string | null,
    },
    {
      name: 'GeoPura',
      status: 'prospect',
      sectors: ['hydrogen'],
      domains: [] as string[], // add once confirmed; wrong domains poison matching
      notes: null as string | null,
    },
  ],
  people: [
    {
      fullName: 'Amy Park',
      email: 'amy.park@kraken.tech',
      linkedinUrl: null as string | null,
      company: 'Kraken',
      title: 'Talent Lead',
    },
    {
      fullName: 'Theo Elmer',
      email: null as string | null, // add when confirmed
      linkedinUrl: null as string | null,
      company: 'GeoPura',
      title: null as string | null,
    },
  ],
  deals: [
    {
      name: 'Kraken retained search',
      company: 'Kraken',
      primaryContact: 'Amy Park',
      stage: 'negotiation',
      value: null as number | null,
      nextStep: null as string | null,
    },
    {
      name: 'GeoPura opportunity',
      company: 'GeoPura',
      primaryContact: 'Theo Elmer',
      stage: 'qualified', // best guess — correct conversationally if wrong
      value: null as number | null,
      nextStep: null as string | null,
    },
  ],
  // Priority target companies (CLAUDE.md Phase 0 checklist) — empty until
  // Matt supplies the list; safe to fill and re-run.
  priorityTargets: [] as { name: string; sectors: string[]; notes?: string }[],
};

// ---------------------------------------------------------------------------

loadEnv();
const sql = postgres(requireEnv('SUPABASE_DB_URL'), { prepare: false });

async function upsertCompany(c: {
  name: string;
  status: string;
  sectors: string[];
  domains?: string[];
  notes?: string | null;
}): Promise<string> {
  let id = await resolveCompany(sql, { name: c.name, domain: c.domains?.[0] });
  if (!id) {
    const [row] = await sql`
      insert into company (name, status, sectors, notes)
      values (${c.name}, ${c.status}, ${c.sectors}, ${c.notes ?? null})
      returning id`;
    id = row.id as string;
    console.log(`  company created: ${c.name}`);
  } else {
    console.log(`  company exists:  ${c.name}`);
  }
  for (const domain of c.domains ?? []) {
    await sql`
      insert into company_domain (company_id, domain)
      values (${id}, ${domain})
      on conflict (domain) do nothing`;
  }
  return id;
}

async function upsertPerson(p: {
  fullName: string;
  email?: string | null;
  linkedinUrl?: string | null;
  location?: string | null;
  company?: string | null;
  title?: string | null;
}): Promise<string> {
  const companyId = p.company ? await resolveCompany(sql, { name: p.company }) : null;
  const resolution = await resolvePerson(sql, {
    email: p.email,
    linkedinUrl: p.linkedinUrl,
    name: p.fullName,
    companyId,
  });

  if (resolution.kind === 'suppressed') {
    throw new Error(`seed: ${p.fullName} is on the suppression list — refusing to recreate an erased person (ADR-008).`);
  }
  if (resolution.kind === 'ambiguous') {
    throw new Error(
      `seed: ambiguous match for ${p.fullName} — resolve manually before re-running: ` +
        resolution.candidates.map((c) => `${c.fullName} (${c.similarity.toFixed(2)})`).join(', '),
    );
  }
  if (resolution.kind === 'matched') {
    console.log(`  person exists:   ${p.fullName} (matched on ${resolution.matchedOn})`);
    return resolution.personId;
  }

  const [person] = await sql`
    insert into person (full_name, linkedin_url, location)
    values (${p.fullName}, ${p.linkedinUrl ?? null}, ${p.location ?? null})
    returning id`;
  if (p.email) {
    await sql`
      insert into person_email (person_id, email, is_primary)
      values (${person.id}, ${p.email}, true)`;
  }
  if (companyId) {
    await sql`
      insert into employment (person_id, company_id, title, is_current)
      values (${person.id}, ${companyId}, ${p.title ?? null}, true)`;
  }
  console.log(`  person created:  ${p.fullName}`);
  return person.id;
}

async function upsertDeal(d: {
  name: string;
  company: string;
  primaryContact?: string | null;
  stage: string;
  value?: number | null;
  nextStep?: string | null;
}): Promise<void> {
  const companyId = await resolveCompany(sql, { name: d.company });
  if (!companyId) throw new Error(`seed: deal "${d.name}" references unknown company ${d.company}`);

  const existing = await sql`
    select id from deal where company_id = ${companyId} and lower(name) = lower(${d.name})`;
  if (existing.length > 0) {
    console.log(`  deal exists:     ${d.name}`);
    return;
  }

  let contactId: string | null = null;
  if (d.primaryContact) {
    const res = await resolvePerson(sql, { name: d.primaryContact, companyId });
    if (res.kind === 'matched') contactId = res.personId;
  }

  await sql`
    insert into deal (company_id, primary_contact_id, name, stage, value, next_step)
    values (${companyId}, ${contactId}, ${d.name}, ${d.stage}, ${d.value ?? null}, ${d.nextStep ?? null})`;
  console.log(`  deal created:    ${d.name}`);
}

// Not wrapped in a transaction: every step is idempotent, so a partial run
// is safely completed by re-running.
try {
  console.log('Companies:');
  for (const c of SEED.companies) await upsertCompany(c);

  console.log('Priority targets:');
  if (SEED.priorityTargets.length === 0) {
    console.log('  (none listed — fill SEED.priorityTargets with the real list)');
  }
  for (const t of SEED.priorityTargets) {
    await upsertCompany({ name: t.name, status: 'target', sectors: t.sectors, notes: t.notes });
  }

  console.log('People:');
  await upsertPerson(SEED.operator);
  for (const p of SEED.people) await upsertPerson(p);

  console.log('Deals:');
  for (const d of SEED.deals) await upsertDeal(d);

  console.log('Seed complete.');
} finally {
  await sql.end();
}
