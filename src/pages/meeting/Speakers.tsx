import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Filter, Pencil } from "lucide-react";
import { getSupabase } from "../../lib/supabase";
import clsx from "clsx";
import type { Participant, Segment } from "../../lib/types";
import { Avatar } from "../../components/Avatar";
import { clock } from "../../lib/format";

/** Talk time per person, a lane showing when each person spoke, and prev/next jumps through their turns. */
export function Speakers({ participants, segments, duration, ms, onSeek, focus, onFocus, onRename }: {
  participants: Participant[]; segments: Segment[]; duration: number; ms: number;
  onSeek: (ms: number) => void; focus: string | null; onFocus: (id: string | null) => void;
  onRename?: (id: string, name: string) => void; // omitted on view-only shared pages
}) {
  const [editing, setEditing] = useState<string | null>(null);
  async function rename(id: string, name: string) {
    setEditing(null);
    const clean = name.trim();
    if (!clean) return;
    onRename?.(id, clean);
    await (await getSupabase()).from("participants").update({ name: clean }).eq("id", id);
  }
  const stats = useMemo(() => {
    const total = segments.reduce((a, s) => a + (s.end_ms - s.start_ms), 0) || 1;
    return participants
      .map((p) => {
        const mine = segments.filter((s) => s.participant_id === p.id);
        const talk = mine.reduce((a, s) => a + (s.end_ms - s.start_ms), 0);
        return { p, mine, talk, share: talk / total, turns: mine.length };
      })
      .sort((a, b) => b.talk - a.talk);
  }, [participants, segments]);

  const jump = (mine: Segment[], dir: 1 | -1) => {
    const target = dir === 1 ? mine.find((s) => s.start_ms > ms + 500) : [...mine].reverse().find((s) => s.start_ms < ms - 1500);
    if (target) onSeek(target.start_ms);
  };

  return (
    <div className="space-y-1">
      {stats.map(({ p, mine, talk, share, turns }) => {
        const speakingNow = mine.some((s) => s.start_ms <= ms && ms < s.end_ms);
        return (
          <div key={p.id} className={clsx("group grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2 py-1.5", focus === p.id ? "bg-brand-50" : "hover:bg-zinc-50")}>
            <div className="flex min-w-0 items-center gap-2">
              <span className={clsx("rounded-full", speakingNow && "ring-2 ring-emerald-400 ring-offset-1")}>
                <Avatar name={p.name} color={p.color} size="sm" />
              </span>
              <div className="min-w-0">
                {editing === p.id ? (
                  <input autoFocus defaultValue={p.name} onBlur={(e) => rename(p.id, e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") rename(p.id, e.currentTarget.value); if (e.key === "Escape") setEditing(null); }}
                    className="w-full rounded border border-brand-400 px-1 text-sm font-medium outline-none" />
                ) : !onRename ? (
                  <span className="block truncate text-sm font-medium leading-tight">{p.name}</span>
                ) : (
                  <button onClick={() => setEditing(p.id)} className="group/name flex max-w-full items-center gap-1 text-left" title="Rename speaker">
                    <span className="truncate text-sm font-medium leading-tight">{p.name}</span>
                    <Pencil className="size-3 shrink-0 text-zinc-400 opacity-0 group-hover/name:opacity-100" />
                  </button>
                )}
                <div className="text-[11px] text-zinc-500">{Math.round(share * 100)}% · {clock(talk)} · {turns} turns</div>
              </div>
            </div>
            <div
              className="relative h-4 cursor-pointer rounded bg-zinc-100"
              title={`When ${p.name} spoke. Click to jump.`}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const t = ((e.clientX - r.left) / r.width) * duration;
                const near = mine.reduce<Segment | null>((best, s) => (!best || Math.abs(s.start_ms - t) < Math.abs(best.start_ms - t) ? s : best), null);
                if (near) onSeek(near.start_ms);
              }}
            >
              {mine.map((s) => (
                <div key={s.id} style={{ left: `${(s.start_ms / duration) * 100}%`, width: `max(2px, ${((s.end_ms - s.start_ms) / duration) * 100}%)`, backgroundColor: p.color }}
                  className="absolute inset-y-0.5 rounded-[2px] opacity-80" />
              ))}
              <div style={{ left: `${(ms / duration) * 100}%` }} className="pointer-events-none absolute -inset-y-0.5 w-px bg-zinc-900/60" />
            </div>
            <div className="flex items-center gap-0.5 text-zinc-500">
              <button onClick={() => jump(mine, -1)} className="rounded p-1 hover:bg-zinc-200 hover:text-zinc-900" title={`Previous time ${p.name} spoke`} aria-label={`Previous time ${p.name} spoke`}>
                <ChevronLeft className="size-4" />
              </button>
              <button onClick={() => jump(mine, 1)} className="rounded p-1 hover:bg-zinc-200 hover:text-zinc-900" title={`Next time ${p.name} spoke`} aria-label={`Next time ${p.name} spoke`}>
                <ChevronRight className="size-4" />
              </button>
              <button onClick={() => onFocus(focus === p.id ? null : p.id)} className={clsx("rounded p-1 hover:bg-zinc-200 hover:text-zinc-900", focus === p.id && "bg-brand-100 text-brand-700")}
                title={focus === p.id ? "Show everyone in the transcript" : `Show only ${p.name} in the transcript`} aria-label={`Filter transcript to ${p.name}`}>
                <Filter className="size-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
