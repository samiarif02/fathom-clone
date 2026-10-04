import { Link } from "react-router";

/** Plain-language privacy policy, linked from Google's consent screen and the footer. */
export default function Privacy() {
  return (
    <div className="min-h-full bg-white">
      <header className="border-b border-zinc-200">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <img src="/favicon.svg" alt="" className="size-6" /> Fathom Clone
          </Link>
          <Link to="/login" className="text-sm font-medium text-brand-600 hover:text-brand-700">Log in</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 text-[15px] leading-relaxed text-zinc-700">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Privacy policy</h1>
        <p className="mt-1 text-sm text-zinc-500">Last updated October 4, 2026</p>

        <p className="mt-6">
          Fathom Clone is an independent demo app built for a coding assessment. It is not affiliated with Fathom. This page explains what
          it stores and why, in plain language.
        </p>

        <h2 className="mt-8 text-lg font-semibold text-zinc-900">What we store</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li><b>Your account:</b> your email address and a password hash, managed by our authentication provider (Supabase).</li>
          <li><b>Recordings you upload or record:</b> the media file, its transcript, AI-generated notes, chapters, action items and highlights.</li>
          <li><b>Google Calendar, if you connect it:</b> your Google email address and a refresh token that lets us read your calendar.</li>
        </ul>

        <h2 className="mt-8 text-lg font-semibold text-zinc-900">Google Calendar data</h2>
        <p className="mt-3">
          We request read-only access to your calendar events (<code className="rounded bg-zinc-100 px-1">calendar.events.readonly</code>).
          We use it only to show your upcoming meetings for the next 14 days, offer a one-click way to record them, and remind you before they
          start. Event details are fetched when you open the Upcoming page and are not stored. We never create, change or delete events, and
          we never share calendar data with anyone.
        </p>
        <p className="mt-3">
          Our use of information received from Google APIs follows the{" "}
          <a className="text-brand-600 underline" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
            Google API Services User Data Policy
          </a>, including the Limited Use requirements.
        </p>

        <h2 className="mt-8 text-lg font-semibold text-zinc-900">Who can see your data</h2>
        <p className="mt-3">
          Only you. Every database table is protected by row-level security tied to your account. A highlight becomes viewable by others only
          if you create a share link, and you can turn that link off at any time.
        </p>

        <h2 className="mt-8 text-lg font-semibold text-zinc-900">Processors</h2>
        <p className="mt-3">
          Supabase (database and sign-in), Cloudflare (hosting, file storage, and Workers AI for transcription and notes) and Google
          (calendar, only if you connect it).
        </p>

        <h2 className="mt-8 text-lg font-semibold text-zinc-900">Disconnecting and deleting</h2>
        <p className="mt-3">
          Click <b>Disconnect</b> on the Upcoming page to revoke calendar access; we delete the stored token immediately. You can also revoke
          access at{" "}
          <a className="text-brand-600 underline" href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">myaccount.google.com/permissions</a>.
          To delete your account and recordings, contact the developer via the{" "}
          <a className="text-brand-600 underline" href="https://github.com/samiarif02/fathom-clone" target="_blank" rel="noreferrer">project repository</a>.
        </p>
      </main>
    </div>
  );
}
