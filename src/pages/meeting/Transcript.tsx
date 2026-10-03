import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, ChevronDown, ChevronUp, Search, Star, X } from "lucide-react";
import clsx from "clsx";
import type { Participant, Segment } from "../../lib/types";
import { activeIndex } from "../../lib/player";
import { Avatar } from "../../components/Avatar";
import { clock } from "../../lib/format";

export function Transcript({ segments, participants, ms, onSeek, focus, onClearFocus, onHighlightLine }: {
  segments: Segment[]; participants: Participant[]; ms: number; onSeek: (ms: number) => void;
  focus: string | null; onClearFocus: () => void; onHighlightLine: (s: Segment) => void;
}) {
  const people = useMemo(() => new Map(participants.map((p) => [p.id, p])), [participants]);
  const [query, setQuery] = useState("");
  const [matchCursor, setMatchCursor] = useState(0);
  const [follow, setFollow] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);
  const rows = useRef(new Map<number, HTMLDivElement>());

  const active = activeIndex(segments, ms);
  const visible = focus ? segments.filter((s) => s.participant_id === focus) : segments;
  const q = query.trim().toLowerCase();
  const matches = useMemo(() => (q.length > 1 ? visible.filter((s) => s.text.toLowerCase().includes(q)).map((s) => s.idx) : []), [visible, q]);

  const scrollTo = (idx: number) => {
    const el = rows.current.get(idx);
    const box = scroller.current;
    if (!el || !box) return;
    const top = el.offsetTop - box.clientHeight / 3;
    // Long jumps (a seek, opening the tab) snap; line-to-line follow glides.
    box.scrollTo({ top, behavior: Math.abs(box.scrollTop - top) > box.clientHeight * 1.5 ? "auto" : "smooth" });
  };

  // Follow along: keep the line being spoken in view, unless the reader scrolled away.
  useEffect(() => {
    if (follow && !q && active >= 0) scrollTo(segments[active].idx);
  }, [active, follow, q]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (matches.length) scrollTo(matches[Math.min(matchCursor, matches.length - 1)]);
  }, [matchCursor, matches]); // eslint-disable-line react-hooks/exhaustive-deps

  const focusName = focus ? people.get(focus)?.name : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-zinc-100 px-4 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-zinc-400" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setMatchCursor(0); }}
            onKeyDown={(e) => { if (e.key === "Enter" && matches.length) setMatchCursor((c) => (c + (e.shiftKey ? matches.length - 1 : 1)) % matches.length); }}
            placeholder="Search this transcript"
            className="w-full rounded-lg border border-zinc-200 py-1.5 pl-8 pr-24 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
          {q.length > 1 && (
            <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5 text-xs text-zinc-500">
              <span className="px-1 tabular-nums">{matches.length ? `${Math.min(matchCursor, matches.length - 1) + 1}/${matches.length}` : "0"}</span>
              <button onClick={() => setMatchCursor((c) => (c + matches.length - 1) % Math.max(1, matches.length))} className="rounded p-0.5 hover:bg-zinc-100" aria-label="Previous match"><ChevronUp className="size-3.5" /></button>
              <button onClick={() => setMatchCursor((c) => (c + 1) % Math.max(1, matches.length))} className="rounded p-0.5 hover:bg-zinc-100" aria-label="Next match"><ChevronDown className="size-3.5" /></button>
            </div>
          )}
        </div>
        {focusName && (
          <div className="flex items-center justify-between rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs text-brand-700">
            Showing only {focusName} ({visible.length} turns)
            <button onClick={onClearFocus} className="inline-flex items-center gap-1 font-medium hover:underline"><X className="size-3" /> Show everyone</button>
          </div>
        )}
      </div>

      <div
        ref={scroller}
        className="relative min-h-0 flex-1 overflow-y-auto px-2 py-2"
        onWheel={() => setFollow(false)}
        onTouchMove={() => setFollow(false)}
      >
        {visible.map((s) => {
          const p = people.get(s.participant_id ?? "");
          const isActive = segments[active]?.idx === s.idx;
          const isMatch = q.length > 1 && matches.includes(s.idx);
          return (
            <div
              key={s.id}
              ref={(el) => { if (el) rows.current.set(s.idx, el); else rows.current.delete(s.idx); }}
              onClick={() => { onSeek(s.start_ms); setFollow(true); }}
              className={clsx(
                "group relative flex cursor-pointer gap-3 rounded-lg px-2 py-2 transition-colors",
                isActive ? "bg-brand-50" : "hover:bg-zinc-50",
              )}
            >
              <Avatar name={p?.name ?? "Speaker"} color={p?.color ?? "#71717a"} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold text-zinc-800">{p?.name ?? "Speaker"}</span>
                  <span className="text-[11px] tabular-nums text-zinc-400">{clock(s.start_ms)}</span>
                </div>
                <p className={clsx("text-sm leading-relaxed", isActive ? "text-zinc-900" : "text-zinc-600")}>
                  {isMatch ? <Highlighted text={s.text} q={q} /> : s.text}
                </p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onHighlightLine(s); }}
                className="absolute right-2 top-2 hidden rounded-md bg-white p-1 text-zinc-400 shadow-sm ring-1 ring-zinc-200 hover:text-amber-500 group-hover:block"
                title="Highlight this moment" aria-label="Highlight this moment"
              >
                <Star className="size-3.5" />
              </button>
            </div>
          );
        })}
        {!follow && !q && (
          <button
            onClick={() => { setFollow(true); if (active >= 0) scrollTo(segments[active].idx); }}
            className="sticky bottom-2 left-full mr-2 inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white shadow-lg"
          >
            <ArrowDownToLine className="size-3.5" /> Follow along
          </button>
        )}
      </div>
    </div>
  );
}

function Highlighted({ text, q }: { text: string; q: string }) {
  const parts: React.ReactNode[] = [];
  const lower = text.toLowerCase();
  let i = 0;
  for (let at = lower.indexOf(q); at >= 0; at = lower.indexOf(q, i)) {
    parts.push(text.slice(i, at), <mark key={at}>{text.slice(at, at + q.length)}</mark>);
    i = at + q.length;
  }
  parts.push(text.slice(i));
  return <>{parts}</>;
}
