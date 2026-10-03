/**
 * Loads rendered seed meetings into Supabase + R2 for the demo account, then runs the same
 * AI pipeline the Worker uses (chapters, summaries for every template, action items).
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
import { DEMO_EMAIL, DEMO_NAME } from "../../shared/demo.ts";
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

async function ensureDemoUser(): Promise<string> {
  const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const existing = data.users.find((u) => u.email === DEMO_EMAIL);
  if (existing) {
    await db.auth.admin.updateUserById(existing.id, { password: devVars.DEMO_PASSWORD });
    return existing.id;
  }
  const created = await db.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: devVars.DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: DEMO_NAME },
  });
  if (created.error) throw created.error;
  return created.data.user.id;
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

  if (!skipAi) {
    await processMeeting(db, restAi, meeting.id, (msg) => console.log(`  ${m.slug}: ${msg}`), EXTRA_TEMPLATES[m.slug] ?? []);
  }
}

const ownerId = await ensureDemoUser();
console.log(`demo user ${DEMO_EMAIL} → ${ownerId}`);
const all = readdirSync(OUT).filter((d) => existsSync(join(OUT, d, "meeting.json")));
for (const slug of slugs.length ? slugs : all) {
  const m = JSON.parse(readFileSync(join(OUT, slug, "meeting.json"), "utf8")) as Rendered;
  await seedMeeting(ownerId, m);
}
console.log("done");
