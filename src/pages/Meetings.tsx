import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { CheckSquare, Clock, FileText, Loader2, MessageSquareText, Search, Sparkles, Star, X } from "lucide-react";
import { listMeetings, search } from "../lib/data";
import { clock, dateTime, dayGroup, duration } from "../lib/format";
import type { MeetingSummaryRow, SearchHit } from "../lib/types";
import { AvatarStack } from "../components/Avatar";
import { Snippet } from "../components/Snippet";

export default function Meetings() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const [input, setInput] = useState(q);
  const [meetings, setMeetings] = useState<MeetingSummaryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listMeetings().then(setMeetings).catch((e) => setError(e.message));
  }, []);

  // Debounce typing into the ?q= param so results are shareable and survive back/forward.
  useEffect(() => {
    const t = setTimeout(() => {
      if (input.trim() !== q) setParams(input.trim() ? { q: input.trim() } : {}, { replace: true });
    }, 250);
    return () => clearTimeout(t);
  }, [input, q, setParams]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Meetings</h1>
        <Link to="/new" className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700">
          New recording
        </Link>
      </div>

      <div className="relative mt-5">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search titles, transcripts and summaries across all meetings"
          className="w-full rounded-xl border border-zinc-200 bg-white py-3 pl-10 pr-10 text-sm shadow-sm outline-none placeholder:text-zinc-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
        {input && (
          <button onClick={() => setInput("")} className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-400 hover:text-zinc-700" aria-label="Clear search">
            <X className="size-4" />
          </button>
        )}
      </div>

      {error && <p className="mt-6 text-sm text-rose-600">{error}</p>}
      {q ? <SearchResults q={q} /> : <MeetingList meetings={meetings} />}
    </div>
  );
}

function MeetingList({ meetings }: { meetings: MeetingSummaryRow[] | null }) {
  const groups = useMemo(() => {
    const map = new Map<string, MeetingSummaryRow[]>();
    for (const m of meetings ?? []) {
      const g = dayGroup(m.started_at);
      map.set(g, [...(map.get(g) ?? []), m]);
    }
    return [...map];
  }, [meetings]);

  if (!meetings) return <ListSkeleton />;
  if (!meetings.length)
    return (
      <div className="mt-16 text-center text-sm text-zinc-500">
        No meetings yet. <Link to="/new" className="font-medium text-brand-600">Upload or record one</Link>.
      </div>
    );

  return (
    <div className="mt-6 space-y-8">
      {groups.map(([label, items]) => (
        <section key={label}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</h2>
          <div className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
            {items.map((m) => <MeetingRow key={m.id} m={m} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

function MeetingRow({ m }: { m: MeetingSummaryRow }) {
  const actions = m.action_items[0]?.count ?? 0;
  const highlights = m.highlights[0]?.count ?? 0;
  return (
    <Link to={`/meetings/${m.id}`} className="group flex gap-4 px-4 py-4 hover:bg-zinc-50 md:px-5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate font-medium text-zinc-900 group-hover:text-brand-700">{m.title}</h3>
          {m.status === "processing" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
              <Loader2 className="size-3 animate-spin" /> Processing
            </span>
          )}
          {m.status === "failed" && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">Failed</span>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
          <span>{dateTime(m.started_at)}</span>
          <span className="inline-flex items-center gap-1"><Clock className="size-3" />{duration(m.duration_ms)}</span>
          {actions > 0 && <span className="inline-flex items-center gap-1"><CheckSquare className="size-3" />{actions} action items</span>}
          {highlights > 0 && <span className="inline-flex items-center gap-1"><Star className="size-3" />{highlights} highlights</span>}
        </div>
        {m.overview && <p className="mt-2 line-clamp-2 text-sm text-zinc-600">{m.overview}</p>}
      </div>
      <div className="hidden shrink-0 pt-0.5 sm:block">
        <AvatarStack people={m.participants} />
      </div>
    </Link>
  );
}

const KIND = {
  title: { icon: FileText, label: "Title" },
  transcript: { icon: MessageSquareText, label: "Transcript" },
  summary: { icon: Sparkles, label: "Summary" },
} as const;

function SearchResults({ q }: { q: string }) {
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setHits(null);
    search(q).then((h) => live && setHits(h)).catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [q]);

  const grouped = useMemo(() => {
    const map = new Map<string, { title: string; started_at: string; hits: SearchHit[] }>();
    for (const h of hits ?? []) {
      const g = map.get(h.meeting_id) ?? { title: h.meeting_title, started_at: h.started_at, hits: [] };
      g.hits.push(h);
      map.set(h.meeting_id, g);
    }
    return [...map];
  }, [hits]);

  if (error) return <p className="mt-6 text-sm text-rose-600">{error}</p>;
  if (!hits) return <ListSkeleton />;
  if (!hits.length) return <p className="mt-10 text-center text-sm text-zinc-500">No matches for “{q}”.</p>;

  return (
    <div className="mt-6 space-y-4">
      <p className="text-xs text-zinc-500">
        {hits.length} {hits.length === 1 ? "match" : "matches"} in {grouped.length} {grouped.length === 1 ? "meeting" : "meetings"}
      </p>
      {grouped.map(([id, g]) => (
        <section key={id} className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <Link to={`/meetings/${id}`} className="flex items-baseline justify-between gap-3 border-b border-zinc-100 px-4 py-3 hover:bg-zinc-50">
            <span className="font-medium">{g.title}</span>
            <span className="shrink-0 text-xs text-zinc-500">{dateTime(g.started_at)}</span>
          </Link>
          <ul className="divide-y divide-zinc-50">
            {g.hits.slice(0, 6).map((h, i) => {
              const K = KIND[h.kind];
              const to = h.at_ms != null ? `/meetings/${id}?t=${h.at_ms}` : h.kind === "summary" ? `/meetings/${id}?template=${h.speaker}` : `/meetings/${id}`;
              return (
                <li key={i}>
                  <Link to={to} className="flex gap-3 px-4 py-2.5 text-sm hover:bg-brand-50/50">
                    <span className="mt-0.5 inline-flex w-24 shrink-0 items-center gap-1.5 text-xs text-zinc-500">
                      <K.icon className="size-3.5" />
                      {h.at_ms != null ? clock(h.at_ms) : K.label}
                    </span>
                    <span className="min-w-0 text-zinc-700">
                      {h.kind === "transcript" && h.speaker && <span className="font-medium text-zinc-900">{h.speaker}: </span>}
                      <Snippet html={h.snippet} />
                    </span>
                  </Link>
                </li>
              );
            })}
            {g.hits.length > 6 && (
              <li className="px-4 py-2 text-xs text-zinc-500">
                <Link to={`/meetings/${id}`} className="hover:text-brand-700">+{g.hits.length - 6} more in this meeting</Link>
              </li>
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="mt-6 space-y-3">
      {[0, 1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-zinc-200/60" />)}
    </div>
  );
}
