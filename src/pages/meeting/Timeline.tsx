import { useRef, useState } from "react";
import type { Chapter, Highlight } from "../../lib/types";
import { clock } from "../../lib/format";

const CHAPTER_COLORS = ["bg-brand-500", "bg-sky-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-violet-500", "bg-teal-500", "bg-orange-500", "bg-fuchsia-500"];

/** Chapter strip + highlight markers + playhead. Click or hover anywhere to seek / preview. */
export function Timeline({ duration, ms, chapters, highlights, onSeek }: {
  duration: number; ms: number; chapters: Chapter[]; highlights: Highlight[]; onSeek: (ms: number) => void;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const at = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect();
    return Math.min(duration, Math.max(0, ((clientX - r.left) / r.width) * duration));
  };
  const pct = (x: number) => `${(x / duration) * 100}%`;
  const hoverChapter = hover != null ? chapters.find((c) => hover >= c.start_ms && hover < c.end_ms) : null;

  return (
    <div className="select-none">
      <div
        ref={bar}
        className="relative h-7 cursor-pointer"
        onClick={(e) => onSeek(at(e.clientX))}
        onMouseMove={(e) => setHover(at(e.clientX))}
        onMouseLeave={() => setHover(null)}
      >
        <div className="absolute inset-x-0 top-2.5 flex h-2 gap-0.5 overflow-hidden rounded-full">
          {chapters.length ? (
            chapters.map((c, i) => (
              <div key={c.id} style={{ width: pct(c.end_ms - c.start_ms) }} className={`${CHAPTER_COLORS[i % CHAPTER_COLORS.length]} opacity-70 first:rounded-l-full last:rounded-r-full`} />
            ))
          ) : (
            <div className="w-full bg-zinc-300" />
          )}
        </div>
        {highlights.map((h) => (
          <div key={h.id} title={h.note || "Highlight"} style={{ left: pct(h.start_ms), width: `max(4px, ${pct(h.end_ms - h.start_ms)})` }}
            className="absolute top-1 h-5 rounded-sm bg-amber-400/80 ring-1 ring-amber-500" />
        ))}
        <div style={{ left: pct(ms) }} className="pointer-events-none absolute top-0 h-7 w-0.5 -translate-x-1/2 rounded bg-zinc-900" />
        {hover != null && (
          <div style={{ left: pct(hover) }} className="pointer-events-none absolute -top-8 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1 text-[11px] text-white shadow">
            {clock(hover)}{hoverChapter ? ` · ${hoverChapter.title}` : ""}
          </div>
        )}
      </div>
    </div>
  );
}

export { CHAPTER_COLORS };
