import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { MiddlewareHandler } from "hono";
import type { AppEnv, Bindings } from "./env";

const opts = { auth: { persistSession: false, autoRefreshToken: false } };

/** Acts as the signed-in user, so row level security applies. */
export function userClient(env: Bindings, token: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    ...opts,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/** Bypasses row level security. Only for public clip links and the processing pipeline. */
export function adminClient(env: Bindings): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, opts);
}

export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = c.req.header("Authorization")?.replace(/^Bearer /, "");
  if (!token) return c.json({ error: "Not signed in" }, 401);
  const { data, error } = await adminClient(c.env).auth.getUser(token);
  if (error || !data.user) return c.json({ error: "Session expired" }, 401);
  c.set("userId", data.user.id);
  c.set("token", token);
  await next();
};
