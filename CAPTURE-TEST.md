# Capture test

## Tool and model

- **Tool:** Claude Code 2.1.278 (CLI)
- **Model:** `claude-opus-5-5` (Opus 5.5) wrote the hook; `claude -p` sessions on
  this machine default to `claude-opus-5`. One model both plans and executes;
  there is no separate planner. Every entry records the model that produced
  it, so a switch shows up in the log.
- **Automatic mechanism:** yes. Claude Code hooks, configured per project in
  `.claude/settings.json`, run a command on lifecycle events with no manual
  step.

## Mechanism

|                     |                                                                  |
| ------------------- | ---------------------------------------------------------------- |
| Config file changed | `.claude/settings.json`                                          |
| Scripts             | `.claude/hooks/capture.sh` → `.claude/hooks/capture.mjs`         |
| Prompt event        | `UserPromptSubmit` → `capture.sh prompt`                         |
| End-of-turn event   | `Stop` → `capture.sh response`                                   |
| Output              | `.agent-logs/YYYY-MM-DD_HH-MM-SS_<session-id>.md`, one per session |

- The prompt is written the moment it is submitted, so it is recorded even if
  the turn is interrupted.
- The response is `last_assistant_message` from the `Stop` payload: the final
  message only, with no thinking, tool calls or subagent output. If the
  payload lacks it, the newest main-thread (non-sidechain) assistant entry in
  the transcript is used instead.
- Entries are append-only. The frontmatter (`model`, `total_exchanges`,
  first/last prompt time) is recomputed from the entries on every write.
- `.agent-logs/` is not in `.gitignore`.

### What the payloads contain (probed, not assumed)

Before writing the script, a throwaway project dumped the raw payloads of
`SessionStart`, `UserPromptSubmit` and `Stop` from a real `claude -p` session:

- `UserPromptSubmit`: `session_id`, `transcript_path`, `cwd`, `prompt_id`,
  `permission_mode`, `prompt`. **No model.**
- `Stop`: the same, plus `last_assistant_message`, `stop_hook_active` and
  `effort`. **No model.**
- `SessionStart`: `source`, but **no model** either.
- In the transcript, the model appears only on `assistant` entries
  (`message.model`).

As a result, a prompt records the model that last answered in that session.
**The first prompt of every session records `model: unknown`**, because
nothing has answered yet. The response that follows names the real model, and
so does the frontmatter. I left it as `unknown` rather than guess from a
settings alias.

## Canaries

Result: **pass.** Two separate sessions, two separate files. Each file has at
least one PROMPT and one RESPONSE, both with UTC timestamps and the model. No
errors in `capture-errors.log`.

- Log files:
  - Session 1: `.agent-logs/2026-10-03_17-16-56_1b34b799-a7ae-4e3d-8a86-c3ed83c918c3.md`
  - Session 2: `.agent-logs/2026-10-03_17-24-44_489ac014-96f4-445c-87ca-4b5c8beef123.md`

- Canary 1, raw (session 1, entry 3):

  ```
  [LOG_ENTRY type=PROMPT num=3 session=1b34b799]
  timestamp: 2026-10-03T17:22:25.362Z
  model: claude-opus-5-5

  CAPTURE TEST — 8x assignment, Sami Arif


  [LOG_ENTRY type=RESPONSE num=3 session=1b34b799]
  timestamp: 2026-10-03T17:22:32.738Z
  model: claude-opus-5-5

  Canary 1 is logged. It's PROMPT 3 in `.agent-logs/2026-10-03_17-16-56_1b34b799-a7ae-4e3d-8a86-c3ed83c918c3.md`, recorded at `2026-10-03T17:22:25.362Z` with `model: claude-opus-5-5`, exactly as you typed it.

  My previous reply also reached the file, as RESPONSE 2, so both the prompt and response hooks work in this session. No capture errors have been written.

  This reply is saved as RESPONSE 3 when the turn ends. Session 2 will confirm it, since it checks every entry when it fills in `CAPTURE-TEST.md`.

  Next, type `/exit`, then run `claude` again in this folder and send the second canary.
  ```

- Canary 2 (session 2, entry 1): the planned standalone second-canary
  session was skipped. Instead, the build kickoff session was used as the
  second session, by choice. Its first exchange proves the same thing: a new
  session id gets a new file, the first prompt is `model: unknown`, and the
  response is captured. The entries are too long to paste whole, so here are
  the raw headers and the first line of each (full text at lines 19–140 of the
  session 2 file):

  ```
  [LOG_ENTRY type=PROMPT num=1 session=489ac014]
  timestamp: 2026-10-03T17:24:44.051Z
  model: unknown

  <pasted_content id="429c">
  ...

  [LOG_ENTRY type=RESPONSE num=1 session=489ac014]
  timestamp: 2026-10-03T17:26:57.063Z
  model: claude-opus-5-5

  I've finished reading the repo. I have the plan and data model ready, but three things need your answer before I build anything.
  ...
  ```

- Known gap: session 1's PROMPT 1 (the pasted brief) has no RESPONSE 1.
  "continue" was sent mid-turn, so it was logged as PROMPT 2, and the one
  reply that answered both was filed as RESPONSE 2. Left as is.

## What did not work first, and other notes

1. **`node` is not on PATH here.** Node is installed through nvm, but nvm is
   not loaded by the shell profile, and the Bash environment Claude Code ran
   in had no `node`, `npm` or `npx`. A hook calling `node` directly would have
   failed on every event. `capture.sh` looks for node on PATH, then in the nvm
   folders and Homebrew. The dry run proves this by running the hook with
   `PATH=/usr/bin:/bin`.
2. **Silent failure was the risk I designed against.** A hook that swallows
   its errors can drop every response without anyone noticing. On error,
   `capture.mjs` exits 1 (Claude Code shows this as a non-blocking hook error)
   and appends the stack trace to `.claude/hooks/capture-errors.log`
   (gitignored).
3. **The first draft trimmed trailing whitespace** off prompts and responses.
   That is a small cleanup, but it is still a cleanup, and the brief says
   verbatim. Removed.
4. **A pasted log can look like a log.** The 8x setup prompt itself contains
   example `[LOG_ENTRY ...]` lines. Entry headers are therefore matched only
   at the start of a line, with this session's id, so pasted examples never
   change the numbering or counts. The dry run includes such a prompt.
5. **The hook was written in an uncaptured session.** That session was
   started in a different directory, so this repo's hooks were not loaded for
   it. Every session started in this repo from here on is captured from its
   first prompt.

### Offline dry run

The dry run used fake payloads against a fake transcript, with
`PATH=/usr/bin:/bin`. It checked:

- First prompt → `model: unknown`.
- The response is taken from `last_assistant_message`.
- A thinking block and a newer subagent entry in the transcript do not appear
  in the log.
- A multi-line prompt containing a fake `LOG_ENTRY` header is stored verbatim
  and does not affect numbering.
- The response falls back to the transcript when `last_assistant_message` is
  missing.
- The frontmatter lists both models after a switch (`claude-opus-5-5,
  claude-sonnet-5-5`).

The end-to-end check ran two separate real `claude -p` sessions in a scratch
copy of the repo. Both produced a file with a PROMPT and a RESPONSE entry.
