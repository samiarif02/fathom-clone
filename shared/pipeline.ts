/**
 * The AI pipeline: chapters, summaries per template, and action items, each tied back to
 * the transcript line where it was said. Shared by the Worker (env.AI) and the seed script
 * (Workers AI over REST), so seeded meetings go through exactly the same code.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { templateById, type TemplateId } from "./templates.ts";

export const MODEL = "@cf/openai/gpt-oss-120b";

export type AiRunner = (model: string, body: Record<string, unknown>) => Promise<unknown>;

type Segment = { idx: number; start_ms: number; end_ms: number; text: string; participant_id: string | null };
type Participant = { id: string; name: string };
type Chapter = { idx: number; start_ms: number; end_ms: number; title: string; gist: string };
export type SummarySection = { heading: string; bullets: { text: string; at_ms: number | null }[] };

const ts = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

type Ctx = { meeting: { id: string; title: string; duration_ms: number }; segments: Segment[]; people: Participant[] };

async function load(db: SupabaseClient, meetingId: string): Promise<Ctx> {
  const [m, s, p] = await Promise.all([
    db.from("meetings").select("id,title,duration_ms").eq("id", meetingId).single(),
    db.from("transcript_segments").select("idx,start_ms,end_ms,text,participant_id").eq("meeting_id", meetingId).order("idx").limit(5000),
    db.from("participants").select("id,name").eq("meeting_id", meetingId),
  ]);
  if (m.error) throw m.error;
  if (s.error) throw s.error;
  if (p.error) throw p.error;
  return { meeting: m.data, segments: s.data, people: p.data };
}

function transcriptText({ segments, people }: Ctx) {
  const names = new Map(people.map((p) => [p.id, p.name.split(" ")[0]]));
  return segments
    .map((s, i) => `L${i} [${ts(s.start_ms)}] ${names.get(s.participant_id ?? "") ?? "Speaker"}: ${s.text}`)
    .join("\n");
}

function header(ctx: Ctx) {
  const roster = ctx.people.map((p) => p.name).join(", ");
  return `Meeting: "${ctx.meeting.title}" (${Math.round(ctx.meeting.duration_ms / 60000)} minutes). Participants: ${roster}.
Transcript lines are formatted "L<number> [mm:ss] Speaker: text".`;
}

async function askJson<T>(ai: AiRunner, prompt: string, maxTokens = 6000): Promise<T> {
  const result = (await ai(MODEL, {
    messages: [
      { role: "system", content: "You are a meticulous meeting analyst. You reply with a single JSON object and nothing else. Never invent facts, names, numbers or dates that are not in the transcript." },
      { role: "user", content: prompt },
    ],
    max_tokens: maxTokens,
    temperature: 0.2,
  })) as { response?: unknown; choices?: { message?: { content?: string } }[] };
  const raw = result.response ?? result.choices?.[0]?.message?.content;
  if (raw && typeof raw === "object") return raw as T;
  const text = String(raw ?? "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error(`AI returned no JSON: ${text.slice(0, 200)}`);
  return JSON.parse(text.slice(start, end + 1)) as T;
}

const lineMs = (ctx: Ctx, line: unknown) => {
  const n = typeof line === "number" ? line : Number.parseInt(String(line ?? "").replace(/^L/, ""), 10);
  return Number.isFinite(n) && ctx.segments[n] ? ctx.segments[n].start_ms : null;
};

export async function generateChapters(db: SupabaseClient, ai: AiRunner, meetingId: string, ctx?: Ctx) {
  ctx ??= await load(db, meetingId);
  const minutes = ctx.meeting.duration_ms / 60000;
  const range = minutes > 40 ? "5-9" : minutes > 12 ? "3-5" : "2-4";
  const out = await askJson<{ chapters: { start_line: number; title: string; gist: string }[] }>(
    ai,
    `${header(ctx)}

Split the meeting into ${range} chapters by topic. Return {"chapters":[{"start_line":<int>,"title":"<3-7 words>","gist":"<one sentence: what was discussed or decided, with key specifics>"}]}. Chapters are in order, the first starts at line 0, and each starts where the topic actually changes.

TRANSCRIPT
${transcriptText(ctx)}`,
    4000,
  );
  const starts = out.chapters
    .map((c) => ({ ...c, start_ms: lineMs(ctx, c.start_line) ?? 0 }))
    .sort((a, b) => a.start_ms - b.start_ms);
  starts[0].start_ms = 0;
  const chapters: Chapter[] = starts.map((c, idx) => ({
    idx, title: c.title, gist: c.gist, start_ms: c.start_ms,
    end_ms: starts[idx + 1]?.start_ms ?? ctx.meeting.duration_ms,
  }));
  await db.from("chapters").delete().eq("meeting_id", meetingId);
  const { error } = await db.from("chapters").insert(chapters.map((c) => ({ ...c, meeting_id: meetingId })));
  if (error) throw error;
  return chapters;
}

/** Summary for one template. The General template also extracts action items in the same call. */
export async function generateSummary(
  db: SupabaseClient, ai: AiRunner, meetingId: string, templateId: TemplateId, ctx?: Ctx,
) {
  const template = templateById(templateId);
  if (!template) throw new Error(`Unknown template ${templateId}`);
  ctx ??= await load(db, meetingId);
  const { data: chapters } = await db.from("chapters").select("idx,title,start_ms").eq("meeting_id", meetingId).order("idx");
  const chapterList = (chapters ?? []).map((c) => `- [${ts(c.start_ms)}] ${c.title}`).join("\n");
  const withActions = templateId === "general";

  const out = await askJson<{
    sections: { heading: string; bullets: { text: string; line?: number | string }[] }[];
    action_items?: { text: string; assignee?: string | null; line?: number | string }[];
  }>(
    ai,
    `${header(ctx)}
${chapterList ? `\nChapters:\n${chapterList}\n` : ""}
Write meeting notes using the "${template.label}" template.
${template.instructions}

Bullets are concise (one sentence, at most ~25 words), specific (names, numbers, dates), and each cites the transcript line where it is best supported via "line".
${withActions ? `
Also extract action items: every concrete commitment someone made or was assigned. "text" starts with a verb and includes the due date if one was said; "assignee" is the participant's full name (or null); "line" is where it was agreed.` : ""}

Return {"sections":[{"heading":"...","bullets":[{"text":"...","line":<int>}]}]${withActions ? `,"action_items":[{"text":"...","assignee":"...","line":<int>}]` : ""}}.

TRANSCRIPT
${transcriptText(ctx)}`,
  );

  const sections: SummarySection[] = out.sections
    .filter((s) => s.bullets?.length)
    .map((s) => ({ heading: s.heading, bullets: s.bullets.map((b) => ({ text: b.text, at_ms: lineMs(ctx, b.line) })) }));
  const plain = sections.map((s) => `${s.heading}\n${s.bullets.map((b) => b.text).join("\n")}`).join("\n\n");
  const { error } = await db
    .from("summaries")
    .upsert({ meeting_id: meetingId, template: templateId, sections, plain, model: MODEL }, { onConflict: "meeting_id,template" });
  if (error) throw error;

  if (withActions && out.action_items) {
    const findPerson = (name?: string | null) => {
      if (!name) return null;
      const n = name.toLowerCase();
      return ctx.people.find((p) => p.name.toLowerCase() === n || p.name.split(" ")[0].toLowerCase() === n.split(" ")[0])?.id ?? null;
    };
    await db.from("action_items").delete().eq("meeting_id", meetingId);
    const rows = out.action_items.map((a, idx) => ({
      meeting_id: meetingId, idx, text: a.text, assignee_participant_id: findPerson(a.assignee), at_ms: lineMs(ctx, a.line),
    }));
    if (rows.length) {
      const { error: aErr } = await db.from("action_items").insert(rows);
      if (aErr) throw aErr;
    }
  }
  return sections;
}

/** Full pass after a transcript exists: chapters → General notes + action items → extra templates. */
export async function processMeeting(
  db: SupabaseClient, ai: AiRunner, meetingId: string, log: (msg: string) => void = () => {},
  extraTemplates: TemplateId[] = [],
) {
  try {
    const ctx = await load(db, meetingId);
    const chapters = await generateChapters(db, ai, meetingId, ctx);
    log(`${chapters.length} chapters`);
    await generateSummary(db, ai, meetingId, "general", ctx);
    log("general notes + action items");
    for (const t of extraTemplates) {
      await generateSummary(db, ai, meetingId, t, ctx);
      log(`${t} notes`);
    }
    await db.from("meetings").update({ status: "ready", error: null }).eq("id", meetingId);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.from("meetings").update({ status: "failed", error: message.slice(0, 500) }).eq("id", meetingId);
    throw e;
  }
}
