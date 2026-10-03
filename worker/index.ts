import { Hono } from "hono";
import type { AppEnv } from "./env";
import { adminClient } from "./supabase";

export const DEMO_EMAIL = "demo@fieldnote.example";

const app = new Hono<AppEnv>().basePath("/api");

app.get("/health", (c) => c.json({ ok: true }));

// Public Supabase settings for the browser client. The anon key is designed to be public.
app.get("/config", (c) =>
  c.json({ supabaseUrl: c.env.SUPABASE_URL, supabaseAnonKey: c.env.SUPABASE_ANON_KEY }),
);

// "Try the demo" signs in server-side so the demo password never reaches the browser.
app.post("/demo-login", async (c) => {
  const { data, error } = await adminClient(c.env).auth.signInWithPassword({
    email: DEMO_EMAIL,
    password: c.env.DEMO_PASSWORD,
  });
  if (error || !data.session) return c.json({ error: "Demo account is unavailable right now" }, 503);
  return c.json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message || "Something went wrong" }, 500);
});

export default app;
