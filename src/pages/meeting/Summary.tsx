import { useState } from "react";
import { Check, Copy, Loader2, Sparkles } from "lucide-react";
import clsx from "clsx";
import { TEMPLATES } from "../../../shared/templates.ts";
import type { ActionItem, Participant, Summary as SummaryRow } from "../../lib/types";
import { Avatar } from "../../components/Avatar";
import { clock } from "../../lib/format";
import { api } from "../../lib/api";
import { getSupabase } from "../../lib/supabase";

export function Summary({ meetingId, summaries, actionItems, participants, template, onTemplate, onSeek, onSummary, onActionItems }: {
  meetingId: string; summaries: SummaryRow[]; actionItems: ActionItem[]; participants: Participant[];
  template: string; onTemplate: (t: string) => void; onSeek: (ms: number) => void;
  onSummary: (s: SummaryRow) => void; onActionItems: (a: ActionItem[]) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const current = summaries.find((s) => s.template === template);
  const people = new Map(participants.map((p) => [p.id, p]));
  const meta = TEMPLATES.find((t) => t.id === template)!;

  async function generate(t: string) {
    setBusy(t);
    setError(null);
    try {
      const res = await api<{ template: string; sections: SummaryRow["sections"] }>(`/meetings/${meetingId}/summaries/${t}`, { method: "POST" });
      onSummary({ template: res.template, sections: res.sections, created_at: new Date().toISOString() });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function toggle(item: ActionItem) {
    const next = actionItems.map((a) => (a.id === item.id ? { ...a, done: !a.done } : a));
    onActionItems(next);
    const sb = await getSupabase();
    const { error } = await sb.from("action_items").update({ done: !item.done }).eq("id", item.id);
    if (error) onActionItems(actionItems);
  }

  function copy() {
    if (!current) return;
    const text = [
      ...current.sections.map((s) => `${s.heading}\n${s.bullets.map((b) => `- ${b.text}`).join("\n")}`),
      actionItems.length ? `Action items\n${actionItems.map((a) => `- [${a.done ? "x" : " "}] ${a.text}${a.assignee_participant_id ? ` (${people.get(a.assignee_participant_id)?.name})` : ""}`).join("\n")}` : "",
    ].filter(Boolean).join("\n\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-5 px-4 py-4">
      <div>
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATES.map((t) => {
            const has = summaries.some((s) => s.template === t.id);
            return (
              <button
                key={t.id}
                onClick={() => { onTemplate(t.id); if (!has && !busy) generate(t.id); }}
                title={t.description}
                className={clsx(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  template === t.id ? "border-brand-600 bg-brand-600 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300",
                )}
              >
                {t.label}
                {!has && template !== t.id && <Sparkles className="ml-1 inline size-3 opacity-50" />}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-zinc-500">{meta.description}. Click a timestamp to hear it.</p>
      </div>

      {template === "general" && actionItems.length > 0 && (
        <section className="rounded-xl border border-zinc-200 bg-white">
          <h3 className="flex items-center justify-between border-b border-zinc-100 px-4 py-2.5 text-sm font-semibold">
            Action items
            <span className="text-xs font-normal text-zinc-500">{actionItems.filter((a) => a.done).length}/{actionItems.length} done</span>
          </h3>
          <ul className="divide-y divide-zinc-50">
            {actionItems.map((a) => {
              const who = a.assignee_participant_id ? people.get(a.assignee_participant_id) : null;
              return (
                <li key={a.id} className="flex items-start gap-3 px-4 py-2.5">
                  <button
                    onClick={() => toggle(a)}
                    className={clsx("mt-0.5 grid size-4 shrink-0 place-items-center rounded border", a.done ? "border-brand-600 bg-brand-600 text-white" : "border-zinc-300 hover:border-brand-500")}
                    aria-label={a.done ? "Mark not done" : "Mark done"}
                  >
                    {a.done && <Check className="size-3" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={clsx("text-sm", a.done && "text-zinc-400 line-through")}>{a.text}</p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
                      {who && <span className="inline-flex items-center gap-1"><Avatar name={who.name} color={who.color} size="xs" />{who.name}</span>}
                      {a.at_ms != null && <TimeChip ms={a.at_ms} onSeek={onSeek} />}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {busy === template ? (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-500">
          <Loader2 className="size-4 animate-spin" /> Writing {meta.label} notes from the transcript. Long meetings take up to a minute.
        </div>
      ) : current ? (
        <div className="space-y-5">
          <div className="flex justify-end">
            <button onClick={copy} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800">
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? "Copied" : "Copy notes"}
            </button>
          </div>
          {current.sections.map((s, i) => (
            <section key={i}>
              <h3 className="mb-1.5 text-sm font-semibold text-zinc-900">{s.heading}</h3>
              <ul className="space-y-1.5">
                {s.bullets.map((b, j) => (
                  <li key={j} className="flex gap-2 text-sm leading-relaxed text-zinc-700">
                    <span className="mt-2 size-1 shrink-0 rounded-full bg-zinc-400" />
                    <span className="min-w-0">
                      {b.text}
                      {b.at_ms != null && <> <TimeChip ms={b.at_ms} onSeek={onSeek} /></>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500">
          {error ? <p className="mb-3 text-rose-600">{error}</p> : <p className="mb-3">No {meta.label} notes yet.</p>}
          <button onClick={() => generate(template)} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">
            <Sparkles className="size-4" /> Generate {meta.label} notes
          </button>
        </div>
      )}
    </div>
  );
}

export function TimeChip({ ms, onSeek }: { ms: number; onSeek: (ms: number) => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onSeek(ms); }}
      className="inline-flex items-center rounded bg-brand-50 px-1.5 py-px align-baseline text-[11px] font-medium tabular-nums text-brand-700 hover:bg-brand-100"
    >
      {clock(ms)}
    </button>
  );
}
