/**
 * Loads rendered seed meetings into Supabase + R2 under a hidden template account, runs the
 * same AI pipeline the Worker uses, adds a few highlights, then copies everything into the
 * demo account with reset_demo() (the Worker's nightly cron runs the same reset).
 *
 *   node scripts/seed/seed.ts            # all meetings in scripts/seed/out
 *   node scripts/seed/seed.ts q4-planning
 *   node scripts/seed/seed.ts --skip-media --skip-ai
 *
 * Reads SUPABASE_SERVICE_ROLE_KEY and DEMO_PASSWORD from .dev.vars, and uses wrangler's
 * login for R2 uploads and Workers AI.
 */
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { processMeeting, type AiRunner } from "../../shared/pipeline.ts";
import { DEMO_EMAIL, DEMO_NAME, TEMPLATE_EMAIL } from "../../shared/demo.ts";
import type { TemplateId } from "../../shared/templates.ts";

const ROOT = join(import.meta.dirname, "../..");
const OUT = join(ROOT, "scripts/seed/out");
const ACCOUNT_ID = "9a4d216fee63bbea8f1f4098e73f8cfc";
const BUCKET = "fathom-clone-media";

const devVars = Object.fromEntries(
  readFileSync(join(ROOT, ".dev.vars"), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const wrangler = readFileSync(join(ROOT, "wrangler.jsonc"), "utf8");
const SUPABASE_URL = wrangler.match(/"SUPABASE_URL": "([^"]+)"/)![1];

const db = createClient(SUPABASE_URL, devVars.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const args = process.argv.slice(2);
const skipMedia = args.includes("--skip-media");
const skipAi = args.includes("--skip-ai");
const slugs = args.filter((a) => !a.startsWith("--"));

// Seeded highlights: a phrase to find in the transcript, and what the clip is about.
const HIGHLIGHTS: Record<string, { phrase: string; note: string }[]> = {
  "q4-planning": [
    { phrase: "beta customer criteria by Friday", note: "Offline mode: read-only beta to 20 customers on Oct 27" },
    { phrase: "grandfather", note: "Pricing: existing customers grandfathered for 12 months" },
    { phrase: "4.8 seconds", note: "Acme: dispatch board p95 is 4.8s at the 7am peak" },
  ],
  "halcyon-discovery": [{ phrase: "nine days", note: "Halcyon's invoices go out 9 days late" }],
  "acme-exec-sync": [{ phrase: "October 23rd", note: "We commit to the perf fix by Oct 23" }],
};

// Each seed meeting also gets the template that fits it; the rest generate on first use.
const EXTRA_TEMPLATES: Record<string, TemplateId[]> = {
  "halcyon-discovery": ["sales"],
  "acme-exec-sync": ["customer"],
  "one-on-one-aman": ["one_on_one"],
  "mobile-standup": ["standup"],
  "interview-nadia": ["interview"],
};

type Rendered = {
  slug: string;
  title: string;
  started_at: string;
  duration_ms: number;
  participants: { short: string; name: string; color: string }[];
  segments: { speaker: string; start_ms: number; end_ms: number; text: string }[];
};

/** Workers AI over REST, authenticated with wrangler's OAuth login. */
const restAi: AiRunner = async (model, body) => {
  const cfg = readFileSync(join(homedir(), "Library/Preferences/.wrangler/config/default.toml"), "utf8");
  const token = cfg.match(/^oauth_token = "(.*)"$/m)![1];
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${model}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { success: boolean; result: unknown; errors: unknown };
  if (!json.success) throw new Error(`Workers AI ${model}: ${JSON.stringify(json.errors)}`);
  return json.result;
};

async function ensureUser(email: string, password: string): Promise<string> {
  const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const existing = data.users.find((u) => u.email === email);
  if (existing) {
    await db.auth.admin.updateUserById(existing.id, { password });
    return existing.id;
  }
  const created = await db.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: DEMO_NAME },
  });
  if (created.error) throw created.error;
  return created.data.user.id;
}

async function addHighlights(ownerId: string, meetingId: string, slug: string, m: Rendered) {
  for (const h of HIGHLIGHTS[slug] ?? []) {
    const hit = m.segments.find((s) => s.text.toLowerCase().includes(h.phrase.toLowerCase()));
    if (!hit) { console.warn(`  ${slug}: highlight phrase not found: ${h.phrase}`); continue; }
    const { error } = await db.from("highlights").insert({
      meeting_id: meetingId, created_by: ownerId, note: h.note,
      start_ms: Math.max(0, hit.start_ms - 4000), end_ms: Math.min(m.duration_ms, hit.end_ms + 6000),
    });
    if (error) throw error;
  }
}

async function seedMeeting(ownerId: string, m: Rendered) {
  const mediaKey = `seed/${m.slug}.mp4`;
  if (!skipMedia) {
    execFileSync(
      "npx",
      ["wrangler", "r2", "object", "put", `${BUCKET}/${mediaKey}`, "--file", join(OUT, m.slug, "media.mp4"),
        "--content-type", "video/mp4", "--remote"],
      { cwd: ROOT, stdio: "ignore" },
    );
  }

  // Idempotent: replace any earlier copy of this seed meeting.
  await db.from("meetings").delete().eq("owner_id", ownerId).eq("media_key", mediaKey);
  const { data: meeting, error } = await db
    .from("meetings")
    .insert({
      owner_id: ownerId, title: m.title, started_at: m.started_at, duration_ms: m.duration_ms,
      source: "seed", media_key: mediaKey, media_kind: "video", status: skipAi ? "ready" : "processing",
    })
    .select()
    .single();
  if (error) throw error;

  const { data: people, error: pErr } = await db
    .from("participants")
    .insert(m.participants.map((p, idx) => ({ meeting_id: meeting.id, name: p.name, color: p.color, idx })))
    .select();
  if (pErr) throw pErr;
  const byShort = new Map(m.participants.map((p, i) => [p.short, people.find((x) => x.idx === i)!.id]));

  const rows = m.segments.map((s, idx) => ({
    meeting_id: meeting.id, participant_id: byShort.get(s.speaker), idx,
    start_ms: s.start_ms, end_ms: s.end_ms, text: s.text,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error: sErr } = await db.from("transcript_segments").insert(rows.slice(i, i + 500));
    if (sErr) throw sErr;
  }
  console.log(`  ${m.slug}: ${rows.length} lines, ${people.length} speakers`);

  await addHighlights(ownerId, meeting.id, m.slug, m);
  if (!skipAi) {
    await processMeeting(db, restAi, meeting.id, (msg) => console.log(`  ${m.slug}: ${msg}`), EXTRA_TEMPLATES[m.slug] ?? []);
  }
}

const ownerId = await ensureUser(TEMPLATE_EMAIL, crypto.randomUUID() + crypto.randomUUID());
await ensureUser(DEMO_EMAIL, devVars.DEMO_PASSWORD);
console.log(`template user ${TEMPLATE_EMAIL} → ${ownerId}`);
const all = readdirSync(OUT).filter((d) => existsSync(join(OUT, d, "meeting.json")));
for (const slug of slugs.length ? slugs : all) {
  const m = JSON.parse(readFileSync(join(OUT, slug, "meeting.json"), "utf8")) as Rendered;
  await seedMeeting(ownerId, m);
}
const { data: copied, error: resetErr } = await db.rpc("reset_demo");
if (resetErr) throw resetErr;
console.log(`demo account reset: ${copied} meetings copied from the template`);
