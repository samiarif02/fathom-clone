import { Hono } from "hono";
import type { AppEnv, Bindings } from "./env";
import { adminClient, requireUser, userClient } from "./supabase";
import { processMeeting, type AiRunner } from "../shared/pipeline.ts";

const SPEAKER_COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#a855f7", "#ec4899", "#14b8a6"];
export const MAX_UPLOAD_BYTES = 300 * 1024 * 1024;

export const uploads = new Hono<AppEnv>();
uploads.use("*", requireUser);

// 1. Create the meeting row and an R2 multipart upload.
uploads.post("/", async (c) => {
  const body = await c.req.json<{ title: string; contentType: string; size: number; source: "upload" | "browser"; durationMs?: number; calendarEventId?: string | null }>();
  if (!body.title?.trim()) return c.json({ error: "Give the recording a title" }, 400);
  if (!/^(audio|video)\//.test(body.contentType)) return c.json({ error: "Only audio or video files" }, 400);
  if (body.size > MAX_UPLOAD_BYTES) return c.json({ error: "Recordings are limited to 300 MB in this demo" }, 400);
  const db = userClient(c.env, c.get("token"));
  const { data: meeting, error } = await db
    .from("meetings")
    .insert({
      owner_id: c.get("userId"), title: body.title.trim().slice(0, 200), source: body.source,
      media_kind: body.contentType.startsWith("audio/") ? "audio" : "video",
      duration_ms: Math.round(body.durationMs ?? 0), status: "processing", stage: "uploading",
      calendar_event_id: body.calendarEventId?.slice(0, 200) ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  const ext = body.contentType.split("/")[1].split(";")[0].replace("mpeg", "mp3").replace("quicktime", "mov");
  const key = `uploads/${c.get("userId")}/${meeting.id}.${ext}`;
  const mpu = await c.env.MEDIA.createMultipartUpload(key, { httpMetadata: { contentType: body.contentType.split(";")[0] } });
  await db.from("meetings").update({ media_key: key }).eq("id", meeting.id);
  return c.json({ meetingId: meeting.id, uploadId: mpu.uploadId });
});

async function ownedKey(c: { env: Bindings; get: (k: "token") => string }, id: string) {
  const { data } = await userClient(c.env, c.get("token")).from("meetings").select("media_key,stage").eq("id", id).maybeSingle();
  return data;
}

// 2. Upload parts (the client sends ~8 MB chunks, well under the Worker body limit).
uploads.put("/:id/parts/:n", async (c) => {
  const m = await ownedKey(c, c.req.param("id"));
  if (!m?.media_key || m.stage !== "uploading") return c.json({ error: "Upload not found" }, 404);
  const part = await c.env.MEDIA.resumeMultipartUpload(m.media_key, c.req.query("uploadId")!).uploadPart(Number(c.req.param("n")), c.req.raw.body!);
  return c.json(part);
});

// 3. Complete; processing then runs through /api/meetings/:id/process.
uploads.post("/:id/complete", async (c) => {
  const id = c.req.param("id");
  const m = await ownedKey(c, id);
  if (!m?.media_key || m.stage !== "uploading") return c.json({ error: "Upload not found" }, 404);
  const { uploadId, parts, durationMs } = await c.req.json<{ uploadId: string; parts: R2UploadedPart[]; durationMs?: number }>();
  await c.env.MEDIA.resumeMultipartUpload(m.media_key, uploadId).complete(parts);
  await userClient(c.env, c.get("token")).from("meetings")
    .update({ stage: "transcribe", ...(durationMs ? { duration_ms: Math.round(durationMs) } : {}) }).eq("id", id);
  return c.json({ ok: true });
});

type NovaParagraph = { speaker?: number; start: number; end: number; sentences: { text: string }[] };

/** Speech to text with speaker labels (Deepgram Nova-3 on Workers AI), streamed straight from R2. */
async function transcribe(env: Bindings, meetingId: string, key: string) {
  const obj = await env.MEDIA.get(key);
  if (!obj) throw new Error("Recording missing from storage");
  const result = (await env.AI.run("@cf/deepgram/nova-3" as Parameters<Ai["run"]>[0], {
    audio: { body: obj.body, contentType: obj.httpMetadata?.contentType ?? "audio/webm" },
    diarize: true, punctuate: true, smart_format: true, paragraphs: true,
  } as never)) as { results?: { channels?: { alternatives?: { paragraphs?: { paragraphs?: NovaParagraph[] } }[] }[] }; metadata?: { duration?: number } };

  const paragraphs = result.results?.channels?.[0]?.alternatives?.[0]?.paragraphs?.paragraphs ?? [];
  if (!paragraphs.length) throw new Error("No speech was detected in this recording");
  const db = adminClient(env);
  const speakerIds = [...new Set(paragraphs.map((p) => p.speaker ?? 0))].sort((a, b) => a - b);
  const { data: people, error } = await db
    .from("participants")
    .insert(speakerIds.map((s, idx) => ({ meeting_id: meetingId, name: `Speaker ${s + 1}`, color: SPEAKER_COLORS[idx % SPEAKER_COLORS.length], idx })))
    .select("id,idx");
  if (error) throw error;
  const idFor = new Map(speakerIds.map((s, i) => [s, people.find((p) => p.idx === i)!.id]));
  const rows = paragraphs.map((p, idx) => ({
    meeting_id: meetingId, participant_id: idFor.get(p.speaker ?? 0), idx,
    start_ms: Math.round(p.start * 1000), end_ms: Math.round(p.end * 1000), text: p.sentences.map((s) => s.text).join(" "),
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error: e } = await db.from("transcript_segments").insert(rows.slice(i, i + 500));
    if (e) throw e;
  }
  const lastEnd = rows[rows.length - 1].end_ms;
  const duration = Math.max(lastEnd, Math.round((result.metadata?.duration ?? 0) * 1000));
  await db.from("meetings").update({ duration_ms: duration }).eq("id", meetingId).lt("duration_ms", duration);
}

/** Runs the next pending step for a meeting. Steps are claimed atomically, so this is safe to call repeatedly. */
export async function processNext(env: Bindings, ai: AiRunner, token: string, id: string) {
  const owned = await userClient(env, token).from("meetings").select("id,stage,status,media_key").eq("id", id).maybeSingle();
  if (!owned.data) return { error: "Meeting not found" as const };
  const db = adminClient(env);
  const claim = async (from: string, to: string) =>
    (await db.from("meetings").update({ stage: to }).eq("id", id).eq("stage", from).select("id")).data?.length === 1;
  const fail = async (e: unknown) => {
    const message = e instanceof Error ? e.message : String(e);
    await db.from("meetings").update({ status: "failed", error: message.slice(0, 500), stage: "done" }).eq("id", id);
    return { stage: "done", status: "failed", error: message };
  };

  const { stage, media_key } = owned.data;
  if (stage === "transcribe" && (await claim("transcribe", "transcribing"))) {
    try {
      await transcribe(env, id, media_key!);
      await db.from("meetings").update({ stage: "analyze" }).eq("id", id);
      return { stage: "analyze", status: "processing" };
    } catch (e) { return fail(e); }
  }
  if (stage === "analyze" && (await claim("analyze", "analyzing"))) {
    try {
      await processMeeting(db, ai, id);
      await db.from("meetings").update({ stage: "done" }).eq("id", id);
      return { stage: "done", status: "ready" };
    } catch (e) { return fail(e); }
  }
  return { stage, status: owned.data.status };
}
