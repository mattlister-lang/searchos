import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client — the UI's only data path (ADR-021). Server-only by
 * construction: importing this from a client component fails the build.
 * RLS stays no-policies; the service role bypasses it, the browser never
 * holds a credential that can read anything.
 */
export const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
