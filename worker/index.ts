import { Hono } from "hono";
import type { AppEnv, Bindings } from "./env";
import { adminClient, requireUser, userClient } from "./supabase";
import { serveMedia, signedMediaUrl } from "./media";
import { DEMO_EMAIL } from "../shared/demo.ts";
import { generateSummary, type AiRunner } from "../shared/pipeline.ts";
import { templateById, type TemplateId } from "../shared/templates.ts";

const app = new Hono<AppEnv>().basePath("/api");

const workersAi = (env: Bindings): AiRunner => (model, body) =>
  env.AI.run(model as Parameters<Ai["run"]>[0], body as never) as Promise<unknown>;

/** Workers AI's free plan has a daily allowance; say so plainly instead of a stack trace. */
function aiError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  if (/neuron|quota|4006|limit/i.test(msg)) {
    return { status: 429 as const, error: "Today's free AI allowance is used up. Try this template again tomorrow." };
  }
  return { status: 502 as const, error: `AI generation failed: ${msg.slice(0, 200)}` };
}

app.get("/health", (c) => c.json({ ok: true }));

// Public Supabase settings for the browser client. The publishable key is designed to be public.
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

app.get("/media/*", (c) => serveMedia(c.env, c.req.raw, decodeURIComponent(c.req.path.replace(/^\/api\/media\//, ""))));

// Signed-out clip page. The token is the only credential, so read with the service role
// but return nothing beyond the clip window.
app.get("/public/clips/:token", async (c) => {
  const db = adminClient(c.env);
  const { data: h } = await db
    .from("highlights")
    .select("id,start_ms,end_ms,note,view_count,created_at,meeting_id,meetings(title,started_at,media_key,media_kind)")
    .eq("share_token", c.req.param("token"))
    .maybeSingle();
  if (!h) return c.json({ error: "This clip link is invalid or has been turned off." }, 404);
  const meeting = h.meetings as unknown as { title: string; started_at: string; media_key: string; media_kind: string };
  const [{ data: segments }, { data: people }] = await Promise.all([
    db.from("transcript_segments").select("idx,start_ms,end_ms,text,participant_id")
      .eq("meeting_id", h.meeting_id).lt("start_ms", h.end_ms).gt("end_ms", h.start_ms).order("idx"),
    db.from("participants").select("id,name,color,idx").eq("meeting_id", h.meeting_id).order("idx"),
  ]);
  c.executionCtx.waitUntil(Promise.resolve(db.from("highlights").update({ view_count: h.view_count + 1 }).eq("id", h.id)));
  const speaking = new Set((segments ?? []).map((s) => s.participant_id));
  return c.json({
    clip: { start_ms: h.start_ms, end_ms: h.end_ms, note: h.note, created_at: h.created_at },
    meeting: { title: meeting.title, started_at: meeting.started_at, media_kind: meeting.media_kind },
    media_url: await signedMediaUrl(c.env, meeting.media_key),
    segments: segments ?? [],
    participants: (people ?? []).filter((p) => speaking.has(p.id)),
  });
});

// ---- Signed-in routes ----------------------------------------------------------------
app.use("/meetings/*", requireUser);

app.get("/meetings/:id/media-url", async (c) => {
  const { data } = await userClient(c.env, c.get("token"))
    .from("meetings").select("media_key").eq("id", c.req.param("id")).maybeSingle();
  if (!data?.media_key) return c.json({ error: "No recording for this meeting" }, 404);
  return c.json({ url: await signedMediaUrl(c.env, data.media_key) });
});

app.post("/meetings/:id/summaries/:template", async (c) => {
  const template = c.req.param("template");
  if (!templateById(template)) return c.json({ error: "Unknown template" }, 400);
  const db = userClient(c.env, c.get("token"));
  const { data: m } = await db.from("meetings").select("id").eq("id", c.req.param("id")).maybeSingle();
  if (!m) return c.json({ error: "Meeting not found" }, 404);
  try {
    const sections = await generateSummary(db, workersAi(c.env), m.id, template as TemplateId);
    return c.json({ template, sections });
  } catch (e) {
    const { status, error } = aiError(e);
    return c.json({ error }, status);
  }
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message || "Something went wrong" }, 500);
});

export default app;
