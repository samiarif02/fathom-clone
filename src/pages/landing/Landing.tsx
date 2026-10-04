import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import {
  ArrowLeft, ArrowRight, BellRing, Briefcase, ChevronDown, Code2, Headphones, Link2, ListChecks, Loader2, Menu,
  MessageSquareText, Search, Sparkles, Timer, Users, UserSearch, X, Zap,
} from "lucide-react";
import clsx from "clsx";
import { signInAsDemo, useAuth } from "../../lib/auth";

/* ------------------------------------------------------------------------------------------
 * Marketing page. Structure follows fathom.ai section by section (hero collage, proof strip,
 * feature carousel, marquee, teams/individuals tabs, three pillars, stats, product shot,
 * use cases, "works where you meet", final CTA, footer). Copy, screenshots and numbers are
 * our own: every claim here is something this app actually does.
 * ---------------------------------------------------------------------------------------- */

const display = "font-[family-name:var(--font-display)]";
const cta = "font-[family-name:var(--font-cta)] uppercase tracking-wide";

function useCtas() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [demoBusy, setDemoBusy] = useState(false);
  const signedIn = !!session;
  const tryDemo = async () => {
    if (signedIn) return navigate("/meetings");
    setDemoBusy(true);
    try {
      await signInAsDemo();
      navigate("/meetings");
    } finally {
      setDemoBusy(false);
    }
  };
  return { signedIn, tryDemo, demoBusy, signupTo: signedIn ? "/meetings" : "/login?mode=signup" };
}

/* Starfield: a small canvas-drawn tile, generated once and repeated as a single background
   image (hundreds of CSS gradient layers would be far too slow to paint). */
const starTiles = new Map<string, string>();
function starTile(count: number, maxSize: number, seed: number) {
  const key = `${count}:${maxSize}:${seed}`;
  const cached = starTiles.get(key);
  if (cached) return cached;
  const size = 420;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < count; i++) {
    ctx.beginPath();
    ctx.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.7})`;
    ctx.arc(rnd() * size, rnd() * size, rnd() * maxSize + 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  const url = canvas.toDataURL("image/png");
  starTiles.set(key, url);
  return url;
}

function Stars({ density = 160, className }: { density?: number; className?: string }) {
  const [tiles, setTiles] = useState<{ still: string; twinkle: string } | null>(null);
  useEffect(() => {
    const n = Math.max(12, Math.round(density / 3));
    setTiles({ still: starTile(n, 0.9, 7), twinkle: starTile(Math.round(n / 3), 1.2, 13) });
  }, [density]);
  if (!tiles) return null;
  return (
    <div aria-hidden className={clsx("pointer-events-none absolute inset-0", className)}>
      <div className="absolute inset-0" style={{ backgroundImage: `url(${tiles.still})` }} />
      <div className="absolute inset-0 motion-reduce:animate-none" style={{ backgroundImage: `url(${tiles.twinkle})`, backgroundPosition: "137px 91px", animation: "twinkle 5s ease-in-out infinite" }} />
    </div>
  );
}

/* Fade/slide sections in as they scroll into view. */
function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setShown(true), io.disconnect()), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ transitionDelay: `${delay}ms` }}
      className={clsx("transition-all duration-700 ease-out motion-reduce:transition-none", shown ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0", className)}>
      {children}
    </div>
  );
}

function PillButton({ children, onClick, to, variant = "sky", className, busy }: {
  children: ReactNode; onClick?: () => void; to?: string; variant?: "sky" | "yellow" | "ghost"; className?: string; busy?: boolean;
}) {
  const cls = clsx(
    cta, "inline-flex items-center justify-center gap-2 rounded-full px-7 py-3 text-[15px] font-semibold transition-transform hover:-translate-y-0.5 disabled:opacity-70",
    variant === "sky" && "bg-gradient-to-r from-[#7cc4ff] via-[#38b6ff] to-[#00b4ff] text-[#06121f] shadow-[0_0_40px_-8px_rgba(56,182,255,0.7)]",
    variant === "yellow" && "bg-[#fff27a] text-zinc-900 shadow-[0_0_40px_-10px_rgba(255,242,122,0.8)]",
    variant === "ghost" && "border border-white/25 text-white hover:border-white/60",
    className,
  );
  const inner = <>{busy && <Loader2 className="size-4 animate-spin" />}{children}</>;
  return to ? <Link to={to} className={cls}>{inner}</Link> : <button onClick={onClick} disabled={busy} className={cls}>{inner}</button>;
}

function Logo({ className }: { className?: string }) {
  return (
    <Link to="/" className={clsx("flex items-center gap-2.5", className)} aria-label="Fathom Clone home">
      <img src="/favicon.svg" alt="" className="size-7" />
      <span className={clsx(display, "text-[19px] font-semibold tracking-[0.12em] text-white")}>FATHOM<span className="font-light text-[#38b6ff]"> CLONE</span></span>
    </Link>
  );
}

/* ---------------------------------------------------------------- Nav ---- */
const NAV = [
  { href: "#features", label: "Features" },
  { href: "#how", label: "How it works" },
  { href: "#use-cases", label: "Use cases" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

function Nav() {
  const { signedIn, tryDemo, demoBusy, signupTo } = useCtas();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 40);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className={clsx("sticky top-0 z-50 transition-colors", scrolled || open ? "bg-black/90 backdrop-blur" : "bg-transparent")}>
      <div className="mx-auto flex max-w-[1400px] items-center justify-between px-5 py-4 md:px-10">
        <Logo />
        <nav className="hidden items-center gap-1 rounded-full border border-white/15 bg-black/40 px-3 py-1.5 lg:flex">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="rounded-full px-4 py-1.5 text-[14px] text-zinc-200 hover:bg-white/10 hover:text-white">{n.label}</a>
          ))}
        </nav>
        <div className="hidden items-center gap-5 lg:flex">
          <button onClick={tryDemo} className="text-[14px] font-medium text-white hover:text-[#7cc4ff]">{demoBusy ? "Opening demo…" : "Try the demo"}</button>
          {signedIn ? (
            <PillButton to="/meetings" variant="sky" className="!px-6 !py-2.5">Open app</PillButton>
          ) : (
            <>
              <Link to="/login" className="text-[14px] font-medium text-white hover:text-[#7cc4ff]">Log In</Link>
              <Link to={signupTo}
                className={clsx(cta, "rounded-full px-6 py-2.5 text-[15px] font-semibold transition-colors",
                  scrolled ? "bg-gradient-to-r from-[#7cc4ff] to-[#00b4ff] text-[#06121f]" : "border border-[#38b6ff] text-[#7cc4ff] hover:bg-[#38b6ff]/10")}>
                Sign up free
              </Link>
            </>
          )}
        </div>
        <button onClick={() => setOpen(!open)} className="rounded-lg p-2 text-white lg:hidden" aria-label={open ? "Close menu" : "Open menu"}>
          {open ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </div>
      {open && (
        <div className="border-t border-white/10 px-5 pb-6 lg:hidden">
          <nav className="flex flex-col py-2">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} onClick={() => setOpen(false)} className="border-b border-white/5 py-3 text-[15px] text-zinc-200">{n.label}</a>
            ))}
          </nav>
          <div className="mt-4 flex flex-col gap-3">
            <PillButton to={signupTo}>{signedIn ? "Open app" : "Sign up free"}</PillButton>
            <PillButton variant="ghost" onClick={tryDemo} busy={demoBusy}>Try the demo</PillButton>
            {!signedIn && <Link to="/login" className="py-2 text-center text-sm text-zinc-300">Log in</Link>}
          </div>
        </div>
      )}
    </header>
  );
}

/* --------------------------------------------------------------- Hero ---- */
function HeroCard({ src, alt, className, glow }: { src: string; alt: string; className?: string; glow: string }) {
  return (
    <div className={clsx("absolute overflow-hidden rounded-[999px] border bg-zinc-950 p-1.5", className)} style={{ borderColor: glow, boxShadow: `0 0 50px -18px ${glow}` }}>
      <img src={src} alt={alt} className="h-full w-full rounded-[999px] object-cover object-top" loading="eager" />
    </div>
  );
}

function Hero() {
  const { tryDemo, demoBusy, signupTo, signedIn } = useCtas();
  return (
    <section id="overview" className="relative overflow-hidden">
      <Stars density={220} />
      <div className="relative mx-auto grid max-w-[1400px] items-end gap-10 px-5 pb-16 pt-10 md:px-10 lg:min-h-[640px] lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:pb-24">
        <Reveal className="order-2 lg:order-1">
          <p className={clsx(cta, "mb-4 text-[13px] text-[#fff27a]")}>✦ AI meeting notes · no bot required</p>
          <h1 className={clsx(display, "text-[40px] font-light leading-[1.05] tracking-tight text-white md:text-[56px]")}>
            Your meetings,<br />remembered.
          </h1>
          <p className="mt-5 max-w-md text-[17px] leading-relaxed text-zinc-300">
            Fathom Clone records, transcribes and summarizes your calls so you can stay in the conversation.{" "}
            <b className="font-semibold text-white">Every note links to the moment it was said.</b>
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <PillButton to={signupTo}>{signedIn ? "Open the app" : "Get started – free"}</PillButton>
            <PillButton variant="ghost" onClick={tryDemo} busy={demoBusy}>Try the live demo</PillButton>
          </div>
          <p className="mt-6 text-[13px] text-zinc-400">Free · No credit card · Works in your browser</p>
        </Reveal>

        {/* Collage of rounded product cards, the way Fathom's hero stacks pill-shaped panels */}
        <div className="relative order-1 h-[360px] sm:h-[440px] lg:order-2 lg:h-[560px]" aria-label="Product screenshots">
          <div className="absolute inset-0" style={{ animation: "float-slow 9s ease-in-out infinite" }}>
            <HeroCard src="/landing/meeting-transcript.webp" alt="Meeting page with synced transcript" glow="#38b6ff"
              className="left-[4%] top-[6%] h-[48%] w-[70%]" />
            <HeroCard src="/landing/action-items.webp" alt="Action items with owners and timestamps" glow="#c56bff"
              className="right-0 top-0 h-[40%] w-[34%]" />
            <HeroCard src="/landing/speakers.webp" alt="Talk time per speaker" glow="#ff8a3d"
              className="bottom-[4%] left-0 h-[36%] w-[52%]" />
            <HeroCard src="/landing/upcoming.webp" alt="Meeting alert banner" glow="#fff27a"
              className="bottom-0 right-[2%] h-[44%] w-[44%]" />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------- Proof strip ---- */
function ProofStrip() {
  const items = ["Zoom", "Google Meet", "Microsoft Teams", "Any browser tab", "MP4 · MP3 · WebM uploads", "Google Calendar"];
  return (
    <section className="relative">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-5 py-10 md:px-10 lg:flex-row lg:items-center">
        <div className="shrink-0 lg:w-56">
          <p className="text-[15px] leading-snug text-zinc-300">Works with the calls<br className="hidden lg:block" /> you already have</p>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {items.map((i) => (
            <div key={i} className="flex h-16 items-center justify-center rounded-xl bg-white/[0.07] px-3 text-center text-[14px] font-medium text-zinc-200">{i}</div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------ Feature carousel ---- */
const SLIDES = [
  { title: <>Capture any call from a browser tab – <b className="font-semibold">no bot in the room</b></>, src: "/landing/record.webp", alt: "Record a tab" },
  { title: <>AI notes, chapters and action items <b className="font-semibold">minutes after the call</b></>, src: "/landing/meeting-notes.webp", alt: "AI notes" },
  { title: <>Search <b className="font-semibold">every word</b> across every meeting</>, src: "/landing/search.webp", alt: "Search across meetings" },
  { title: <>Share the 20 seconds that matter – <b className="font-semibold">no login needed</b></>, src: "/landing/clip.webp", alt: "Shared clip page" },
  { title: <>A nudge before the call, and another <b className="font-semibold">if you forget to record</b></>, src: "/landing/upcoming.webp", alt: "Meeting alerts" },
];

function FeatureCarousel() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setI((x) => (x + 1) % SLIDES.length), 6000);
    return () => clearInterval(t);
  }, [paused]);
  const go = (d: number) => setI((x) => (x + d + SLIDES.length) % SLIDES.length);
  return (
    <section id="features" className="relative overflow-hidden bg-gradient-to-b from-black via-[#03111d] to-[#0b3550] py-20"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <Stars density={90} />
      <div className="relative mx-auto max-w-[1100px] px-5 md:px-10">
        <div className="relative min-h-[520px] md:min-h-[640px]">
          {SLIDES.map((s, idx) => (
            <figure key={idx} aria-hidden={idx !== i}
              className={clsx("absolute inset-0 flex flex-col items-center transition-all duration-700", idx === i ? "translate-x-0 opacity-100" : clsx("pointer-events-none opacity-0", idx < i ? "-translate-x-10" : "translate-x-10"))}>
              <figcaption className={clsx(display, "mb-8 max-w-xl text-center text-[20px] font-light leading-snug text-white md:text-[24px]")}>{s.title}</figcaption>
              <div className="w-full overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 shadow-2xl shadow-black/60">
                <img src={s.src} alt={s.alt} className="max-h-[520px] w-full object-cover object-top" loading="lazy" />
              </div>
            </figure>
          ))}
        </div>
        <div className="mt-8 flex items-center justify-center gap-4">
          <button onClick={() => go(-1)} className="grid size-10 place-items-center rounded-full bg-[#fff27a] text-zinc-900 hover:scale-105" aria-label="Previous feature"><ArrowLeft className="size-5" /></button>
          <div className="flex gap-2">
            {SLIDES.map((_, idx) => (
              <button key={idx} onClick={() => setI(idx)} aria-label={`Show feature ${idx + 1}`}
                className={clsx("size-2.5 rounded-full transition-colors", idx === i ? "bg-[#fff27a]" : "bg-white/30 hover:bg-white/60")} />
            ))}
          </div>
          <button onClick={() => go(1)} className="grid size-10 place-items-center rounded-full bg-[#fff27a] text-zinc-900 hover:scale-105" aria-label="Next feature"><ArrowRight className="size-5" /></button>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- Marquee ---- */
function Marquee() {
  const phrase = (
    <span className="flex shrink-0 items-center gap-10 pr-10">
      <span><span className="text-[#ff8a3d]">Never</span> take notes again</span>
      <span className="text-[#38b6ff]">✦</span>
      <span>find any <span className="text-[#c56bff]">moment</span></span>
      <span className="text-[#38b6ff]">✦</span>
      <span>share the <span className="text-[#fff27a]">clip</span></span>
      <span className="text-[#38b6ff]">✦</span>
    </span>
  );
  return (
    <section className="relative overflow-hidden py-14" aria-label="Never take notes again, find any moment, share the clip">
      <Stars density={80} />
      <div className={clsx(display, "relative flex w-max whitespace-nowrap text-[56px] font-light text-white md:text-[110px]")}
        style={{ animation: "marquee 38s linear infinite" }} aria-hidden>
        {phrase}{phrase}{phrase}{phrase}
      </div>
    </section>
  );
}

/* ---------------------------------------------------- Teams / individuals ---- */
const AUDIENCES = {
  teams: {
    tab: "For teams",
    heading: <>One source of truth.<br />Less follow-up.</>,
    body: "Every call becomes searchable notes the whole team can trust: decisions, owners and dates, each linked back to where they were said. Nobody has to ask what was agreed.",
    cta: { label: "See pricing", href: "#pricing" },
    points: [
      { icon: Zap, text: "Notes and action items appear on their own; nobody has to type them up after the call." },
      { icon: ListChecks, text: "Action items keep their owner and the timestamp where they were agreed." },
      { icon: Search, text: "Search across every meeting to find who said what, and when." },
      { icon: Sparkles, text: "Switch templates (Sales, CS, Standup and more) to see the same call through a different lens." },
    ],
  },
  individuals: {
    tab: "For individuals",
    heading: <>Be present.<br />Let the notes write themselves.</>,
    body: "Stop splitting your attention between the person and the notepad. Record the call, and get a clean recap with the moments that matter one click away.",
    cta: { label: "Try the demo", href: "demo" },
    points: [
      { icon: Headphones, text: "Record a call from any browser tab; your mic is mixed in so both sides are captured." },
      { icon: BellRing, text: "A heads-up five minutes before a meeting, and a nudge if it starts while nothing is recording." },
      { icon: Timer, text: "Jump straight to a topic with AI chapters instead of scrubbing a recording." },
      { icon: Link2, text: "Send a 20-second clip instead of a 60-minute recording. Viewers don't need an account." },
    ],
  },
} as const;

function Audiences() {
  const [tab, setTab] = useState<keyof typeof AUDIENCES>("teams");
  const { tryDemo } = useCtas();
  const a = AUDIENCES[tab];
  return (
    <section className="relative px-5 py-20 md:px-10">
      <Stars density={70} />
      <Reveal className="relative mx-auto max-w-[1200px]">
        <h2 className={clsx(display, "mx-auto max-w-3xl text-center text-[34px] font-light leading-tight text-white md:text-[52px]")}>
          Whether it's a 1:1 or an all-hands, the notes are handled
        </h2>
        <div className="mt-12 rounded-[28px] border border-white/10 bg-white/[0.02] p-6 md:p-12">
          <div className="flex justify-center border-b border-white/15">
            {(Object.keys(AUDIENCES) as (keyof typeof AUDIENCES)[]).map((k) => (
              <button key={k} onClick={() => setTab(k)}
                className={clsx(display, "relative px-5 pb-4 text-[17px] md:px-10 md:text-[22px]", tab === k ? "text-[#fff27a]" : "text-zinc-300 hover:text-white")}>
                {AUDIENCES[k].tab}
                {tab === k && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-[#fff27a]" />}
              </button>
            ))}
          </div>
          <div className="mt-10 grid gap-10 lg:grid-cols-2">
            <div>
              <h3 className={clsx(display, "text-[34px] font-light leading-[1.1] text-white md:text-[44px]")}>{a.heading}</h3>
              <p className="mt-6 max-w-lg text-[16px] leading-relaxed text-zinc-300">{a.body}</p>
              <div className="mt-8">
                {a.cta.href === "demo"
                  ? <PillButton onClick={tryDemo}>{a.cta.label}</PillButton>
                  : <a href={a.cta.href} className={clsx(cta, "inline-flex rounded-full bg-gradient-to-r from-[#7cc4ff] to-[#00b4ff] px-7 py-3 text-[15px] font-semibold text-[#06121f]")}>{a.cta.label}</a>}
              </div>
            </div>
            <div className="grid gap-8 sm:grid-cols-2">
              {a.points.map(({ icon: Icon, text }) => (
                <div key={text}>
                  <Icon className="size-7 text-[#38b6ff]" strokeWidth={1.5} />
                  <p className="mt-3 text-[15px] leading-relaxed text-zinc-200">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/* ----------------------------------------------------------- Three pillars ---- */
const PILLARS = [
  {
    name: "Clarity", tag: "✦ Notes you can check", color: "#38b6ff", rings: ["#38b6ff", "#4fd1ff", "#7ef0ff"],
    body: "Transcripts with speaker labels, AI summaries in six templates, and action items with owners. Every bullet carries a timestamp, so you can hear the moment instead of trusting a summary.",
    src: "/landing/action-items.webp",
  },
  {
    name: "Focus", tag: "✦ Built for the hour-long call", color: "#fff27a", rings: ["#ff8a3d", "#ffb36b", "#ffd9a8"],
    body: "Long meetings get AI chapters you can jump between, talk time for every speaker, and a timeline of when each person spoke. Read one person's turns, or skip straight to the topic you need.",
    src: "/landing/chapters.webp",
  },
  {
    name: "Share", tag: "✦ The right 20 seconds", color: "#c56bff", rings: ["#c56bff", "#e08bff", "#f3c2ff"],
    body: "Highlight a moment from the player or any transcript line, then share it as a clip with a public link. It plays only that window, works signed out, counts views, and you can turn it off any time.",
    src: "/landing/highlights.webp",
  },
];

function Pillars() {
  const { signupTo } = useCtas();
  const [active, setActive] = useState(0);
  const [hold, setHold] = useState(false);
  useEffect(() => {
    if (hold) return;
    const t = setInterval(() => setActive((x) => (x + 1) % PILLARS.length), 7000);
    return () => clearInterval(t);
  }, [hold]);
  const p = PILLARS[active];
  return (
    <section id="how" className="relative overflow-hidden px-5 py-24 md:px-10">
      <Stars density={90} />
      <div className="relative mx-auto grid max-w-[1400px] items-center gap-14 lg:grid-cols-2">
        <div onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)}>
          {PILLARS.map((x, idx) => (
            <div key={x.name} className="py-2">
              <button onClick={() => setActive(idx)}
                className={clsx(display, "text-left text-[44px] font-light leading-tight transition-colors md:text-[58px]", idx === active ? "text-white" : "text-zinc-600 hover:text-zinc-400")}>
                {x.name}
              </button>
              <div className={clsx("grid transition-all duration-500", idx === active ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                <div className="overflow-hidden">
                  <p className="mt-1 text-[14px]" style={{ color: x.color }}>{x.tag}</p>
                  <p className="mt-3 max-w-lg text-[17px] leading-relaxed text-zinc-300">{x.body}</p>
                  <PillButton to={signupTo} className="mt-6" variant={idx === 1 ? "yellow" : "sky"}>Get started. It's free.</PillButton>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="relative mx-auto aspect-square w-full max-w-[600px]">
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-pink-300 via-fuchsia-500 to-violet-700 opacity-90" style={{ clipPath: "inset(0 0 0 45%)" }} />
          <div className="absolute inset-0 overflow-hidden rounded-full border-[6px] border-white/90">
            {p.rings.map((c, r) => (
              <div key={c} className="absolute rounded-full transition-colors duration-700" style={{ inset: `${r * 8}%`, background: c }} />
            ))}
            <img key={p.src} src={p.src} alt={`${p.name} screenshot`}
              className="absolute left-[18%] top-[16%] w-[86%] rounded-xl border border-black/10 shadow-2xl transition-opacity duration-700" />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ Stats ---- */
function Stats() {
  const stats = [
    { big: "60 min · 8 people", small: "one real call, split into chapters you can jump between", color: "bg-[#ff5a1f]", fade: "from-[#ff5a1f]/25", offset: "sm:mt-28" },
    { big: "6 templates", small: "General, Sales, CS, 1:1, Standup and Interview", color: "bg-[#ff9ec4]", fade: "from-[#ff9ec4]/30", offset: "sm:mt-10" },
    { big: "1 click", small: "from any note or action item to the moment it was said", color: "bg-[#5ccbff]", fade: "from-[#5ccbff]/30", offset: "sm:mt-0" },
  ];
  return (
    <section className="bg-[#f8f4f3] px-5 py-24 text-zinc-900 md:px-10">
      <Reveal>
        <h2 className={clsx(display, "mx-auto max-w-2xl text-center text-[38px] font-light leading-tight md:text-[60px]")}>Made for long, messy, real meetings</h2>
      </Reveal>
      <div className="mx-auto mt-16 flex max-w-4xl flex-col items-center justify-center gap-10 sm:flex-row sm:items-start sm:gap-8">
        {stats.map((s, i) => (
          <Reveal key={s.big} delay={i * 150} className={clsx("flex w-[200px] flex-col items-center", s.offset)}>
            <div className={clsx("z-10 grid size-[190px] place-items-center rounded-full px-5 text-center", s.color)}>
              <div>
                <p className="font-[family-name:var(--font-cta)] text-[26px] font-semibold leading-tight">{s.big}</p>
                <p className="mt-2 text-[13px] leading-snug text-zinc-900/80">{s.small}</p>
              </div>
            </div>
            <div className={clsx("-mt-24 h-56 w-[190px] bg-gradient-to-b to-transparent", s.fade)} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- Product shot ---- */
function ProductShot() {
  return (
    <section className="relative overflow-hidden px-5 pb-10 pt-24 md:px-10">
      <Stars density={110} />
      <Reveal className="relative mx-auto max-w-[1150px]">
        <h2 className={clsx(display, "text-center text-[38px] font-light leading-tight text-white md:text-[64px]")}>Everything from one page</h2>
        <p className="mx-auto mt-4 max-w-xl text-center text-[16px] text-zinc-400">
          Video, transcript, chapters, speakers, notes and highlights stay in sync. Click any line or bullet and the player jumps there.
        </p>
        <div className="relative mt-12">
          <div className="absolute -inset-10 rounded-[40px] bg-[#38b6ff]/20 blur-3xl" />
          <img src="/landing/meeting-transcript.webp" alt="The meeting page: video, synced transcript and chapter timeline"
            className="relative w-full rounded-2xl border border-white/10 shadow-2xl" loading="lazy" />
        </div>
      </Reveal>
    </section>
  );
}

/* --------------------------------------------------------- Big statements ---- */
function Statements() {
  const { tryDemo, demoBusy } = useCtas();
  return (
    <section className="relative overflow-hidden px-5 py-24 md:px-10">
      <Stars density={120} />
      <div className="relative mx-auto max-w-4xl space-y-28 text-center">
        <Reveal>
          <p className={clsx(display, "text-[30px] font-light leading-snug text-white md:text-[46px]")}>
            Every note <span className="bg-gradient-to-r from-[#e07bff] to-[#b14dff] bg-clip-text text-transparent">links to the moment it was said</span>, so checking a summary takes seconds, not a rewatch.
          </p>
          <PillButton onClick={tryDemo} busy={demoBusy} className="mt-10">Try it on a real meeting</PillButton>
        </Reveal>
        <Reveal>
          <p className={clsx(display, "text-[30px] font-light leading-snug text-white md:text-[46px]")}>
            Highlights become <span className="bg-gradient-to-r from-[#ff8a3d] to-[#ffb36b] bg-clip-text text-transparent">clips anyone can watch</span>: no account, just the part that matters.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- Use cases ---- */
const USE_CASES = [
  { icon: Briefcase, title: "Sales", body: "Pain points, budget, decision process and next steps, pulled from every discovery call.", template: "Sales template" },
  { icon: Headphones, title: "Customer success", body: "Commitments made on both sides and risks to the account, with the moment each was said.", template: "Customer success template" },
  { icon: UserSearch, title: "Recruiting", body: "Background, strengths, concerns and the most telling answers, tied to evidence.", template: "Interview template" },
  { icon: Code2, title: "Product & engineering", body: "Per-person progress and blockers from standups, and decisions from planning calls.", template: "Standup template" },
  { icon: Users, title: "Managers & 1:1s", body: "Check-ins, feedback in both directions, growth topics and follow-ups.", template: "1:1 template" },
  { icon: MessageSquareText, title: "Leadership & all-hands", body: "Chapters, decisions and owners for long, many-voiced meetings.", template: "General template" },
];

function UseCases() {
  return (
    <section id="use-cases" className="relative px-5 py-24 md:px-10">
      <Stars density={70} />
      <div className="relative mx-auto max-w-[1300px]">
        <Reveal>
          <h2 className={clsx(display, "text-center text-[38px] font-light text-white md:text-[56px]")}>Notes shaped for the meeting you had</h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-[16px] text-zinc-400">Switch templates on any meeting. Each one asks different questions of the same transcript.</p>
        </Reveal>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {USE_CASES.map(({ icon: Icon, title, body, template }, i) => (
            <Reveal key={title} delay={(i % 3) * 100}>
              <div className="group h-full rounded-2xl border border-white/10 bg-white/[0.03] p-7 transition-colors hover:border-[#38b6ff]/50 hover:bg-white/[0.06]">
                <Icon className="size-8 text-[#38b6ff]" strokeWidth={1.4} />
                <h3 className={clsx(display, "mt-5 text-[24px] font-light text-white")}>{title}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-zinc-400">{body}</p>
                <p className="mt-5 inline-flex rounded-full bg-[#38b6ff]/10 px-3 py-1 text-[12px] text-[#7cc4ff]">{template}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------- Works where you meet ---- */
function WorksWhereYouMeet() {
  const chips = [
    { label: "Google Meet", pos: "left-[6%] top-[30%]" },
    { label: "Zoom", pos: "right-[8%] top-[22%]" },
    { label: "Microsoft Teams", pos: "left-[14%] bottom-[16%]" },
    { label: "Any browser tab", pos: "right-[4%] bottom-[26%]" },
    { label: "Uploaded recordings", pos: "left-[38%] top-[4%]" },
    { label: "Google Calendar", pos: "right-[30%] bottom-[2%]" },
  ];
  return (
    <section className="relative overflow-hidden px-5 py-24 md:px-10">
      <Stars density={90} />
      <Reveal className="relative mx-auto max-w-5xl">
        <p className="text-center text-[14px] text-[#fff27a]">✦ Your tools, your way</p>
        <h2 className={clsx(display, "mt-3 text-center text-[38px] font-light text-white md:text-[56px]")}>Works where you meet</h2>
        <div className="relative mx-auto mt-14 h-[380px] max-w-3xl md:h-[440px]">
          <div aria-hidden className="absolute inset-0"
            style={{ backgroundImage: "linear-gradient(rgba(197,107,255,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(197,107,255,0.18) 1px, transparent 1px)", backgroundSize: "44px 44px", maskImage: "radial-gradient(circle at center, black 35%, transparent 72%)" }} />
          <div className="absolute left-1/2 top-1/2 grid size-36 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black shadow-[0_0_80px_10px_rgba(197,107,255,0.45)] ring-1 ring-white/10">
            <img src="/favicon.svg" alt="" className="size-16" />
          </div>
          {chips.map((c) => (
            <span key={c.label} className={clsx("absolute rounded-lg bg-white/10 px-3 py-1.5 text-[13px] text-zinc-100 ring-1 ring-white/15 backdrop-blur", c.pos)}>{c.label}</span>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------------------ Pricing ---- */
function Pricing() {
  const { signupTo, tryDemo, demoBusy } = useCtas();
  const features = [
    "Unlimited recordings (upload or browser tab)", "Transcripts with speaker labels", "AI notes in six templates",
    "Action items with owners and timestamps", "Chapters, talk time and speaker timelines", "Search across every meeting",
    "Shareable clips with public links", "Google Calendar + meeting alerts",
  ];
  return (
    <section id="pricing" className="relative px-5 py-24 md:px-10">
      <Stars density={60} />
      <Reveal className="relative mx-auto max-w-3xl text-center">
        <h2 className={clsx(display, "text-[38px] font-light text-white md:text-[56px]")}>Simple pricing: free</h2>
        <p className="mx-auto mt-4 max-w-lg text-[16px] text-zinc-400">This is a one-day rebuild, so everything is included while it's in beta.</p>
        <div className="mx-auto mt-12 max-w-xl rounded-[28px] border border-[#38b6ff]/40 bg-gradient-to-b from-[#38b6ff]/10 to-transparent p-8 text-left md:p-10">
          <div className="flex items-baseline justify-between">
            <p className={clsx(display, "text-[26px] text-white")}>Free</p>
            <p className="text-zinc-400"><span className={clsx(display, "text-[44px] font-light text-white")}>$0</span> / forever</p>
          </div>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {features.map((f) => (
              <li key={f} className="flex gap-2 text-[14px] text-zinc-200"><span className="text-[#38b6ff]">✓</span>{f}</li>
            ))}
          </ul>
          <div className="mt-10 flex flex-wrap gap-3">
            <PillButton to={signupTo}>Get started – free</PillButton>
            <PillButton variant="ghost" onClick={tryDemo} busy={demoBusy}>Try the demo first</PillButton>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/* ---------------------------------------------------------------------- FAQ ---- */
const FAQS = [
  { q: "Does a bot join my calls?", a: "No. You capture the call yourself: record the meeting's browser tab (your microphone is mixed in) or upload a recording. Upcoming meetings from Google Calendar get a one-click Join & record button, and an alert if a meeting starts while nothing is recording." },
  { q: "Which meeting apps does it work with?", a: "Anything that runs in a browser tab (Google Meet, Zoom, Microsoft Teams) plus uploaded MP4, MOV, WebM, MP3, M4A or WAV files." },
  { q: "How do I know the AI notes are right?", a: "Every bullet and action item links to the transcript line it came from, and the app checks those citations against the transcript. Click a timestamp and listen." },
  { q: "Who can see my meetings?", a: "Only you. Every table is protected by row-level security. A clip becomes public only when you share it, and you can turn the link off at any time." },
  { q: "Is this Fathom?", a: "No. It's an independent rebuild of fathom.video made for a coding assessment, and it isn't affiliated with Fathom." },
];

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="relative px-5 py-24 md:px-10">
      <div className="mx-auto max-w-3xl">
        <h2 className={clsx(display, "text-center text-[38px] font-light text-white md:text-[52px]")}>Questions</h2>
        <div className="mt-12 divide-y divide-white/10 border-y border-white/10">
          {FAQS.map((f, i) => (
            <div key={f.q}>
              <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between gap-4 py-5 text-left" aria-expanded={open === i}>
                <span className={clsx(display, "text-[18px] text-white md:text-[20px]")}>{f.q}</span>
                <ChevronDown className={clsx("size-5 shrink-0 text-zinc-400 transition-transform", open === i && "rotate-180")} />
              </button>
              <div className={clsx("grid transition-all duration-300", open === i ? "grid-rows-[1fr] pb-5" : "grid-rows-[0fr]")}>
                <p className="overflow-hidden text-[15px] leading-relaxed text-zinc-400">{f.a}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- Final CTA ---- */
function FinalCta() {
  const { signupTo, signedIn } = useCtas();
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-[#e07bd8] via-[#b13cf5] to-[#8a00ff] px-5 py-28 md:px-10">
      <div aria-hidden className="absolute inset-0"
        style={{ backgroundImage: "repeating-radial-gradient(circle at 50% 40%, transparent 0 46px, rgba(255,190,240,0.55) 47px 50px)", maskImage: "linear-gradient(to bottom, black, transparent 95%)" }} />
      <Reveal className="relative text-center">
        <p className="text-[14px] text-zinc-900/70">✦ Notes that hold up</p>
        <h2 className={clsx(display, "mx-auto mt-3 max-w-3xl text-[38px] font-light leading-tight text-white md:text-[60px]")}>
          Stop scrubbing recordings. Search them.<br />Start today, for free.
        </h2>
        <PillButton to={signupTo} variant="yellow" className="mt-10">{signedIn ? "Open the app" : "Get started. It's free."}</PillButton>
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------------------- Footer ---- */
function Footer() {
  const { signupTo, tryDemo } = useCtas();
  const cols: { title: string; links: { label: string; href?: string; to?: string; onClick?: () => void }[] }[] = [
    { title: "Product", links: [{ label: "Overview", href: "#overview" }, { label: "Features", href: "#features" }, { label: "Pricing", href: "#pricing" }, { label: "Live demo", onClick: tryDemo }] },
    { title: "Use cases", links: USE_CASES.slice(0, 5).map((u) => ({ label: `For ${u.title.toLowerCase()}`, href: "#use-cases" })) },
    { title: "Resources", links: [{ label: "Source code", href: "https://github.com/samiarif02/fathom-clone" }, { label: "FAQ", href: "#faq" }, { label: "How it works", href: "#how" }] },
    { title: "Account", links: [{ label: "Sign up", to: "/login?mode=signup" }, { label: "Log in", to: "/login" }, { label: "Privacy policy", to: "/privacy" }] },
  ];
  return (
    <footer className="bg-[#1b1b1b] px-5 pb-10 pt-14 md:px-10">
      <div className="mx-auto max-w-[1400px]">
        <Logo />
        <div className="mt-10 grid gap-10 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
          {cols.map((c) => (
            <div key={c.title}>
              <p className="text-[14px] text-zinc-500">{c.title}</p>
              <ul className="mt-4 space-y-3">
                {c.links.map((l) => (
                  <li key={l.label}>
                    {l.to ? <Link to={l.to} className="text-[15px] text-zinc-200 hover:text-white">{l.label}</Link>
                      : l.onClick ? <button onClick={l.onClick} className="text-[15px] text-zinc-200 hover:text-white">{l.label}</button>
                        : <a href={l.href} className="text-[15px] text-zinc-200 hover:text-white" {...(l.href?.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}>{l.label}</a>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div><PillButton to={signupTo}>Try it today</PillButton></div>
        </div>
        <div className="mt-14 flex flex-col gap-3 border-t border-white/10 pt-6 text-[13px] text-zinc-500 md:flex-row md:justify-between">
          <p>An independent one-day rebuild of fathom.video for a coding assessment. Not affiliated with Fathom.</p>
          <p>© 2026 Fathom Clone</p>
        </div>
      </div>
    </footer>
  );
}

export default function Landing() {
  useEffect(() => {
    const root = document.documentElement;
    root.style.scrollBehavior = "smooth";
    document.body.style.background = "#000";
    return () => { root.style.scrollBehavior = ""; document.body.style.background = ""; };
  }, []);
  return (
    <div className="min-h-full bg-black font-[family-name:var(--font-display)] text-white antialiased">
      <Nav />
      <main>
        <Hero />
        <ProofStrip />
        <FeatureCarousel />
        <Marquee />
        <Audiences />
        <Pillars />
        <Stats />
        <ProductShot />
        <Statements />
        <UseCases />
        <WorksWhereYouMeet />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
