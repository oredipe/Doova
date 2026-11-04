import "server-only";
import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { supabasePublishableKey, supabaseUrl } from "@/lib/env";

/** Supabase client for Server Components, Server Actions and Route Handlers, acting as the signed-in person. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only. The proxy refreshes sessions.
        }
      },
    },
  });
}

export type AuthUser = { id: string; phone: string | null; email: string | null; aal: string; user_metadata: Record<string, unknown> };

/**
 * The signed-in person, from their verified session. getClaims() checks the token's signature
 * locally with the project's public signing key (no trip to the Auth server), and cache() makes
 * the layout and the page share one check per request.
 */
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  // The Supabase clients read the clock when they start. connection() tells Next.js this part is
  // per request, so background prefetches keep the instant shell instead of failing (404).
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const c = data.claims as { sub: string; phone?: string; email?: string; aal?: string; user_metadata?: Record<string, unknown> };
  return { id: c.sub, phone: c.phone ?? null, email: c.email || null, aal: c.aal ?? "aal1", user_metadata: c.user_metadata ?? {} };
});
