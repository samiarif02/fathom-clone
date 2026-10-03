/**
 * Re-checks the timestamp on every summary bullet and action item already in the database
 * with anchorMs() (no AI calls), for meetings generated before that check existed.
 *   node scripts/seed/reanchor.ts            # dry run: show what would move
 *   node scripts/seed/reanchor.ts --write
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { anchorMs, type SummarySection } from "../../shared/pipeline.ts";

const ROOT = join(import.meta.dirname, "../..");
const key = readFileSync(join(ROOT, ".dev.vars"), "utf8").match(/^SUPABASE_SERVICE_ROLE_KEY=(.*)$/m)![1];
const url = readFileSync(join(ROOT, "wrangler.jsonc"), "utf8").match(/"SUPABASE_URL": "([^"]+)"/)![1];
const db = createClient(url, key, { auth: { persistSession: false } });
const write = process.argv.includes("--write");
const clock = (ms: number | null) => (ms == null ? "--" : `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`);

const { data: meetings } = await db.from("meetings").select("id,title");
let moved = 0, total = 0;
for (const m of meetings ?? []) {
  const { data: segs } = await db.from("transcript_segments").select("start_ms,text").eq("meeting_id", m.id).order("idx").limit(5000);
  if (!segs?.length) continue;
  const cite = (ms: number | null) => (ms == null ? null : Math.max(0, segs.findIndex((s) => s.start_ms === ms)));
  const fix = (text: string, ms: number | null) => {
    total++;
    const next = anchorMs(segs, text, cite(ms));
    if (next !== ms) { moved++; console.log(`  ${m.title.slice(0, 24).padEnd(24)} ${clock(ms)} → ${clock(next)}  ${text.slice(0, 70)}`); }
    return next;
  };
  const { data: sums } = await db.from("summaries").select("id,sections").eq("meeting_id", m.id);
  for (const s of sums ?? []) {
    const sections = (s.sections as SummarySection[]).map((sec) => ({ ...sec, bullets: sec.bullets.map((b) => ({ ...b, at_ms: fix(b.text, b.at_ms) })) }));
    if (write) await db.from("summaries").update({ sections }).eq("id", s.id);
  }
  const { data: items } = await db.from("action_items").select("id,text,at_ms").eq("meeting_id", m.id);
  for (const a of items ?? []) {
    const at = fix(a.text, a.at_ms);
    if (write && at !== a.at_ms) await db.from("action_items").update({ at_ms: at }).eq("id", a.id);
  }
}
console.log(`${moved} of ${total} timestamps ${write ? "moved" : "would move"}`);
