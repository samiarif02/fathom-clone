import { useCallback, useEffect, useRef, useState } from "react";

/** Owns the <video>/<audio> element and exposes a smoothly updating playhead in ms. */
export function usePlayer() {
  const ref = useRef<HTMLVideoElement | null>(null);
  // The element mounts after data loads; a callback ref puts it in state so the effect attaches then.
  const [el, setEl] = useState<HTMLVideoElement | null>(null);
  const setRef = useCallback((node: HTMLMediaElement | null) => {
    ref.current = node as HTMLVideoElement | null;
    setEl(node as HTMLVideoElement | null);
  }, []);
  const [ms, setMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const pending = useRef<number | null>(null);

  useEffect(() => {
    if (!el) return;
    let raf = 0;
    const sync = () => setMs(Math.round(el.currentTime * 1000));
    const tick = () => {
      sync();
      if (!el.paused) raf = requestAnimationFrame(tick);
    };
    const onPlay = () => { setPlaying(true); cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); };
    const onPause = () => { setPlaying(false); cancelAnimationFrame(raf); tick(); };
    const onLoaded = () => {
      if (pending.current != null) { el.currentTime = pending.current / 1000; pending.current = null; }
    };
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("seeked", sync);
    el.addEventListener("timeupdate", sync); // fallback if animation frames are throttled
    el.addEventListener("loadedmetadata", onLoaded);
    // If the element was already playing when we attached, keep the playhead loop going.
    if (!el.paused) raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("seeked", sync);
      el.removeEventListener("timeupdate", sync);
      el.removeEventListener("loadedmetadata", onLoaded);
    };
  }, [el]);

  const seek = useCallback((toMs: number, play = true) => {
    const el = ref.current;
    setMs(toMs);
    if (!el) return;
    if (el.readyState < 1) pending.current = toMs;
    else el.currentTime = toMs / 1000;
    if (play) el.play().catch(() => {});
  }, []);

  const toggle = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  }, []);

  return { ref, setRef, ms, playing, seek, toggle };
}

export type Player = ReturnType<typeof usePlayer>;

/** Index of the segment being spoken at `ms` (last one that has started). Binary search. */
export function activeIndex(segments: { start_ms: number }[], ms: number) {
  let lo = 0, hi = segments.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid].start_ms <= ms) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}
