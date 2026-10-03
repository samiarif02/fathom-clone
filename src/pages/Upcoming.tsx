import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Bell, BellRing, Bot, CalendarDays, CheckCircle2, Circle, Loader2, Video } from "lucide-react";
import { api } from "../lib/api";
import { getSupabase } from "../lib/supabase";
import { demoSoonEvent, joinAndRecord, notificationPermission, notificationsSupported, notify, type CalendarEvent } from "../lib/alerts";
import { AvatarStack } from "../components/Avatar";

type Event = CalendarEvent;
type Res = { connected: boolean | "sample"; configured?: boolean; expired?: boolean; email?: string | null; events: Event[]; error?: string };

const COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#a855f7", "#ec4899", "#14b8a6"];
const CONF = { meet: "Google Meet", zoom: "Zoom", teams: "Microsoft Teams" } as const;

export default function Upcoming() {
  const [params] = useSearchParams();
  const [data, setData] = useState<Res | null>(null);
  const navigate = useNavigate();
  const [recorded, setRecorded] = useState<Map<string, string>>(new Map());
  const [permission, setPermission] = useState(notificationPermission());
  const [error, setError] = useState<string | null>(
    params.get("error") ? `Couldn't connect Google Calendar (${params.get("error")}). Please try again.` : null,
  );

  const load = () =>
    api<Res>("/calendar/events")
      .then((r) => {
        const next = r.connected === "sample" ? { ...r, events: [demoSoonEvent(), ...sampleWeek()] } : r;
        setData(next);
        loadRecorded(next.events.map((e) => e.id));
        if (r.error) setError(`Couldn't read your calendar: ${r.error}`);
      })
      .catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  // Which events already have a recording (meetings.calendar_event_id).
  async function loadRecorded(ids: string[]) {
    if (!ids.length) return;
    const sb = await getSupabase();
    const { data } = await sb.from("meetings").select("id,calendar_event_id").in("calendar_event_id", ids);
    setRecorded(new Map((data ?? []).map((m) => [m.calendar_event_id as string, m.id as string])));
  }

  async function enableAlerts() {
    if (!notificationsSupported()) return setError("This browser doesn't support desktop notifications.");
    setPermission(await Notification.requestPermission());
  }

  function testAlert() {
    const e = data?.events[0];
    notify(e ? `Starts in 5 min: ${e.title}` : "Meeting alerts are on", e ? "Click to join and start recording." : "You'll be reminded before meetings.", e ? () => joinAndRecord(e, navigate) : undefined);
  }

  async function connect() {
    try {
      const { url } = await api<{ url: string }>("/calendar/connect-url", { method: "POST" });
      location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  async function disconnect() {
    await api("/calendar/disconnect", { method: "POST" });
    load();
  }

  const groups = useMemo(() => {
    const map = new Map<string, Event[]>();
    for (const e of data?.events ?? []) {
      const label = dayLabel(new Date(e.start));
      map.set(label, [...(map.get(label) ?? []), e]);
    }
    return [...map];
  }, [data]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Upcoming meetings</h1>
        {data?.connected === true && (
          <span className="text-xs text-zinc-500">
            {data.email} · <button onClick={disconnect} className="font-medium text-zinc-700 hover:underline">Disconnect</button>
          </span>
        )}
      </div>

      {data && data.connected !== false && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm shadow-sm">
          {permission === "granted" ? <BellRing className="size-4 text-emerald-600" /> : <Bell className="size-4 text-zinc-500" />}
          <span className="min-w-0 flex-1 text-zinc-700">
            {permission === "granted"
              ? "Meeting alerts are on: 5 minutes before, and again if a meeting starts while you're not recording."
              : permission === "denied"
                ? "Desktop notifications are blocked for this site. You'll still see banners in the app; allow notifications in your browser's site settings for pop-ups."
                : "Get a reminder 5 minutes before each meeting, and a nudge if it starts while you're not recording."}
            <span className="block text-xs text-zinc-500">Alerts work while Fathom Clone is open in a tab.</span>
          </span>
          {permission === "granted" ? (
            <button onClick={testAlert} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50">Send a test alert</button>
          ) : permission !== "denied" ? (
            <button onClick={enableAlerts} className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800">Turn on alerts</button>
          ) : null}
        </div>
      )}

      {error && <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {!data ? (
        <div className="mt-10 grid place-items-center text-zinc-400"><Loader2 className="size-5 animate-spin" /></div>
      ) : data.connected === false ? (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <CalendarDays className="mx-auto size-8 text-zinc-400" />
          <h2 className="mt-3 font-medium">Connect your calendar</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-500">
            See your next two weeks of meetings here. Read-only access to events; nothing is changed in your calendar.
          </p>
          <button onClick={connect} disabled={data.configured === false}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">
            Connect Google Calendar
          </button>
          {data.configured === false && <p className="mt-3 text-xs text-zinc-500">Google sign-in isn't configured on this deployment yet.</p>}
        </div>
      ) : (
        <>
          <div className="mt-4 flex gap-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
            <Bot className="mt-0.5 size-4 shrink-0" />
            <p>
              {data.connected === "sample" ? "Sample calendar for the demo account. " : ""}
              In the real product a notetaker joins these calls automatically. That bot is stubbed here: record the call from a browser tab via New recording instead.
            </p>
          </div>
          {groups.length === 0 && <p className="mt-10 text-center text-sm text-zinc-500">Nothing on your calendar in the next two weeks.</p>}
          <div className="mt-6 space-y-6">
            {groups.map(([label, events]) => (
              <section key={label}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</h2>
                <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
                  {events.map((e) => (
                    <li key={e.id} className="flex items-center gap-4 px-4 py-3">
                      <div className="w-20 shrink-0 text-sm tabular-nums">
                        <div className="font-medium">{new Date(e.start).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</div>
                        <div className="text-xs text-zinc-500">{Math.round((+new Date(e.end) - +new Date(e.start)) / 60000)} min</div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{e.title}</div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500">
                          {e.conference ? <><Video className="size-3" />{CONF[e.conference]}</> : "No video link"}
                          {e.attendees.length > 0 && <> · {e.attendees.length + 1} people</>}
                        </div>
                      </div>
                      <span className="hidden sm:block">
                        <AvatarStack people={e.attendees.map((a, i) => ({ name: a.name, color: COLORS[i % COLORS.length] }))} max={4} />
                      </span>
                      {recorded.has(e.id) ? (
                        <Link to={`/meetings/${recorded.get(e.id)}`} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50">
                          <CheckCircle2 className="size-3.5" /> Recorded
                        </Link>
                      ) : (
                        <button onClick={() => joinAndRecord(e, navigate)} title={e.link ? "Open the call and start recording" : "Start recording"}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700">
                          <Circle className="size-2.5 fill-rose-500 text-rose-500" /> {e.link ? "Join & record" : "Record"}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function dayLabel(d: Date) {
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(new Date())) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

/** A plausible week ahead for the demo account, at sensible local times for whoever is viewing. */
function sampleWeek(): Event[] {
  const ev = (id: string, title: string, days: number, hour: number, minute: number, mins: number, conference: Event["conference"], people: string[]): Event => {
    const start = new Date();
    start.setDate(start.getDate() + days);
    start.setHours(hour, minute, 0, 0);
    return {
      id, title, start: start.toISOString(), end: new Date(start.getTime() + mins * 60000).toISOString(),
      attendees: people.map((p) => ({ name: p, email: `${p.split(" ")[0].toLowerCase()}@fieldnote.example` })),
      conference, link: null, sample: true,
    };
  };
  return [
    ev("s1", "Mobile standup", 1, 9, 15, 15, "meet", ["Priya Raman", "Wei Chen", "Sofia Alvarez", "Ben Carter"]),
    ev("s2", "Pricing page copy review", 1, 11, 0, 30, "meet", ["Aman Sethi", "Moira Byrne"]),
    ev("s3", "Halcyon tailored demo", 2, 14, 0, 45, "zoom", ["Marcus Bell", "Linda Ortiz"]),
    ev("s4", "Acme Mechanical weekly status", 3, 10, 30, 30, "teams", ["Karen Walsh", "Greg Thompson", "Helen Park"]),
    ev("s5", "SSO customer call #2", 4, 16, 0, 30, "zoom", ["Karen Walsh"]),
    ev("s6", "Q4 planning check-in", 6, 10, 0, 60, "meet", ["Daniel Mercer", "Priya Raman", "Rishi Kapoor", "Moira Byrne", "Karen Walsh", "Aman Sethi", "Tessa van der Merwe"]),
  ];
}
