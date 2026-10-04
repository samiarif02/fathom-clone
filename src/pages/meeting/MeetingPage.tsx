import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { ArrowLeft, Clock, Eye, Loader2, Pause, Play, Star, Users } from "lucide-react";
import clsx from "clsx";
import { getMeeting } from "../../lib/data";
import { api } from "../../lib/api";
import { usePlayer, activeIndex } from "../../lib/player";
import { clock, dateTime, duration } from "../../lib/format";
import type { MeetingDetail } from "../../lib/types";
import { AvatarStack } from "../../components/Avatar";
import { Timeline, CHAPTER_COLORS } from "./Timeline";
import { Speakers } from "./Speakers";
import { Transcript } from "./Transcript";
import { Summary } from "./Summary";
import { HighlightComposer, HighlightList, type Draft } from "./Highlights";
import { AskPanel } from "../../components/AskPanel";
import { ShareMeeting } from "./ShareMeeting";

type Tab = "summary" | "transcript" | "ask";

/** The meeting page. With `shareToken` it renders the signed-out, view-only version of a shared meeting. */
export default function MeetingPage({ shareToken }: { shareToken?: string } = {}) {
  const readOnly = !!shareToken;
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(params.has("t") ? "transcript" : "summary");
  const [template, setTemplate] = useState(params.get("template") ?? "general");
  const [focus, setFocus] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const player = usePlayer();

  useEffect(() => {
    let live = true;
    if (shareToken) {
      fetch(`/api/public/meetings/${shareToken}`)
        .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error((await r.json().catch(() => ({}))).error ?? "This meeting link isn't available."))))
        .then((d: { meeting: MeetingDetail; media_url: string | null }) => { if (live) { setMeeting(d.meeting); setMediaUrl(d.media_url); } })
        .catch((e) => live && setError(e.message));
      return () => { live = false; };
    }
    const load = () =>
      getMeeting(id!)
        .then((m) => { if (live) setMeeting(m); return m; })
        .catch((e) => live && setError(e.message));
    load();
    api<{ url: string }>(`/meetings/${id}/media-url`).then((r) => live && setMediaUrl(r.url)).catch(() => {});
    return () => { live = false; };
  }, [id, shareToken]);

  // Fresh upload: drive the resumable pipeline (transcribe, then chapters + notes) one step at a
  // time, and poll while another tab holds a step. Leaving and coming back picks up where it was.
  useEffect(() => {
    if (readOnly || meeting?.status !== "processing") return;
    let live = true;
    const step = async () => {
      if (meeting.stage === "transcribe" || meeting.stage === "analyze") {
        await api(`/meetings/${id}/process`, { method: "POST" }).catch(() => {});
      } else {
        await new Promise((r) => setTimeout(r, 5000));
      }
      if (!live) return;
      const fresh = await getMeeting(id!);
      if (live) setMeeting(fresh);
      if (fresh.status === "ready") api<{ url: string }>(`/meetings/${id}/media-url`).then((r) => live && setMediaUrl(r.url)).catch(() => {});
    };
    step();
    return () => { live = false; };
  }, [meeting?.status, meeting?.stage, id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deep link from search or a shared moment: ?t=<ms>
  useEffect(() => {
    const t = Number(params.get("t"));
    if (meeting && Number.isFinite(t) && params.has("t")) player.seek(t, false);
  }, [meeting?.id, mediaUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard: space toggles playback, ←/→ skip 5s (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as Element | null)?.closest?.("input,textarea,button,[contenteditable]")) return;
      if (e.key === " ") { e.preventDefault(); player.toggle(); }
      if (e.key === "ArrowRight") player.seek(player.ms + 5000, !player.ref.current?.paused);
      if (e.key === "ArrowLeft") player.seek(Math.max(0, player.ms - 5000), !player.ref.current?.paused);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [player]);

  const chapterNow = useMemo(
    () => meeting?.chapters.find((c) => player.ms >= c.start_ms && player.ms < c.end_ms),
    [meeting?.chapters, player.ms],
  );

  if (error)
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="font-medium">This meeting isn't available</p>
        <p className="mt-1 text-sm text-zinc-500">{readOnly ? error : "It may have been removed, or it belongs to another account."}</p>
        <Link to={readOnly ? "/" : "/meetings"} className="mt-4 inline-block text-sm font-medium text-brand-600 hover:text-brand-700">{readOnly ? "Go to Fathom Clone" : "Back to all meetings"}</Link>
      </div>
    );
  if (!meeting) return <div className="grid h-full place-items-center text-zinc-400"><Loader2 className="size-5 animate-spin" /></div>;

  const seek = (ms: number) => player.seek(ms);
  const speaking = meeting.segments[activeIndex(meeting.segments, player.ms)];
  const speaker = meeting.participants.find((p) => p.id === speaking?.participant_id);
  const pickTemplate = (t: string) => {
    setTemplate(t);
    const next = new URLSearchParams(params);
    next.set("template", t);
    setParams(next, { replace: true });
  };

  return (
    <div className="lg:grid lg:h-full lg:grid-cols-[minmax(0,1fr)_440px] xl:grid-cols-[minmax(0,1fr)_500px]">
      {/* Left: player, timeline, speakers, chapters, highlights */}
      <div className="min-w-0 lg:overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-5 px-4 py-5 md:px-6">
          <header>
            {readOnly ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600">
                <Eye className="size-3.5" /> Shared meeting · view only
              </span>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <Link to="/meetings" className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-800">
                  <ArrowLeft className="size-3.5" /> All meetings
                </Link>
                {meeting.status === "ready" && (
                  <ShareMeeting meetingId={meeting.id} token={meeting.share_token ?? null} views={meeting.share_views ?? 0}
                    onChange={(share_token) => setMeeting({ ...meeting, share_token })} />
                )}
              </div>
            )}
            <h1 className="mt-2 text-xl font-semibold tracking-tight">{meeting.title}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
              <span>{dateTime(meeting.started_at)}</span>
              <span className="inline-flex items-center gap-1"><Clock className="size-3" />{duration(meeting.duration_ms)}</span>
              <span className="inline-flex items-center gap-1.5"><Users className="size-3" />{meeting.participants.length} people <AvatarStack people={meeting.participants} max={8} /></span>
            </div>
          </header>

          {meeting.status === "processing" && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <Loader2 className="size-4 animate-spin" />
              {meeting.stage === "uploading" ? "Waiting for the upload to finish." : meeting.stage.startsWith("transcrib") ? "Transcribing and labelling speakers…" : "Finding chapters and writing notes…"} This page updates on its own.
            </div>
          )}
          {meeting.status === "failed" && (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">Processing failed: {meeting.error}</div>
          )}

          <div className="overflow-hidden rounded-xl bg-zinc-900 shadow-sm">
            {meeting.media_kind === "audio" ? (
              <div className="flex aspect-[3/1] items-center justify-center text-zinc-400">
                <audio ref={player.setRef} src={mediaUrl ?? undefined} preload="metadata" />
                {speaker ? <span className="text-lg font-medium text-white">{speaker.name}</span> : "Audio recording"}
              </div>
            ) : (
              <video ref={player.setRef} src={mediaUrl ?? undefined} preload="metadata" controls playsInline className="aspect-video w-full bg-black" />
            )}
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-3">
              <button onClick={player.toggle} className="grid size-8 shrink-0 place-items-center rounded-full bg-zinc-900 text-white hover:bg-zinc-700" aria-label={player.playing ? "Pause" : "Play"}>
                {player.playing ? <Pause className="size-3.5 fill-current" /> : <Play className="ml-0.5 size-3.5 fill-current" />}
              </button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{chapterNow?.title ?? "Timeline"}</div>
                <div className="truncate text-xs text-zinc-500">
                  <span className="tabular-nums">{clock(player.ms)} / {clock(meeting.duration_ms)}</span>
                  {speaker && <> · {speaker.name} speaking</>}
                </div>
              </div>
              {!readOnly && <button
                onClick={() => setDraft({ start_ms: Math.max(0, player.ms - 15000), end_ms: Math.min(meeting.duration_ms, player.ms + 15000), note: "" })}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100"
              >
                <Star className="size-4" /> Highlight
              </button>}
            </div>
            <Timeline duration={meeting.duration_ms} ms={player.ms} chapters={meeting.chapters} highlights={meeting.highlights} onSeek={seek} />
            {draft && !readOnly && (
              <div className="mt-3">
                <HighlightComposer
                  meetingId={meeting.id} draft={draft} ms={player.ms} duration={meeting.duration_ms}
                  onChange={setDraft} onCancel={() => setDraft(null)}
                  onSaved={(h) => { setDraft(null); setMeeting({ ...meeting, highlights: [...meeting.highlights, h].sort((a, b) => a.start_ms - b.start_ms) }); }}
                />
              </div>
            )}
          </div>

          {meeting.chapters.length > 0 && (
            <Card title="Chapters" subtitle={`${meeting.chapters.length} topics`}>
              <ol className="space-y-1">
                {meeting.chapters.map((c, i) => {
                  const current = chapterNow?.id === c.id;
                  return (
                    <li key={c.id}>
                      <button onClick={() => seek(c.start_ms)} className={clsx("flex w-full gap-3 rounded-lg px-2 py-2 text-left", current ? "bg-brand-50" : "hover:bg-zinc-50")}>
                        <span className={`mt-1.5 size-2 shrink-0 rounded-full ${CHAPTER_COLORS[i % CHAPTER_COLORS.length]}`} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-3">
                            <span className="text-sm font-medium text-zinc-900">{c.title}</span>
                            <span className="shrink-0 text-xs tabular-nums text-zinc-500">{clock(c.start_ms)} · {Math.max(1, Math.round((c.end_ms - c.start_ms) / 60000))} min</span>
                          </span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-zinc-600">{c.gist}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </Card>
          )}

          <Card title="Speakers" subtitle="Talk time, and when each person spoke. Use the arrows to jump between someone's turns.">
            <Speakers
              participants={meeting.participants} segments={meeting.segments} duration={meeting.duration_ms} ms={player.ms}
              onSeek={seek} focus={focus} onFocus={(f) => { setFocus(f); if (f) setTab("transcript"); }}
              onRename={readOnly ? undefined : (pid, name) => setMeeting({ ...meeting, participants: meeting.participants.map((p) => (p.id === pid ? { ...p, name } : p)) })}
            />
          </Card>

          {(!readOnly || meeting.highlights.length > 0) && (
            <Card title="Highlights" subtitle={readOnly ? "Key moments picked out by the person who shared this meeting." : "Clips you can share with anyone, even if they're signed out."}>
              <HighlightList highlights={meeting.highlights} onSeek={seek} readOnly={readOnly} onChange={(highlights) => setMeeting({ ...meeting, highlights })} />
            </Card>
          )}
        </div>
      </div>

      {/* Right: notes and transcript */}
      <aside className="flex min-h-[70vh] flex-col border-t border-zinc-200 bg-white lg:h-full lg:min-h-0 lg:border-l lg:border-t-0">
        <div className="flex border-b border-zinc-200 px-2">
          {(readOnly ? (["summary", "transcript"] as const) : (["summary", "transcript", "ask"] as const)).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={clsx("relative px-4 py-3 text-sm font-medium capitalize", tab === t ? "text-zinc-900" : "text-zinc-500 hover:text-zinc-800")}>
              {t === "summary" ? "AI notes" : t === "transcript" ? "Transcript" : "Ask"}
              {tab === t && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded bg-brand-600" />}
            </button>
          ))}
        </div>
        <div className={clsx("min-h-0 flex-1", tab === "ask" ? "flex flex-col" : "overflow-y-auto")}>
          {tab === "ask" ? (
            <AskPanel fixedMeetingId={meeting.id} className="min-h-[60vh] flex-1 lg:min-h-0" />
          ) : tab === "summary" ? (
            <Summary
              meetingId={meeting.id} summaries={meeting.summaries} actionItems={meeting.action_items} participants={meeting.participants}
              template={template} onTemplate={pickTemplate} onSeek={seek}
              onSummary={(s) => setMeeting({ ...meeting, summaries: [...meeting.summaries.filter((x) => x.template !== s.template), s] })}
              onActionItems={(action_items) => setMeeting({ ...meeting, action_items })}
              readOnly={readOnly}
            />
          ) : (
            <Transcript
              segments={meeting.segments} participants={meeting.participants} ms={player.ms} onSeek={seek}
              focus={focus} onClearFocus={() => setFocus(null)}
              onHighlightLine={readOnly ? undefined : (s) => setDraft({ start_ms: s.start_ms, end_ms: s.end_ms, note: "" })}
            />
          )}
        </div>
      </aside>
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-zinc-500">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}
