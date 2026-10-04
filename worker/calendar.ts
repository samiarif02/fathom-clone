import { Hono } from "hono";
import type { AppEnv, Bindings } from "./env";
import { adminClient, requireUser } from "./supabase";
import { DEMO_EMAIL } from "../shared/demo.ts";

const SCOPES = "openid email https://www.googleapis.com/auth/calendar.events.readonly";

export type UpcomingEvent = {
  id: string; title: string; start: string; end: string;
  attendees: { name: string; email: string }[];
  conference: "meet" | "zoom" | "teams" | null; link: string | null; sample?: boolean;
};

const enc = new TextEncoder();
async function sign(env: Bindings, value: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(env.MEDIA_SIGNING_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`calendar:${value}`)));
  return btoa(String.fromCharCode(...sig)).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" })[c]!);
}

const redirectUri = (req: Request) => `${new URL(req.url).origin}/api/calendar/callback`;

export const calendar = new Hono<AppEnv>();

// Google redirects here (no Authorization header); the signed state carries the user id.
calendar.get("/callback", async (c) => {
  const done = (q: string) => c.redirect(`/calendar?${q}`);
  const [userId, exp, sig] = (c.req.query("state") ?? "").split(".");
  if (!userId || Number(exp) < Date.now() / 1000 || sig !== (await sign(c.env, `${userId}.${exp}`))) {
    console.error("calendar callback: bad or expired state");
    return done("error=expired");
  }
  if (c.req.query("error") || !c.req.query("code")) {
    console.error("calendar callback: google returned", c.req.query("error"));
    return done(`error=${encodeURIComponent(c.req.query("error") ?? "denied")}`);
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: c.req.query("code")!, client_id: c.env.GOOGLE_CLIENT_ID!, client_secret: c.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(c.req.raw), grant_type: "authorization_code",
    }),
  });
  const tokens = (await res.json()) as { refresh_token?: string; id_token?: string; error?: string; error_description?: string };
  if (!tokens.refresh_token) {
    console.error("calendar callback: token exchange failed", res.status, tokens.error, tokens.error_description);
    return done(`error=${encodeURIComponent(tokens.error ?? "token")}`);
  }
  const claims = JSON.parse(atob(tokens.id_token!.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
  const { error } = await adminClient(c.env).from("calendar_accounts").upsert({
    user_id: userId, google_email: claims.email, refresh_token: tokens.refresh_token, connected_at: new Date().toISOString(),
  });
  if (error) {
    console.error("calendar callback: saving the connection failed", error.message);
    return done("error=save");
  }
  return done("connected=1");
});

calendar.use("*", requireUser);

calendar.post("/connect-url", async (c) => {
  if (!c.env.GOOGLE_CLIENT_ID) return c.json({ error: "Google Calendar isn't configured on this deployment" }, 501);
  const exp = Math.floor(Date.now() / 1000) + 600;
  const state = `${c.get("userId")}.${exp}.${await sign(c.env, `${c.get("userId")}.${exp}`)}`;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri(c.req.raw), response_type: "code",
    scope: SCOPES, access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
  }).toString();
  return c.json({ url: url.toString() });
});

calendar.post("/disconnect", async (c) => {
  const db = adminClient(c.env);
  const { data } = await db.from("calendar_accounts").select("refresh_token").eq("user_id", c.get("userId")).maybeSingle();
  if (data) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(data.refresh_token)}`, { method: "POST" }).catch(() => {});
    await db.from("calendar_accounts").delete().eq("user_id", c.get("userId"));
  }
  return c.json({ ok: true });
});

calendar.get("/events", async (c) => {
  const db = adminClient(c.env);
  const { data: user } = await db.auth.admin.getUserById(c.get("userId"));
  // The demo account can't connect a real Google account; the browser shows a sample week instead.
  if (user.user?.email === DEMO_EMAIL) return c.json({ connected: "sample", email: null, events: [] });

  const { data: account } = await db.from("calendar_accounts").select("google_email,refresh_token").eq("user_id", c.get("userId")).maybeSingle();
  if (!account) return c.json({ connected: false, configured: !!c.env.GOOGLE_CLIENT_ID, events: [] });

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.env.GOOGLE_CLIENT_ID!, client_secret: c.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: account.refresh_token, grant_type: "refresh_token",
    }),
  });
  const { access_token } = (await tokenRes.json()) as { access_token?: string };
  if (!access_token) return c.json({ connected: false, configured: true, expired: true, events: [] });

  const now = new Date();
  const params = new URLSearchParams({
    timeMin: now.toISOString(), timeMax: new Date(now.getTime() + 14 * 86400000).toISOString(),
    singleEvents: "true", orderBy: "startTime", maxResults: "50",
  });
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  const body = (await res.json()) as { items?: GoogleEvent[]; error?: { message?: string } };
  if (!res.ok) {
    console.error("calendar events: google error", res.status, body.error?.message);
    return c.json({ connected: true, email: account.google_email, events: [], error: body.error?.message ?? `Google returned ${res.status}` });
  }
  const events = (body.items ?? []).filter((e) => e.start?.dateTime).map(toUpcoming);
  return c.json({ connected: true, email: account.google_email, events });
});

type GoogleEvent = {
  id: string; summary?: string; hangoutLink?: string; location?: string; description?: string;
  start?: { dateTime?: string }; end?: { dateTime?: string };
  attendees?: { email: string; displayName?: string; self?: boolean }[];
  conferenceData?: { entryPoints?: { uri: string; entryPointType: string }[] };
};

function toUpcoming(e: GoogleEvent): UpcomingEvent {
  const video = e.hangoutLink ?? e.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri
    ?? [e.location, e.description].join(" ").match(/https:\/\/[^\s"<]*(zoom\.us|teams\.microsoft\.com|meet\.google\.com)[^\s"<]*/)?.[0] ?? null;
  return {
    id: e.id, title: e.summary?.trim() || "Untitled meeting", start: e.start!.dateTime!, end: e.end?.dateTime ?? e.start!.dateTime!,
    attendees: (e.attendees ?? []).filter((a) => !a.self).map((a) => ({ name: a.displayName ?? a.email.split("@")[0], email: a.email })),
    conference: video?.includes("zoom.us") ? "zoom" : video?.includes("teams.microsoft") ? "teams" : video ? "meet" : null,
    link: video,
  };
}
