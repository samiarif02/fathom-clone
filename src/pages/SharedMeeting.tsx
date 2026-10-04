import { Link, useParams } from "react-router";
import { useAuth } from "../lib/auth";
import MeetingPage from "./meeting/MeetingPage";

/** Signed-out, view-only page for a whole shared meeting (/s/:token). */
export default function SharedMeeting() {
  const { token } = useParams();
  const { session } = useAuth();
  return (
    <div className="flex h-full flex-col bg-zinc-50">
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 py-2.5 md:px-6">
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <img src="/favicon.svg" alt="" className="size-6" /> Fathom Clone
        </Link>
        <Link to={session ? "/meetings" : "/login?mode=signup"} className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
          {session ? "Open my meetings" : "Get Fathom Clone free"}
        </Link>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto lg:overflow-hidden">
        <MeetingPage key={token} shareToken={token} />
      </main>
    </div>
  );
}
