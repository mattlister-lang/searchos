import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client — the UI's only data path (ADR-021). Server-only by
 * construction: importing this from a client component fails the build.
 * RLS stays no-policies; the service role bypasses it, the browser never
 * holds a credential that can read anything.
 *
 * Constructed lazily so `next build` never needs credentials — the key
 * exists only in Vercel's server environment at request time.
 */
let client: SupabaseClient | undefined;

function make(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export const db = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    client ??= make();
    const value = (client as unknown as Record<PropertyKey, unknown>)[prop as string];
    return typeof value === "function" ? (value as Function).bind(client) : value;
  },
});
