import { useEffect, useState, useSyncExternalStore } from "react";
import { useNavigate } from "react-router";
import { AlarmClock, CircleAlert, X } from "lucide-react";
import clsx from "clsx";
import { api } from "./api";

export type CalendarEvent = {
  id: string; title: string; start: string; end: string;
  attendees: { name: string; email: string }[];
  conference: "meet" | "zoom" | "teams" | null; link: string | null; sample?: boolean;
};

// ---- Is a recording running right now? (set by the tab recorder, read by the alerts) ----
let recording = false;
const listeners = new Set<() => void>();
export function setRecording(on: boolean) {
  recording = on;
  listeners.forEach((l) => l());
}
export const useIsRecording = () =>
  useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => recording);

// ---- Starting a recording for a calendar event ----
export function recordPath(e: Pick<CalendarEvent, "id" | "title" | "start">, openedCall = false) {
  const title = e.title === "(No title)" || !e.title.trim()
    ? `Meeting on ${new Date(e.start).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
    : e.title;
  return `/new?mode=record&event=${encodeURIComponent(e.id)}&title=${encodeURIComponent(title)}${openedCall ? "&opened=1" : ""}`;
}
/** Opens the call in a new tab (if it has a link) and goes to the recorder, prefilled. */
export function joinAndRecord(e: CalendarEvent, navigate: (to: string) => void) {
  if (e.link) window.open(e.link, "_blank", "noopener");
  navigate(recordPath(e, !!e.link));
}

// ---- Desktop notifications ----
export const notificationsSupported = () => typeof window !== "undefined" && "Notification" in window;
export const notificationPermission = () => (notificationsSupported() ? Notification.permission : "denied");

const seenKey = "fathom-clone:alerts-sent";
function alreadySent(key: string) {
  try {
    const seen: string[] = JSON.parse(localStorage.getItem(seenKey) ?? "[]");
    if (seen.includes(key)) return true;
    localStorage.setItem(seenKey, JSON.stringify([...seen.slice(-200), key]));
  } catch {
    /* storage unavailable: may notify twice, which is acceptable */
  }
  return false;
}

export function notify(title: string, body: string, onClick?: () => void) {
  if (notificationPermission() !== "granted") return;
  const n = new Notification(title, { body, icon: "/favicon.svg", requireInteraction: true });
  n.onclick = () => {
    window.focus();
    onClick?.();
    n.close();
  };
}

// ---- Which events need attention ----
const SOON_MS = 5 * 60_000; // "starting soon" window
const LATE_MS = 15 * 60_000; // after the start, keep nagging for this long if not recording

type Alert = { event: CalendarEvent; kind: "soon" | "started"; minutes: number };

export function pickAlerts(events: CalendarEvent[], now: number, isRecording: boolean): Alert[] {
  const out: Alert[] = [];
  for (const e of events) {
    const start = new Date(e.start).getTime();
    const until = start - now;
    if (until > 0 && until <= SOON_MS) out.push({ event: e, kind: "soon", minutes: Math.ceil(until / 60_000) });
    else if (until <= 0 && -until < LATE_MS && !isRecording) out.push({ event: e, kind: "started", minutes: Math.floor(-until / 60_000) });
  }
  return out;
}

/** The demo can't connect a calendar, so it gets one sample meeting a few minutes out to show the alerts. */
export function demoSoonEvent(): CalendarEvent {
  let start: number;
  try {
    start = Number(sessionStorage.getItem("fathom-clone:demo-soon"));
    if (!start || start < Date.now() - LATE_MS) {
      start = Date.now() + 6 * 60_000;
      sessionStorage.setItem("fathom-clone:demo-soon", String(start));
    }
  } catch {
    start = Date.now() + 6 * 60_000;
  }
  return {
    id: "demo-soon", title: "Acme Mechanical weekly status (sample)", start: new Date(start).toISOString(),
    end: new Date(start + 30 * 60_000).toISOString(), conference: "teams", link: null, sample: true,
    attendees: [{ name: "Karen Walsh", email: "karen@fieldnote.example" }, { name: "Greg Thompson", email: "greg@fieldnote.example" }],
  };
}

/** Loads upcoming events every few minutes and raises banners + desktop notifications. */
export function MeetingAlerts() {
  const navigate = useNavigate();
  const isRecording = useIsRecording();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [now, setNow] = useState(Date.now());
  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    const load = () =>
      api<{ connected: boolean | "sample"; events: CalendarEvent[] }>("/calendar/events")
        .then((r) => setEvents(r.connected === "sample" ? [demoSoonEvent()] : r.events))
        .catch(() => {});
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const alerts = pickAlerts(events, now, isRecording).filter((a) => !dismissed.includes(`${a.event.id}:${a.kind}`));

  useEffect(() => {
    for (const a of alerts) {
      const key = `${a.event.id}:${a.event.start}:${a.kind}`;
      if (alreadySent(key)) continue;
      if (a.kind === "soon") {
        notify(`Starts in ${a.minutes} min: ${a.event.title}`, "Click to join and start recording.", () => joinAndRecord(a.event, navigate));
      } else {
        notify(`${a.event.title} has started`, "You're not recording it. Click to start recording now.", () => navigate(recordPath(a.event)));
      }
    }
  }, [alerts.map((a) => `${a.event.id}:${a.kind}`).join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!alerts.length) return null;
  return (
    <div className="space-y-2 px-4 pt-3 md:px-8">
      {alerts.map((a) => (
        <div
          key={`${a.event.id}:${a.kind}`}
          role="status"
          className={clsx(
            "mx-auto flex max-w-5xl flex-wrap items-center gap-3 rounded-xl border px-4 py-2.5 text-sm shadow-sm",
            a.kind === "soon" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-rose-200 bg-rose-50 text-rose-900",
          )}
        >
          {a.kind === "soon" ? <AlarmClock className="size-4 shrink-0" /> : <CircleAlert className="size-4 shrink-0" />}
          <span className="min-w-0 flex-1">
            <b>{a.event.title}</b>{" "}
            {a.kind === "soon"
              ? `starts in ${a.minutes} min.`
              : `started ${a.minutes ? `${a.minutes} min ago` : "just now"} and you're not recording.`}
          </span>
          <button
            onClick={() => (a.kind === "soon" ? joinAndRecord(a.event, navigate) : navigate(recordPath(a.event)))}
            className={clsx("rounded-lg px-3 py-1.5 text-xs font-semibold text-white", a.kind === "soon" ? "bg-amber-600 hover:bg-amber-700" : "bg-rose-600 hover:bg-rose-700")}
          >
            {a.kind === "soon" ? (a.event.link ? "Join & record" : "Record") : "Start recording"}
          </button>
          <button onClick={() => setDismissed((d) => [...d, `${a.event.id}:${a.kind}`])} className="rounded p-1 opacity-60 hover:opacity-100" aria-label="Dismiss">
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
