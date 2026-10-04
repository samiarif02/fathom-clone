import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useSearchParams } from "react-router";
import { PlayCircle } from "lucide-react";
import { signInAsDemo, useAuth } from "../lib/auth";
import { getSupabase } from "../lib/supabase";

export default function Login() {
  const { session } = useAuth();
  const location = useLocation();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">(params.get("mode") === "signup" ? "signup" : "signin");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (session) return <Navigate to={(location.state as { from?: string })?.from ?? "/meetings"} replace />;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    run(async () => {
      const sb = await getSupabase();
      const { data, error } =
        mode === "signin"
          ? await sb.auth.signInWithPassword({ email, password })
          : await sb.auth.signUp({ email, password });
      if (error) throw error;
      if (mode === "signup" && !data.session) setMessage("Check your email to confirm your account.");
    });
  }

  return (
    <div className="grid min-h-full place-items-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Link to="/" aria-label="Back to the home page"><img src="/favicon.svg" alt="" className="mb-4 size-11" /></Link>
          <h1 className="text-2xl font-semibold tracking-tight">{mode === "signup" ? "Create your account" : "Welcome back"}</h1>
          <p className="mt-1 text-sm text-zinc-500">Recordings, transcripts and AI notes for every meeting.</p>
        </div>

        <button
          onClick={() => run(signInAsDemo)}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
        >
          <PlayCircle className="size-4" /> Try the demo account
        </button>
        <p className="mt-2 text-center text-xs text-zinc-500">No sign-up. Six seeded meetings, including an hour-long 8-person call.</p>

        <div className="my-6 flex items-center gap-3 text-xs text-zinc-400">
          <div className="h-px flex-1 bg-zinc-200" /> or use your own account <div className="h-px flex-1 bg-zinc-200" />
        </div>

        <form onSubmit={submit} className="space-y-3 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <input
            type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
          <input
            type="password" required minLength={6} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
          <button disabled={busy} className="w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60">
            {mode === "signin" ? "Sign in" : "Create account"}
          </button>
          <button type="button" onClick={() => setMode(mode === "signin" ? "signup" : "signin")} className="w-full text-xs text-zinc-500 hover:text-zinc-800">
            {mode === "signin" ? "No account? Create one" : "Have an account? Sign in"}
          </button>
        </form>
        {message && <p className="mt-4 text-center text-sm text-rose-600">{message}</p>}
      </div>
    </div>
  );
}
