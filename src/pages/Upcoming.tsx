import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { Bot, CalendarDays, Loader2, Video } from "lucide-react";
import { api } from "../lib/api";
import { AvatarStack } from "../components/Avatar";

type Event = {
  id: string; title: string; start: string; end: string;
  attendees: { name: string; email: string }[];
  conference: "meet" | "zoom" | "teams" | null; link: string | null; sample?: boolean;
};
type Res = { connected: boolean | "sample"; configured?: boolean; expired?: boolean; email?: string | null; events: Event[] };

const COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#a855f7", "#ec4899", "#14b8a6"];
const CONF = { meet: "Google Meet", zoom: "Zoom", teams: "Microsoft Teams" } as const;

export default function Upcoming() {
  const [params] = useSearchParams();
  const [data, setData] = useState<Res | null>(null);
  const [error, setError] = useState<string | null>(params.get("error") ? "Couldn't connect Google Calendar. Please try again." : null);

  const load = () =>
    api<Res>("/calendar/events")
      .then((r) => setData(r.connected === "sample" ? { ...r, events: sampleWeek() } : r))
      .catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

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
                      <AvatarStack people={e.attendees.map((a, i) => ({ name: a.name, color: COLORS[i % COLORS.length] }))} max={4} />
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
