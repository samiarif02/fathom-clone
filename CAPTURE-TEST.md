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

<!-- Filled in from the two canary sessions. -->

- Log files: _pending_
- Canary 1, raw: _pending_
- Canary 2, raw: _pending_

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
