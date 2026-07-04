-- 0011_company_apollo_org_id.sql
-- ADR-025 (Apollo enrichment backbone): cache Apollo's organization id on the
-- company so news and job-postings lookups don't re-spend an enrichment
-- credit resolving domain → org id on every click. Written on first
-- successful enrichment/lookup; nullable and purely operational — carries no
-- personal data, so no erasure interaction (it identifies a company record
-- in a third-party dataset, nothing more).

alter table company add column apollo_org_id text;

comment on column company.apollo_org_id is
  'ADR-025: Apollo''s organization id for this company, cached on first '
  'enrichment/lookup so repeat news/job-postings calls skip the domain '
  'resolution credit. Nullable; set and read only by web/lib/apollo.ts '
  'call paths.';
