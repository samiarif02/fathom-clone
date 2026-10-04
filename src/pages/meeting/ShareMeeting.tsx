import { useEffect, useRef, useState } from "react";
import { Check, Copy, Eye, Link2, Link2Off, Share2 } from "lucide-react";
import { getSupabase } from "../../lib/supabase";

const newToken = () =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(15)))).replace(/\+/g, "-").replace(/\//g, "_");

export const meetingShareUrl = (token: string) => `${location.origin}/s/${token}`;

/** Owner control: create, copy or turn off a view-only link to the whole meeting. */
export function ShareMeeting({ meetingId, token, views, onChange }: {
  meetingId: string; token: string | null; views: number; onChange: (token: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  async function update(next: string | null) {
    setBusy(true);
    setError(null);
    const { error } = await (await getSupabase()).from("meetings").update({ share_token: next }).eq("id", meetingId);
    setBusy(false);
    if (error) return setError(error.message);
    onChange(next);
    if (next) copy(next);
  }

  async function copy(t: string) {
    try {
      await navigator.clipboard.writeText(meetingShareUrl(t));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked: the link is selectable in the box */ }
  }

  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen(!open)} aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50">
        <Share2 className="size-4" /> Share{token && <span className="size-1.5 rounded-full bg-emerald-500" aria-label="(shared)" />}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] rounded-xl border border-zinc-200 bg-white p-4 text-sm shadow-xl">
          <p className="font-semibold text-zinc-900">Share this meeting</p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">
            Anyone with the link can watch the recording and read the transcript, AI notes, action items and highlights, without an account.
            They can't edit anything.
          </p>
          {token ? (
            <>
              <div className="mt-3 flex items-center gap-2">
                <input readOnly value={meetingShareUrl(token)} onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs text-zinc-700" />
                <button onClick={() => copy(token)} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-brand-700">
                  {copied ? <><Check className="size-3.5" /> Copied</> : <><Copy className="size-3.5" /> Copy</>}
                </button>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
                <span className="inline-flex items-center gap-1"><Eye className="size-3.5" /> {views} {views === 1 ? "view" : "views"}</span>
                <button onClick={() => update(null)} disabled={busy} className="inline-flex items-center gap-1 font-medium text-rose-600 hover:text-rose-700 disabled:opacity-60">
                  <Link2Off className="size-3.5" /> Stop sharing
                </button>
              </div>
            </>
          ) : (
            <button onClick={() => update(newToken())} disabled={busy}
              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">
              <Link2 className="size-4" /> Create view-only link
            </button>
          )}
          {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
