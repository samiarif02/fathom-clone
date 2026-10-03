#!/usr/bin/env python3
"""Render seed meetings to media + timed transcripts.

Each transcript line is voiced with macOS `say`, the clips are joined with short gaps,
and segment timestamps come from the exact audio frame counts, so playback and transcript
line up perfectly. A simple "meeting grid" video highlights whoever is speaking.

Usage: python3 scripts/seed/render.py [slug ...]
Output: scripts/seed/out/<slug>/{meeting.json, media.mp4}  (out/ is gitignored)
"""
import json, os, random, subprocess, sys, wave
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).parent
OUT = ROOT / "out"
RATE_HZ = 24000
W, H = 1280, 720
FONT = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT_REG = "/System/Library/Fonts/Supplemental/Arial.ttf"
COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#a855f7", "#ec4899", "#14b8a6"]

MEETINGS = {
    "q4-planning": dict(
        title="Q4 Planning: Product & Engineering", started_at="2026-09-29T10:00:00-07:00", rate=185,
        source=[f"meetings/q4-planning/ch{i}.txt" for i in range(1, 8)],
        cast=[("Jordan", "Jordan Lee", "Samantha"), ("Daniel", "Daniel Mercer", "Daniel"),
              ("Priya", "Priya Raman", "Tara"), ("Rishi", "Rishi Kapoor", "Rishi"),
              ("Moira", "Moira Byrne", "Moira"), ("Karen", "Karen Walsh", "Karen"),
              ("Aman", "Aman Sethi", "Aman"), ("Tessa", "Tessa van der Merwe", "Tessa")]),
    "halcyon-discovery": dict(
        title="Discovery call: Halcyon Home Services", started_at="2026-10-01T14:00:00-07:00", rate=180,
        source=["meetings/halcyon-discovery.txt"],
        cast=[("Marcus", "Marcus Bell", "Daniel"), ("Linda", "Linda Ortiz", "Karen"), ("Jordan", "Jordan Lee", "Samantha")]),
    "one-on-one-aman": dict(
        title="1:1 Jordan / Aman", started_at="2026-10-02T09:30:00-07:00", rate=180,
        source=["meetings/one-on-one-aman.txt"],
        cast=[("Jordan", "Jordan Lee", "Samantha"), ("Aman", "Aman Sethi", "Aman")]),
    "mobile-standup": dict(
        title="Mobile standup", started_at="2026-10-01T09:15:00-07:00", rate=190,
        source=["meetings/mobile-standup.txt"],
        cast=[("Priya", "Priya Raman", "Tara"), ("Wei", "Wei Chen", "Rishi"), ("Sofia", "Sofia Alvarez", "Tessa"),
              ("Ben", "Ben Carter", "Daniel"), ("Jordan", "Jordan Lee", "Samantha")]),
    "interview-nadia": dict(
        title="Interview: Senior Product Designer (Nadia Hussain)", started_at="2026-09-30T15:00:00-07:00", rate=180,
        source=["meetings/interview-nadia.txt"],
        cast=[("Moira", "Moira Byrne", "Moira"), ("Jordan", "Jordan Lee", "Samantha"), ("Nadia", "Nadia Hussain", "Tara")]),
    "acme-exec-sync": dict(
        title="Acme Mechanical: exec sync", started_at="2026-10-02T11:00:00-07:00", rate=180,
        source=["meetings/acme-exec-sync.txt"],
        cast=[("Karen", "Karen Walsh", "Karen"), ("Jordan", "Jordan Lee", "Samantha"), ("Rishi", "Rishi Kapoor", "Rishi"),
              ("Greg", "Greg Thompson", "Daniel"), ("Helen", "Helen Park", "Moira")]),
}


def parse(cfg):
    turns = []
    for src in cfg["source"]:
        for line in (ROOT / src).read_text().splitlines():
            if line.strip():
                name, text = line.split(": ", 1)
                turns.append((name, text.strip()))
    return turns


def voice_clip(args):
    path, voice, rate, text = args
    if not path.exists():
        subprocess.run(["say", "-v", voice, "-r", str(rate), "--file-format=WAVE",
                        f"--data-format=LEI16@{RATE_HZ}", "-o", str(path), text], check=True)
    with wave.open(str(path)) as w:
        return w.getnframes()


def hex_rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def frame(cfg, active, path):
    """A Zoom-style grid of participant tiles; the active speaker gets a bright border."""
    img = Image.new("RGB", (W, H), (24, 24, 27))
    d = ImageDraw.Draw(img)
    title_font = ImageFont.truetype(FONT_REG, 20)
    d.text((28, 22), f"Fieldnote  ·  {cfg['title']}", fill=(161, 161, 170), font=title_font)
    n = len(cfg["cast"])
    cols = 2 if n <= 4 else 4
    rows = (n + cols - 1) // cols
    pad, top = 16, 70
    tw = (W - pad * (cols + 1)) // cols
    th = min((H - top - pad * (rows + 1)) // rows, int(tw * 0.62))
    y0 = top + ((H - top) - (rows * th + (rows - 1) * pad)) // 2
    for i, (short, full, _) in enumerate(cfg["cast"]):
        r, c = divmod(i, cols)
        in_row = min(cols, n - r * cols)
        x0 = (W - (in_row * tw + (in_row - 1) * pad)) // 2 + c * (tw + pad)
        y = y0 + r * (th + pad)
        color = hex_rgb(COLORS[i % len(COLORS)])
        d.rounded_rectangle((x0, y, x0 + tw, y + th), 14, fill=(39, 39, 42))
        rad = min(tw, th) // 5
        cx, cy = x0 + tw // 2, y + th // 2 - 10
        d.ellipse((cx - rad, cy - rad, cx + rad, cy + rad), fill=color)
        initials = "".join(p[0] for p in full.split()[:2]).upper()
        f = ImageFont.truetype(FONT, int(rad * 0.8))
        d.text((cx, cy), initials, fill="white", font=f, anchor="mm")
        d.text((x0 + 14, y + th - 14), full, fill=(228, 228, 231), font=ImageFont.truetype(FONT_REG, 18), anchor="ls")
        if short == active:
            d.rounded_rectangle((x0, y, x0 + tw, y + th), 14, outline=(74, 222, 128), width=4)
    img.save(path)


def render(slug):
    cfg = MEETINGS[slug]
    work = OUT / slug / "clips"
    work.mkdir(parents=True, exist_ok=True)
    voices = {s: v for s, _, v in cfg["cast"]}
    turns = parse(cfg)
    unknown = {n for n, _ in turns} - voices.keys()
    assert not unknown, f"{slug}: unknown speakers {unknown}"

    jobs = [(work / f"{i:04d}.wav", voices[n], cfg["rate"], t) for i, (n, t) in enumerate(turns)]
    with ThreadPoolExecutor(8) as pool:
        frames = list(pool.map(voice_clip, jobs))

    # Join clips with natural-feeling gaps; timestamps come straight from frame counts.
    rng = random.Random(slug)
    segments, cursor = [], int(RATE_HZ * 1.2)  # a beat of silence before the first word
    audio = OUT / slug / "audio.wav"
    with wave.open(str(audio), "wb") as out:
        out.setnchannels(1); out.setsampwidth(2); out.setframerate(RATE_HZ)
        out.writeframes(b"\0\0" * cursor)
        for (path, *_), nframes, (name, text) in zip(jobs, frames, turns):
            with wave.open(str(path)) as w:
                out.writeframes(w.readframes(nframes))
            start = cursor
            cursor += nframes
            segments.append(dict(speaker=name, start_ms=start * 1000 // RATE_HZ, end_ms=cursor * 1000 // RATE_HZ, text=text))
            gap = int(RATE_HZ * rng.uniform(0.25, 0.7))
            out.writeframes(b"\0\0" * gap)
            cursor += gap
    duration_ms = cursor * 1000 // RATE_HZ

    # Video: one still per speaker, shown for each of their turns (concat demuxer).
    fdir = OUT / slug / "frames"
    fdir.mkdir(exist_ok=True)
    for short, _, _ in cfg["cast"] + [(None, None, None)]:
        frame(cfg, short, fdir / f"{short or '_none'}.png")
    lines, prev_end = [], 0
    for s in segments:
        if s["start_ms"] > prev_end:
            lines += [f"file 'frames/_none.png'", f"duration {(s['start_ms'] - prev_end) / 1000:.3f}"]
        lines += [f"file 'frames/{s['speaker']}.png'", f"duration {(s['end_ms'] - s['start_ms']) / 1000:.3f}"]
        prev_end = s["end_ms"]
    lines += [f"file 'frames/_none.png'", f"duration {(duration_ms - prev_end) / 1000:.3f}", "file 'frames/_none.png'"]
    (OUT / slug / "frames.txt").write_text("\n".join(lines) + "\n")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", "frames.txt",
                    "-i", "audio.wav", "-vf", "fps=5,format=yuv420p", "-c:v", "libx264", "-preset", "veryfast",
                    "-tune", "stillimage", "-crf", "28", "-c:a", "aac", "-b:a", "64k", "-ac", "1",
                    "-shortest", "-movflags", "+faststart", "media.mp4"], cwd=OUT / slug, check=True)

    meeting = dict(
        slug=slug, title=cfg["title"], started_at=cfg["started_at"], duration_ms=duration_ms,
        participants=[dict(short=s, name=full, color=COLORS[i % len(COLORS)]) for i, (s, full, _) in enumerate(cfg["cast"])],
        segments=segments,
    )
    (OUT / slug / "meeting.json").write_text(json.dumps(meeting, indent=1))
    size = (OUT / slug / "media.mp4").stat().st_size / 1e6
    print(f"{slug}: {len(segments)} segments, {duration_ms / 60000:.1f} min, {size:.1f} MB", flush=True)


if __name__ == "__main__":
    for slug in sys.argv[1:] or MEETINGS:
        render(slug)
