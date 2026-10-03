import { NavLink, Outlet } from "react-router";
import { CalendarDays, LogOut, Video } from "lucide-react";
import clsx from "clsx";
import { signOut, useAuth } from "../lib/auth";

const nav = [
  { to: "/", label: "Meetings", icon: Video, end: true },
  { to: "/calendar", label: "Upcoming", icon: CalendarDays },
];

export default function Layout() {
  const { session } = useAuth();
  return (
    <div className="flex h-full">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-zinc-200 bg-white md:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <img src="/favicon.svg" alt="" className="size-7" />
          <span className="font-semibold tracking-tight">Fathom Clone</span>
        </div>
        <nav className="flex flex-col gap-0.5 px-3">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium",
                  isActive ? "bg-brand-50 text-brand-700" : "text-zinc-600 hover:bg-zinc-100",
                )
              }
            >
              <Icon className="size-4" /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-zinc-200 p-3">
          <div className="truncate px-2 pb-2 text-xs text-zinc-500">{session?.user.email}</div>
          <button
            onClick={() => signOut()}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-zinc-200 bg-white/95 px-4 py-2.5 backdrop-blur md:hidden">
          <NavLink to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <img src="/favicon.svg" alt="" className="size-6" /> Fathom Clone
          </NavLink>
          <nav className="flex items-center gap-1">
            {nav.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} aria-label={label} title={label}
                className={({ isActive }) => clsx("rounded-lg p-2", isActive ? "bg-brand-50 text-brand-700" : "text-zinc-600")}>
                <Icon className="size-5" />
              </NavLink>
            ))}
            <button onClick={() => signOut()} aria-label="Sign out" title="Sign out" className="rounded-lg p-2 text-zinc-600">
              <LogOut className="size-5" />
            </button>
          </nav>
        </header>
        <Outlet />
      </main>
    </div>
  );
}
