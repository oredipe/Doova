// Environment variables in one place, so a missing one fails loudly with a clear message.
// Supabase now calls its keys "publishable" (browser-safe) and "secret" (server only);
// older projects call them "anon" and "service_role". Either name works here.

function need(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing environment variable ${name}. See .env.example and the README.`);
  }
  return value;
}

export function supabaseUrl(): string {
  return need("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function supabasePublishableKey(): string {
  return need(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/** Server only. Bypasses row level security: never send it to the browser. */
export function supabaseSecretKey(): string {
  return need(
    "SUPABASE_SECRET_KEY",
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

export function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}

/** Version of the privacy policy a person agrees to at sign-up (stored with their consent). */
export const PRIVACY_POLICY_VERSION = "2026-11-12-draft";
