import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { supabaseSecretKey, supabaseUrl } from "@/lib/env";

/**
 * Server-only client with the secret key. The database blocks the public API roles from every
 * table and function, so all reads and writes go through here, always scoped in code to the
 * signed-in person. Money and status changes must call the workflow functions (see the README).
 */
export function createAdminClient() {
  return createSupabaseClient(supabaseUrl(), supabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
