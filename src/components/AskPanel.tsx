import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { ArrowUp, ChevronDown, Loader2, PanelRightClose, RotateCcw, Sparkles } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";

type Msg = { role: "user" | "assistant"; content: string; sources?: Record<string, { id: string; title: string }>; error?: boolean };

const SUGGESTIONS_ALL = ["List my open action items", "What did we decide this week?", "Surprise me with an insight", "Give me a pep talk based on my week"];
const SUGGESTIONS_ONE = ["Summarize this in 3 bullets", "What are the open questions?", "Draft a follow-up email", "Who spoke the most, and about what?"];

/** Chat over your meetings. Answers cite moments as [M2 21:10], rendered as links into the meeting. */
export function AskPanel({ meetings, fixedMeetingId, onClose, className }: {
  meetings?: { id: string; title: string }[];
  fixedMeetingId?: string;
  onClose?: () => void;
  className?: string;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [scope, setScope] = useState<string>(fixedMeetingId ?? "all");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const meetingId = fixedMeetingId ?? (scope === "all" ? null : scope);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    const history = messages.filter((m) => !m.error).map(({ role, content }) => ({ role, content }));
    setMessages((m) => [...m, { role: "user", content: question }]);
    setInput("");
    setBusy(true);
    try {
      const res = await api<{ answer: string; sources: Msg["sources"] }>("/ask", {
        method: "POST",
        body: JSON.stringify({ question, meetingId, history, now: new Date().toISOString(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      });
      setMessages((m) => [...m, { role: "assistant", content: res.answer, sources: res.sources }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: e instanceof Error ? e.message : String(e), error: true }]);
    } finally {
      setBusy(false);
    }
  }

  const suggestions = meetingId ? SUGGESTIONS_ONE : SUGGESTIONS_ALL;

  return (
    <section className={clsx("flex min-h-0 flex-col bg-white", className)} aria-label="Ask about your meetings">
      <header className="flex items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide">
          <Sparkles className="size-4 text-brand-600" />
          <span className="text-zinc-400">ASK</span><span className="-ml-1">ANYTHING</span>
        </h2>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button onClick={() => setMessages([])} className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" title="New chat" aria-label="New chat">
              <RotateCcw className="size-4" />
            </button>
          )}
          {onClose && (
            <button onClick={onClose} className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" title="Hide panel" aria-label="Hide Ask panel">
              <PanelRightClose className="size-4" />
            </button>
          )}
        </div>
      </header>

      <div ref={scroller} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="mt-auto space-y-2">
            <p className="mb-3 text-sm text-zinc-500">
              {meetingId ? "Ask about this meeting. Answers link to the moment they come from." : "Ask about any of your meetings. Answers link to the moment they come from."}
            </p>
            <div className="flex flex-col items-end gap-2">
              {suggestions.map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-xl bg-zinc-100 px-3.5 py-2 text-right text-sm text-zinc-700 hover:bg-zinc-200">{s}</button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="ml-8 rounded-2xl rounded-br-md bg-brand-600 px-3.5 py-2 text-sm text-white">{m.content}</div>
              ) : (
                <div key={i} className={clsx("mr-2 text-sm leading-relaxed", m.error ? "text-rose-600" : "text-zinc-800")}>
                  <Answer text={m.content} sources={m.sources ?? {}} />
                </div>
              ),
            )}
            {busy && (
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <Loader2 className="size-4 animate-spin" /> Reading your meetings…
              </div>
            )}
          </div>
        )}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="border-t border-zinc-100 p-3">
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
            rows={2}
            placeholder="Ask anything…"
            className="block w-full resize-none bg-transparent px-3 pt-2.5 text-sm outline-none placeholder:text-zinc-400"
          />
          <div className="flex items-center justify-between gap-2 px-2 pb-2">
            {fixedMeetingId ? (
              <span className="px-1.5 text-xs text-zinc-500">This meeting</span>
            ) : (
              <label className="relative inline-flex items-center">
                <span className="sr-only">Which meetings to ask about</span>
                <select value={scope} onChange={(e) => { setScope(e.target.value); setMessages([]); }}
                  className="max-w-[14rem] appearance-none truncate rounded-lg bg-zinc-200/70 py-1.5 pl-2.5 pr-7 text-xs font-medium text-zinc-700 outline-none hover:bg-zinc-200">
                  <option value="all">All my meetings</option>
                  {(meetings ?? []).map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 size-3.5 text-zinc-500" />
              </label>
            )}
            <button type="submit" disabled={!input.trim() || busy} aria-label="Send"
              className="grid size-8 place-items-center rounded-full bg-brand-600 text-white hover:bg-brand-700 disabled:bg-zinc-300">
              <ArrowUp className="size-4" />
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}

const CITE = /\[(M\d+)(?:\s+(\d{1,2}:\d{2}(?::\d{2})?))?\]/g;
const toMs = (t: string) => t.split(":").map(Number).reduce((a, n) => a * 60 + n, 0) * 1000;

/** Renders the model's light markdown (paragraphs, "- " bullets, **bold**) with citation chips. */
function Answer({ text, sources }: { text: string; sources: Record<string, { id: string; title: string }> }) {
  const inline = (line: string, key: string): ReactNode[] => {
    const out: ReactNode[] = [];
    let last = 0;
    for (const m of line.matchAll(CITE)) {
      out.push(...bold(line.slice(last, m.index), `${key}-t${m.index}`));
      const src = sources[m[1]];
      if (src) {
        const to = `/meetings/${src.id}${m[2] ? `?t=${toMs(m[2])}` : ""}`;
        out.push(
          <Link key={`${key}-c${m.index}`} to={to} title={src.title}
            className="mx-0.5 inline-flex max-w-[12rem] items-center gap-1 rounded bg-brand-50 px-1.5 py-px align-baseline text-[11px] font-medium text-brand-700 hover:bg-brand-100">
            <span className="truncate">{src.title}</span>{m[2] && <span className="shrink-0 tabular-nums">· {m[2]}</span>}
          </Link>,
        );
      }
      last = (m.index ?? 0) + m[0].length;
    }
    out.push(...bold(line.slice(last), `${key}-end`));
    return out;
  };
  const bold = (s: string, key: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? <strong key={`${key}-${i}`}>{part.slice(2, -2)}</strong> : <span key={`${key}-${i}`}>{part}</span>,
    );

  const blocks: ReactNode[] = [];
  let list: ReactNode[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={`ul${blocks.length}`} className="my-1.5 list-disc space-y-1 pl-5">{list}</ul>);
    list = [];
  };
  text.split("\n").forEach((raw, i) => {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/);
    if (bullet) list.push(<li key={i}>{inline(bullet[1], `l${i}`)}</li>);
    else if (!line.trim()) flush();
    else { flush(); blocks.push(<p key={i} className="my-1.5">{inline(line.replace(/^#+\s*/, ""), `p${i}`)}</p>); }
  });
  flush();
  return <>{blocks}</>;
}
