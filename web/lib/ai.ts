import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ParsedCvSchema, type ParsedCv } from "@/lib/cv";
import { db } from "@/lib/db";
import { SECTOR_TAXONOMY, SENIORITY_LEVELS } from "@/lib/domain";

/**
 * In-app AI (ADR-024) — the ONLY module that talks to the Claude API.
 * Server-side only; ANTHROPIC_API_KEY never leaves Vercel server env.
 * ADR-015 cost discipline is enforced in code here: every call is preceded
 * by a spend check (≥£50 refuse, ≥£20 warn) and every call is logged to
 * ai_usage_log — nothing unlogged, ever.
 */

/** Extraction runs on Haiku — the cheapest model that does the job (ADR-024). */
export const CV_PARSE_MODEL = "claude-haiku-4-5-20251001";

/**
 * The single source of truth for AI cost arithmetic: USD per million tokens
 * from Anthropic's published price card (Haiku 4.5: $1 in / $5 out per MTok),
 * converted with a deliberately FIXED USD→GBP estimate. A pinned, slightly
 * conservative rate keeps budget maths reproducible — do not replace with a
 * live FX lookup; revisit the constant if the rate drifts materially.
 */
export const PRICES = {
  "claude-haiku-4-5-20251001": { inputUsdPerMTok: 1.0, outputUsdPerMTok: 5.0 },
} as const;

/** Fixed USD→GBP estimate (set 3 Jul 2026). */
export const USD_TO_GBP = 0.79;

export function costGbp(
  model: keyof typeof PRICES,
  inputTokens: number,
  outputTokens: number,
): number {
  const p = PRICES[model];
  const usd =
    (inputTokens * p.inputUsdPerMTok + outputTokens * p.outputUsdPerMTok) / 1_000_000;
  return usd * USD_TO_GBP;
}

type BudgetCheck = { ok: true; warning?: string } | { ok: false; error: string };

/**
 * ADR-015/024 cost guard, run before EVERY API call. The month's spend comes
 * from one authoritative SQL definition (ai_spend_this_month_gbp, 0008).
 * Fails closed: if the spend can't be read, the call is refused.
 */
async function checkAiBudget(): Promise<BudgetCheck> {
  const { data, error } = await db.rpc("ai_spend_this_month_gbp");
  if (error || data == null) {
    return {
      ok: false,
      error: "Could not verify this month's AI spend — refusing to call the API (the ADR-024 cost guard fails closed). Try again shortly.",
    };
  }
  if (data >= 50) {
    return {
      ok: false,
      error: `This month's AI spend is £${data.toFixed(2)} — at the £50 hard stop (ADR-015/024). AI parsing is paused until next month.`,
    };
  }
  if (data >= 20) {
    return {
      ok: true,
      warning: `This month's AI spend is £${data.toFixed(2)} — past the £20 alert threshold (hard stop £50, ADR-015).`,
    };
  }
  return { ok: true };
}

/** Append one row to ai_usage_log (ADR-015: every call visible in v_ai_spend). */
async function logAiUsage(entry: {
  purpose: string;
  inputTokens: number | null;
  outputTokens: number | null;
  costGbp: number;
  sourceRef: string | null;
}): Promise<string | null> {
  const { data } = await db
    .from("ai_usage_log")
    .insert({
      provider: "anthropic",
      model: CV_PARSE_MODEL,
      purpose: entry.purpose,
      input_tokens: entry.inputTokens,
      output_tokens: entry.outputTokens,
      cost_gbp: entry.costGbp,
      source: "ui",
      source_ref: entry.sourceRef,
    })
    .select("id")
    .single();
  return data?.id ?? null;
}

/**
 * The parse action logs the call before any document exists (the CV is only
 * stored after the operator confirms — nothing is auto-created), so the log
 * row starts with source_ref null. Once the document row exists, this stamps
 * its id as source_ref, completing the ADR-024 contract.
 */
export async function linkAiLogToDocument(aiLogId: string, documentId: string): Promise<void> {
  await db
    .from("ai_usage_log")
    .update({ source_ref: documentId })
    .eq("id", aiLogId)
    .is("source_ref", null);
}

const CV_SYSTEM_PROMPT = [
  "You extract structured candidate data from CV/resume text for a recruitment CRM.",
  "Use ONLY information present in the text — never invent names, emails, URLs, employers or dates.",
  "- full_name: the candidate's name as written.",
  "- emails: every personal email address found; [] if none.",
  "- linkedin_url: their LinkedIn profile URL as 'linkedin.com/in/<slug>' if present, else null.",
  "- location: current city/region if stated, else null.",
  `- seniority: the candidate's CURRENT level on this scale: ${SENIORITY_LEVELS.join(", ")}; null if unclear.`,
  "- functions: broad functional disciplines (e.g. commercial, engineering, finance), lowercase, max 6.",
  "- skills: specific skills and domain expertise, lowercase, deduplicated, max 15.",
  `- sectors: industry sectors, mapped into this taxonomy where possible: ${SECTOR_TAXONOMY.join(", ")}. A sector that genuinely fits none of these may be given verbatim, lowercase.`,
  "- employment_history: every role, most recent first; dates as 'YYYY' or 'YYYY-MM' strings exactly as derivable from the text, null when absent; is_current true for roles held now.",
  "- summary: a neutral 2-3 sentence professional summary of the candidate.",
].join("\n");

export type CvExtraction =
  | { ok: true; parsed: ParsedCv; aiLogId: string | null; warning?: string }
  | { ok: false; error: string };

/**
 * One Claude call: CV text in, schema-guaranteed structured JSON out
 * (structured outputs — no hand-rolled JSON scraping). Guard before, log
 * after, on every path.
 */
export async function extractCv(text: string): Promise<CvExtraction> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error: "CV parsing needs the Claude API — add ANTHROPIC_API_KEY to the Vercel server environment (ADR-024), then retry. You can still add the person manually.",
    };
  }

  const budget = await checkAiBudget();
  if (!budget.ok) return budget;

  // A real CV is a few pages; 100k chars (~£0.02 of input) is far beyond any
  // genuine one. The cap bounds spend on degenerate files, nothing more.
  const input = text.slice(0, 100_000);
  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.parse({
      model: CV_PARSE_MODEL,
      max_tokens: 8000,
      system: CV_SYSTEM_PROMPT,
      messages: [{ role: "user", content: input }],
      output_config: { format: zodOutputFormat(ParsedCvSchema) },
    });

    const aiLogId = await logAiUsage({
      purpose: "cv_parse",
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      costGbp: costGbp(CV_PARSE_MODEL, response.usage.input_tokens, response.usage.output_tokens),
      sourceRef: null,
    });

    if (!response.parsed_output) {
      return {
        ok: false,
        error: "The model could not produce a valid structured CV from this file — add the person manually.",
      };
    }
    return { ok: true, parsed: response.parsed_output, aiLogId, warning: budget.warning };
  } catch (err) {
    // The attempt is still logged (nothing unlogged); a failed request bills
    // no tokens, so the row carries null tokens and zero cost.
    await logAiUsage({
      purpose: "cv_parse",
      inputTokens: null,
      outputTokens: null,
      costGbp: 0,
      sourceRef: null,
    });
    if (err instanceof Anthropic.APIError) {
      return { ok: false, error: `Claude API error (${err.status ?? "network"}) — try again shortly.` };
    }
    return { ok: false, error: "CV parsing failed unexpectedly — try again or add the person manually." };
  }
}
