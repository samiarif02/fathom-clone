import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Bot, Circle, FileAudio, MonitorUp, Square, Upload } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import { clock } from "../lib/format";
import { setRecording } from "../lib/alerts";

const CHUNK = 8 * 1024 * 1024;

export default function NewRecording() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const calendarEventId = params.get("event");
  const [mode, setMode] = useState<"upload" | "record">(params.get("mode") === "record" ? "record" : "upload");
  const [title, setTitle] = useState(
    params.get("title") ?? `Recording ${new Date().toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`,
  );
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(blob: Blob, source: "upload" | "browser", durationMs?: number) {
    setError(null);
    setProgress(0);
    try {
      const contentType = blob.type || "video/webm";
      const { meetingId, uploadId } = await api<{ meetingId: string; uploadId: string }>("/uploads", {
        method: "POST",
        body: JSON.stringify({ title, contentType, size: blob.size, source, durationMs, calendarEventId }),
      });
      const parts: { partNumber: number; etag: string }[] = [];
      const total = Math.max(1, Math.ceil(blob.size / CHUNK));
      for (let i = 0; i < total; i++) {
        const part = await api<{ partNumber: number; etag: string }>(`/uploads/${meetingId}/parts/${i + 1}?uploadId=${encodeURIComponent(uploadId)}`, {
          method: "PUT",
          body: blob.slice(i * CHUNK, (i + 1) * CHUNK),
        });
        parts.push(part);
        setProgress((i + 1) / total);
      }
      await api(`/uploads/${meetingId}/complete`, { method: "POST", body: JSON.stringify({ uploadId, parts, durationMs }) });
      navigate(`/meetings/${meetingId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setProgress(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-xl font-semibold tracking-tight">New recording</h1>

      <div className="mt-4 flex gap-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
        <Bot className="mt-0.5 size-4 shrink-0" />
        <p>
          The meeting bot is stubbed in this build. Instead of a notetaker joining Zoom, Meet or Teams, upload a recording or record a
          browser tab. Everything after capture is real: transcription with speaker labels, chapters, AI notes, action items, search and clips.
        </p>
      </div>

      <label className="mt-6 block text-sm font-medium text-zinc-700">
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
      </label>

      <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl bg-zinc-100 p-1">
        {([["upload", "Upload a file", Upload], ["record", "Record a tab", MonitorUp]] as const).map(([m, label, Icon]) => (
          <button key={m} onClick={() => setMode(m)}
            className={clsx("flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium", mode === m ? "bg-white shadow-sm" : "text-zinc-600 hover:text-zinc-900")}>
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {progress != null ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-6">
            <p className="text-sm font-medium">Uploading… {Math.round(progress * 100)}%</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100">
              <div style={{ width: `${progress * 100}%` }} className="h-full rounded-full bg-brand-600 transition-all" />
            </div>
            <p className="mt-3 text-xs text-zinc-500">Next: transcription and notes. You can leave the meeting page and come back.</p>
          </div>
        ) : mode === "upload" ? (
          <FilePicker onFile={(file, durationMs) => upload(file, "upload", durationMs)} />
        ) : (
          <TabRecorder callOpened={params.get("opened") === "1"} onDone={(blob, durationMs) => upload(blob, "browser", durationMs)} />
        )}
      </div>
      {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}
    </div>
  );
}

function FilePicker({ onFile }: { onFile: (f: File, durationMs?: number) => void }) {
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function pick(file?: File) {
    if (!file) return;
    // Read the duration locally so the meeting shows its length before transcription finishes.
    const durationMs = await new Promise<number | undefined>((resolve) => {
      const el = document.createElement(file.type.startsWith("audio") ? "audio" : "video");
      el.preload = "metadata";
      el.onloadedmetadata = () => resolve(Number.isFinite(el.duration) ? el.duration * 1000 : undefined);
      el.onerror = () => resolve(undefined);
      el.src = URL.createObjectURL(file);
      setTimeout(() => resolve(undefined), 4000);
    });
    onFile(file, durationMs);
  }

  return (
    <button
      onClick={() => input.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
      className={clsx("flex w-full flex-col items-center rounded-xl border-2 border-dashed px-6 py-12 text-center", drag ? "border-brand-500 bg-brand-50" : "border-zinc-300 bg-white hover:border-zinc-400")}
    >
      <FileAudio className="size-8 text-zinc-400" />
      <span className="mt-3 text-sm font-medium">Drop a meeting recording, or click to choose</span>
      <span className="mt-1 text-xs text-zinc-500">MP4, WebM, MOV, MP3, M4A or WAV · up to 300 MB</span>
      <input ref={input} type="file" accept="audio/*,video/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
    </button>
  );
}

/** Records a browser tab (the call) plus your microphone, mixed into one track. */
function TabRecorder({ onDone, callOpened }: { onDone: (b: Blob, durationMs: number) => void; callOpened?: boolean }) {
  const [state, setState] = useState<"idle" | "recording">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const preview = useRef<HTMLVideoElement>(null);
  const stopAll = useRef<() => void>(() => {});
  const startedAt = useRef(0);

  useEffect(() => {
    if (state !== "recording") return;
    const t = setInterval(() => setElapsed(Date.now() - startedAt.current), 500);
    return () => clearInterval(t);
  }, [state]);

  useEffect(() => () => stopAll.current(), []);

  async function start() {
    setError(null);
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
      const ctx = new AudioContext();
      const dest = ctx.createMediaStreamDestination();
      if (display.getAudioTracks().length) ctx.createMediaStreamSource(new MediaStream(display.getAudioTracks())).connect(dest);
      if (mic) ctx.createMediaStreamSource(mic).connect(dest);
      if (!display.getAudioTracks().length && !mic) throw new Error("No audio to record. Share a tab with “Share tab audio” on, or allow the microphone.");
      const stream = new MediaStream([...display.getVideoTracks(), ...dest.stream.getAudioTracks()]);
      if (preview.current) preview.current.srcObject = stream;

      const mimeType = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1_000_000 });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        setRecording(false);
        const durationMs = Date.now() - startedAt.current;
        [display, mic].forEach((s) => s?.getTracks().forEach((t) => t.stop()));
        ctx.close();
        setState("idle");
        onDone(new Blob(chunks, { type: (mimeType ?? "video/webm").split(";")[0] }), durationMs);
      };
      display.getVideoTracks()[0].onended = () => rec.state === "recording" && rec.stop();
      stopAll.current = () => rec.state === "recording" && rec.stop();
      rec.start(1000);
      setRecording(true);
      startedAt.current = Date.now();
      setElapsed(0);
      setState("recording");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <video ref={preview} autoPlay muted playsInline className={clsx("mb-4 aspect-video w-full rounded-lg bg-zinc-900", state === "idle" && "hidden")} />
      {state === "idle" ? (
        <>
          <p className="text-sm text-zinc-600">
            {callOpened ? "Your call opened in a new tab. Click Start recording and choose that tab" : "Click Start recording and choose the tab your call is in"} with{" "}
            <b>Share tab audio</b> switched on. Your microphone is mixed in so both sides are captured.
          </p>
          <button onClick={start} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700">
            <Circle className="size-3.5 fill-current" /> Start recording
          </button>
        </>
      ) : (
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 text-sm font-medium text-rose-600">
            <span className="size-2.5 animate-pulse rounded-full bg-rose-600" /> Recording {clock(elapsed)}
          </span>
          <button onClick={() => stopAll.current()} className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800">
            <Square className="size-3.5 fill-current" /> Stop and process
          </button>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
    </div>
  );
}
