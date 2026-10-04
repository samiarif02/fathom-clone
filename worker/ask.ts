/**
 * "Ask" over your meetings: retrieval from Postgres (meeting notes, action items, and the
 * transcript lines that match the question), then Workers AI answers from that material only,
 * citing sources as [M<n> mm:ss] so the UI can link straight to the moment.
 */
import { Hono } from "hono";
import type { AppEnv } from "./env";
import { requireUser, userClient } from "./supabase";
import { MODEL } from "../shared/pipeline.ts";
import { chatAi, isQuotaError } from "./ai";

type Msg = { role: "user" | "assistant"; content: string };
type Body = { question: string; meetingId?: string | null; history?: Msg[]; now?: string; tz?: string };

type Row = {
  id: string; title: string; started_at: string; duration_ms: number;
  participants: { id: string; name: string }[];
  summaries: { template: string; sections: { heading: string; bullets: { text: string; at_ms: number | null }[] }[] }[];
  action_items: { text: string; done: boolean; at_ms: number | null; assignee_participant_id: string | null }[];
};

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
};

const MAX_FULL_TRANSCRIPT_CHARS = 70_000; // a single meeting up to ~an hour goes in whole

export const ask = new Hono<AppEnv>();
ask.use("*", requireUser);

ask.post("/", async (c) => {
  const body = await c.req.json<Body>();
  const question = body.question?.trim().slice(0, 2000);
  if (!question) return c.json({ error: "Ask a question" }, 400);
  const db = userClient(c.env, c.get("token"));

  // 1. The meetings in scope, with their notes and action items.
  let q = db
    .from("meetings")
    .select("id,title,started_at,duration_ms,participants(id,name),summaries(template,sections),action_items(text,done,at_ms,assignee_participant_id)")
    .eq("status", "ready")
    .order("started_at", { ascending: false })
    .limit(25);
  if (body.meetingId) q = q.eq("id", body.meetingId);
  const { data: meetings, error } = await q;
  if (error) throw error;
  if (!meetings?.length) {
    return c.json({ answer: body.meetingId ? "I can't find that meeting." : "You don't have any processed meetings yet. Upload or record one, and I'll be able to answer questions about it.", sources: {} });
  }
  const rows = meetings as unknown as Row[];
  const label = new Map(rows.map((m, i) => [m.id, `M${i + 1}`]));

  // 2. Transcript evidence: the whole transcript for a single meeting, else the lines that match.
  const excerpts: string[] = [];
  if (body.meetingId) {
    const m = rows[0];
    const { data: segs } = await db.from("transcript_segments").select("start_ms,text,participant_id").eq("meeting_id", m.id).order("idx").limit(5000);
    const names = new Map(m.participants.map((p) => [p.id, p.name]));
    let total = 0;
    for (const s of segs ?? []) {
      const line = `[M1 ${clock(s.start_ms)}] ${names.get(s.participant_id ?? "") ?? "Speaker"}: ${s.text}`;
      total += line.length;
      if (total > MAX_FULL_TRANSCRIPT_CHARS) { excerpts.push("[transcript truncated]"); break; }
      excerpts.push(line);
    }
  } else {
    const terms = [...new Set(question.toLowerCase().match(/[a-z0-9$%]{3,}/g) ?? [])].slice(0, 12);
    if (terms.length) {
      const { data: hits } = await db.rpc("search", { q: terms.join(" or ") });
      const lines = ((hits ?? []) as { meeting_id: string; kind: string; at_ms: number | null; speaker: string | null; snippet: string }[])
        .filter((h) => h.kind === "transcript" && label.has(h.meeting_id) && h.at_ms != null)
        .slice(0, 40);
      for (const h of lines) {
        excerpts.push(`[${label.get(h.meeting_id)} ${clock(h.at_ms!)}] ${h.speaker ?? "Speaker"}: ${h.snippet.replace(/<\/?mark>/g, "")}`);
      }
    }
  }

  // 3. Context the model may answer from.
  const tz = body.tz || "UTC";
  const fmtDate = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  const meetingBlocks = rows.map((m) => {
    const people = new Map(m.participants.map((p) => [p.id, p.name]));
    const notes = m.summaries.find((s) => s.template === "general") ?? m.summaries[0];
    const lines = [`[${label.get(m.id)}] "${m.title}". ${fmtDate(m.started_at)}, ${Math.max(1, Math.round(m.duration_ms / 60000))} min. Participants: ${m.participants.map((p) => p.name).join(", ") || "unknown"}.`];
    if (notes) {
      for (const sec of notes.sections) {
        lines.push(`  ${sec.heading}:`);
        for (const b of sec.bullets.slice(0, 6)) lines.push(`   - ${b.text}${b.at_ms != null ? ` [${label.get(m.id)} ${clock(b.at_ms)}]` : ""}`);
      }
    }
    if (m.action_items.length) {
      lines.push("  Action items:");
      for (const a of m.action_items) {
        const who = a.assignee_participant_id ? people.get(a.assignee_participant_id) : null;
        lines.push(`   - [${a.done ? "x" : " "}] ${a.text}${who ? ` (owner: ${who})` : ""}${a.at_ms != null ? ` [${label.get(m.id)} ${clock(a.at_ms)}]` : ""}`);
      }
    }
    return lines.join("\n");
  });

  const now = body.now ? new Date(body.now) : new Date();
  // Who "me" is, so "my action items" can be filtered to the right person.
  const { data: who } = await db.auth.getUser(c.get("token"));
  const meName = (who.user?.user_metadata?.full_name as string | undefined) ?? null;
  const meLine = meName
    ? `The user asking is ${meName}. "Me", "my" and "I" refer to ${meName}.`
    : `The user's name isn't known (account email: ${who.user?.email ?? "unknown"}). If they say "my", include items with no clear owner and say whose items are whose.`;
  const system = `You are "Ask", an assistant inside a meeting-notes app. Answer the user's question using ONLY the meeting material provided. ${meLine} Today is ${now.toLocaleDateString("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric", year: "numeric" })} (${tz}).

Rules:
- Ground every claim in the material. If the answer isn't there, say so plainly and suggest what to ask instead. Never invent names, numbers, dates or quotes.
- Cite sources inline right after the claim, using exactly the bracket labels shown in the material, one per bracket: [M2 21:10] for a moment or [M2] for a whole meeting. For several sources write [M2 4:17] [M6 33:49].
- Be concise: lead with the answer, then short bullet points. Use **bold** sparingly. No tables, no headings.
- For writing tasks (follow-up emails, recaps, encouragement), write the text directly, drawing on specifics from the meetings.
- Interpret relative dates ("last week", "yesterday") against today's date and the meeting dates.`;

  const context = `MEETINGS (most recent first)\n${meetingBlocks.join("\n\n")}${excerpts.length ? `\n\n${body.meetingId ? "FULL TRANSCRIPT" : "TRANSCRIPT LINES MATCHING THE QUESTION"}\n${excerpts.join("\n")}` : ""}`;

  const history = (body.history ?? []).slice(-6).map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  try {
    const result = (await chatAi(c.env)(MODEL, {
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Meeting material:\n\n${context}` },
        { role: "assistant", content: "Understood. I'll answer only from this material and cite sources." },
        ...history,
        { role: "user", content: question },
      ],
      max_tokens: 2000,
      temperature: 0.3,
    })) as { response?: unknown; choices?: { message?: { content?: string } }[] };
    const answer = String(result.response ?? result.choices?.[0]?.message?.content ?? "").trim();
    const sources = Object.fromEntries(rows.map((m) => [label.get(m.id)!, { id: m.id, title: m.title }]));
    return c.json({ answer: answer || "I couldn't come up with an answer. Try rephrasing the question.", sources });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isQuotaError(e)) return c.json({ error: "Today's free AI allowance is used up. Ask again tomorrow." }, 429);
    return c.json({ error: `Couldn't answer right now: ${msg.slice(0, 160)}` }, 502);
  }
});
