import { createClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client using service_role key.
 * NEVER import this in client components — the service key bypasses RLS.
 */
export function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars");
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}
