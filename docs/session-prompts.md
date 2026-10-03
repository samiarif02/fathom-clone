# Session prompts

The prompts to send, in order. Run every session from this folder
(`~/WebstormProjects/fathom-rebuild`), not from `../fathom-clone`. The capture
hook only fires for sessions started in this repo.

## Session 1

Message 1: paste the whole "8x Assignment — Agent Capture Setup" file, unchanged.
The brief says it must be the first message. The agent should find the hook already
installed and check it.

Message 2:

```
CAPTURE TEST — 8x assignment, Sami Arif
```

Then type `/exit`.

## Session 2

Run `claude` again in the same folder.

Message 1:

```
CAPTURE TEST — 8x assignment, Sami Arif (second session, to prove the hook is not session-local)
```

Message 2:

```
Both canaries are done. Check that both sessions' files in .agent-logs/ each contain a PROMPT and a RESPONSE. Then fill in the Canaries section of CAPTURE-TEST.md with the two log file paths and both canary entries pasted raw (session 1's prompt + response, and this session's). Commit CAPTURE-TEST.md together with .agent-logs/ and push.
```

## Session 3: build kickoff (send after using Fathom)

```
Capture is verified (CAPTURE-TEST.md). Now the actual assignment. Here is the brief, verbatim:

<paste the full "Rebuild a live product in 24 hours… fathom.video" brief here>

Context:
- I'm Sami (GitHub samiarif02). This repo is github.com/samiarif02/fathom-clone (public). I'm building this myself from scratch. ../fathom-clone on disk is a colleague's separate project: do not open, read or copy anything from it.
- I've used fathom.video on the free plan. My screenshots, notes, and the transcript/summary from my own test call are in /recon. Read them first. They're the source of truth for how the product behaves.

Stack (push back if you think something is wrong for a one-day build):
- One Cloudflare Worker serving a React + Vite + Tailwind app and the API; R2 for media; Supabase for Postgres + auth.
- AI summaries and action items: <Claude via Anthropic API | Cloudflare Workers AI>.
- The recording bot is stubbed: upload a recording, or record from the browser tab. Say so in the README and walkthrough.
```
