import { useState } from "react";
import { Check, Eye, Link2, Link2Off, Play, Trash2 } from "lucide-react";
import type { Highlight } from "../../lib/types";
import { clock } from "../../lib/format";
import { getSupabase } from "../../lib/supabase";

export type Draft = { start_ms: number; end_ms: number; note: string };

const parseClock = (v: string) => {
  const parts = v.trim().split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0) * 1000;
};

const newToken = () =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(12)))).replace(/\+/g, "-").replace(/\//g, "_");

export const clipUrl = (token: string) => `${location.origin}/c/${token}`;

export function HighlightComposer({ meetingId, draft, ms, duration, onChange, onCancel, onSaved }: {
  meetingId: string; draft: Draft; ms: number; duration: number;
  onChange: (d: Draft) => void; onCancel: () => void; onSaved: (h: Highlight) => void;
}) {
  const [start, setStart] = useState(clock(draft.start_ms));
  const [end, setEnd] = useState(clock(draft.end_ms));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (which: "start" | "end", value: string) => {
    (which === "start" ? setStart : setEnd)(value);
    const parsed = parseClock(value);
    if (parsed != null) onChange({ ...draft, [which === "start" ? "start_ms" : "end_ms"]: Math.min(duration, parsed) });
  };

  async function save() {
    if (draft.end_ms <= draft.start_ms) return setError("End must be after start.");
    setBusy(true);
    const sb = await getSupabase();
    const { data: { user } } = await sb.auth.getUser();
    const { data, error } = await sb
      .from("highlights")
      .insert({ meeting_id: meetingId, created_by: user!.id, start_ms: Math.round(draft.start_ms), end_ms: Math.round(draft.end_ms), note: draft.note.trim() })
      .select()
      .single();
    setBusy(false);
    if (error) return setError(error.message);
    onSaved(data as Highlight);
  }

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-3">
      <div className="flex flex-wrap items-end gap-3">
        {(["start", "end"] as const).map((w) => (
          <label key={w} className="text-xs font-medium text-zinc-600">
            {w === "start" ? "From" : "To"}
            <div className="mt-1 flex items-center gap-1">
              <input value={w === "start" ? start : end} onChange={(e) => set(w, e.target.value)}
                className="w-20 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm tabular-nums outline-none focus:border-amber-500" />
              <button onClick={() => set(w, clock(ms))} className="rounded-md px-1.5 py-1 text-[11px] text-zinc-500 hover:bg-amber-100">now</button>
            </div>
          </label>
        ))}
        <span className="pb-1.5 text-xs text-zinc-500">{Math.max(0, Math.round((draft.end_ms - draft.start_ms) / 1000))}s clip</span>
      </div>
      <input
        autoFocus
        value={draft.note}
        onChange={(e) => onChange({ ...draft, note: e.target.value })}
        onKeyDown={(e) => e.key === "Enter" && save()}
        placeholder="What's this moment? (optional)"
        className="mt-3 w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-amber-500"
      />
      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-amber-100">Cancel</button>
        <button onClick={save} disabled={busy} className="rounded-md bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-60">Save highlight</button>
      </div>
    </div>
  );
}

export function HighlightList({ highlights, onSeek, onChange }: {
  highlights: Highlight[]; onSeek: (ms: number) => void; onChange: (h: Highlight[]) => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  async function share(h: Highlight) {
    const sb = await getSupabase();
    const token = h.share_token ?? newToken();
    if (!h.share_token) {
      const { error } = await sb.from("highlights").update({ share_token: token }).eq("id", h.id);
      if (error) return console.error(error.message);
      onChange(highlights.map((x) => (x.id === h.id ? { ...x, share_token: token } : x)));
    }
    // The link is shown under the highlight either way; copying is a convenience.
    try {
      await navigator.clipboard.writeText(clipUrl(token));
      setCopied(h.id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard blocked (e.g. window not focused) */
    }
  }

  async function unshare(h: Highlight) {
    const sb = await getSupabase();
    await sb.from("highlights").update({ share_token: null }).eq("id", h.id);
    onChange(highlights.map((x) => (x.id === h.id ? { ...x, share_token: null } : x)));
  }

  async function remove(h: Highlight) {
    const sb = await getSupabase();
    await sb.from("highlights").delete().eq("id", h.id);
    onChange(highlights.filter((x) => x.id !== h.id));
  }

  if (!highlights.length)
    return <p className="text-sm text-zinc-500">No highlights yet. Hover a transcript line and click the star, or use “Highlight” under the player.</p>;

  return (
    <ul className="space-y-2">
      {highlights.map((h) => (
        <li key={h.id} className="flex items-start gap-3 rounded-lg border border-zinc-200 bg-white p-3">
          <button onClick={() => onSeek(h.start_ms)} className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700 hover:bg-amber-200" aria-label="Play highlight">
            <Play className="size-3.5 fill-current" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-zinc-800">{h.note || "Untitled highlight"}</p>
            <p className="mt-0.5 text-xs tabular-nums text-zinc-500">
              {clock(h.start_ms)}–{clock(h.end_ms)}
              {h.share_token && <span className="ml-2 inline-flex items-center gap-1"><Eye className="size-3" />{h.view_count} views</span>}
            </p>
            {h.share_token && (
              <a href={clipUrl(h.share_token)} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs text-brand-600 hover:underline">{clipUrl(h.share_token)}</a>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button onClick={() => share(h)} className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
              {copied === h.id ? <><Check className="size-3.5 text-emerald-600" /> Link copied</> : <><Link2 className="size-3.5" /> {h.share_token ? "Copy link" : "Share clip"}</>}
            </button>
            {h.share_token && (
              <button onClick={() => unshare(h)} className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" title="Turn off public link" aria-label="Turn off public link">
                <Link2Off className="size-3.5" />
              </button>
            )}
            <button onClick={() => remove(h)} className="rounded-md p-1.5 text-zinc-400 hover:bg-rose-50 hover:text-rose-600" title="Delete highlight" aria-label="Delete highlight">
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
