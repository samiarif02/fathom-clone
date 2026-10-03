import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: Promise<SupabaseClient> | null = null;

/** The browser client is configured from /api/config so the Worker is the single source of settings. */
export function getSupabase(): Promise<SupabaseClient> {
  client ??= fetch("/api/config")
    .then((r) => r.json() as Promise<{ supabaseUrl: string; supabaseAnonKey: string }>)
    .then((cfg) => createClient(cfg.supabaseUrl, cfg.supabaseAnonKey));
  return client;
}
