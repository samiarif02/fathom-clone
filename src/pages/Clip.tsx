import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { Loader2, Pause, Play, RotateCcw } from "lucide-react";
import clsx from "clsx";
import { usePlayer, activeIndex } from "../lib/player";
import { clock, dateTime } from "../lib/format";
import type { Participant, Segment } from "../lib/types";
import { Avatar } from "../components/Avatar";

type ClipData = {
  clip: { start_ms: number; end_ms: number; note: string; created_at: string };
  meeting: { title: string; started_at: string; media_kind: string };
  media_url: string;
  segments: Segment[];
  participants: Participant[];
};

/** Public, signed-out page for a shared highlight. Playback is held inside the clip window. */
export default function Clip() {
  const { token } = useParams();
  const [data, setData] = useState<ClipData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const player = usePlayer();

  useEffect(() => {
    fetch(`/api/public/clips/${token}`)
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error((await r.json()).error))))
      .then(setData)
      .catch((e) => setError(e.message));
  }, [token]);

  useEffect(() => {
    if (data) player.seek(data.clip.start_ms, false);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep playback inside [start, end].
  useEffect(() => {
    if (!data) return;
    const { start_ms, end_ms } = data.clip;
    if (player.ms >= end_ms && player.playing) { player.ref.current?.pause(); player.seek(end_ms, false); }
    if (player.ms < start_ms - 250) player.seek(start_ms, player.playing);
  }, [player.ms, data]); // eslint-disable-line react-hooks/exhaustive-deps

  const people = useMemo(() => new Map((data?.participants ?? []).map((p) => [p.id, p])), [data]);

  if (error)
    return (
      <Shell>
        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center">
          <p className="font-medium">Clip unavailable</p>
          <p className="mt-1 text-sm text-zinc-500">{error}</p>
        </div>
      </Shell>
    );
  if (!data) return <Shell><div className="grid h-64 place-items-center text-zinc-400"><Loader2 className="size-5 animate-spin" /></div></Shell>;

  const { clip, meeting } = data;
  const length = clip.end_ms - clip.start_ms;
  const progress = Math.min(1, Math.max(0, (player.ms - clip.start_ms) / length));
  const ended = player.ms >= clip.end_ms - 100;
  const active = activeIndex(data.segments, player.ms);

  return (
    <Shell>
      <p className="text-xs font-medium uppercase tracking-wide text-amber-600">Shared clip</p>
      <h1 className="mt-1 text-xl font-semibold tracking-tight">{clip.note || "Highlight"}</h1>
      <p className="mt-1 text-sm text-zinc-500">From “{meeting.title}” · {dateTime(meeting.started_at)}</p>

      <div className="mt-5 overflow-hidden rounded-xl bg-zinc-900 shadow-sm">
        <video ref={player.setRef} src={`${data.media_url}#t=${clip.start_ms / 1000},${clip.end_ms / 1000}`} preload="auto" playsInline
          onClick={player.toggle} className="aspect-video w-full cursor-pointer bg-black" />
        <div className="flex items-center gap-3 px-4 py-3 text-white">
          <button
            onClick={() => (ended ? player.seek(clip.start_ms) : player.toggle())}
            className="grid size-9 place-items-center rounded-full bg-white text-zinc-900 hover:bg-zinc-200"
            aria-label={ended ? "Replay" : player.playing ? "Pause" : "Play"}
          >
            {ended ? <RotateCcw className="size-4" /> : player.playing ? <Pause className="size-4 fill-current" /> : <Play className="ml-0.5 size-4 fill-current" />}
          </button>
          <div
            className="relative h-1.5 flex-1 cursor-pointer rounded-full bg-white/20"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              player.seek(clip.start_ms + ((e.clientX - r.left) / r.width) * length, player.playing);
            }}
          >
            <div style={{ width: `${progress * 100}%` }} className="absolute inset-y-0 left-0 rounded-full bg-amber-400" />
          </div>
          <span className="text-xs tabular-nums text-white/70">{clock(Math.max(0, player.ms - clip.start_ms))} / {clock(length)}</span>
        </div>
      </div>

      {data.segments.length > 0 && (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-2">
          {data.segments.map((s, i) => {
            const p = people.get(s.participant_id ?? "");
            return (
              <button key={s.idx} onClick={() => player.seek(Math.max(clip.start_ms, s.start_ms))}
                className={clsx("flex w-full gap-3 rounded-lg px-2 py-2 text-left", i === active ? "bg-amber-50" : "hover:bg-zinc-50")}>
                <Avatar name={p?.name ?? "Speaker"} color={p?.color ?? "#71717a"} size="sm" />
                <span className="min-w-0">
                  <span className="text-xs font-semibold text-zinc-800">{p?.name ?? "Speaker"}</span>
                  <span className={clsx("block text-sm leading-relaxed", i === active ? "text-zinc-900" : "text-zinc-600")}>{s.text}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <img src="/favicon.svg" alt="" className="size-6" /> Fathom Clone
          </Link>
          <Link to="/login" className="text-sm font-medium text-brand-600 hover:text-brand-700">Try it free</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </div>
  );
}
