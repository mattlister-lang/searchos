import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Service-role client — the UI's only data path (ADR-022), typed against the
 * generated schema (engineering.md §2: regenerate database.types.ts in the
 * same PR as any migration). Server-only by construction. RLS stays
 * no-policies; the browser never holds a data credential.
 *
 * Constructed lazily so `next build` never needs credentials.
 */
export type Db = SupabaseClient<Database>;

let client: Db | undefined;

function make(): Db {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export const db = new Proxy({} as Db, {
  get(_target, prop) {
    client ??= make();
    const value = (client as unknown as Record<PropertyKey, unknown>)[prop as string];
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(client) : value;
  },
});
