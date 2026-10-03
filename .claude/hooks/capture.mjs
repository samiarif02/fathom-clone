// Records every turn of a Claude Code session in .agent-logs/, one file per
// session: the prompt verbatim (UserPromptSubmit) and the final response
// (Stop). Nothing in between -- no thinking, tool calls or subagent output.
//
// Entries are only ever appended. The frontmatter is recomputed from the
// entries on each write, so nothing already recorded is rewritten.
//
//   node capture.mjs prompt     # UserPromptSubmit
//   node capture.mjs response   # Stop

import fs from 'node:fs';
import path from 'node:path';

const AUTHOR = process.env.AGENT_LOG_AUTHOR || 'samiarif02';
const TOOL = 'claude-code';

const mode = process.argv[2];
const input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const project = process.env.AGENT_LOG_PROJECT || path.basename(projectDir);
const logDir = path.join(projectDir, '.agent-logs');
const sessionId = input.session_id || 'unknown-session';
const short = sessionId.slice(0, 8);

try {
  if (mode === 'prompt') await onPrompt();
  else if (mode === 'response') await onResponse();
  else throw new Error(`unknown mode "${mode}"`);
} catch (err) {
  // Fail loudly (exit 1 is a non-blocking error Claude Code shows the user) and
  // keep a local trace, so a broken hook is never silent.
  const trace = path.join(projectDir, '.claude', 'hooks', 'capture-errors.log');
  fs.appendFileSync(trace, `${new Date().toISOString()} ${mode} ${sessionId}: ${err.stack}\n`);
  console.error(`agent-log capture failed: ${err.message}`);
  process.exit(1);
}

async function onPrompt() {
  const now = new Date();
  const file = logFile(now);
  const entries = readEntries(file);
  const num = Math.max(0, ...entries.map((e) => e.num)) + 1;
  // The model that will answer is not in the payload; the last model to answer
  // in this session is. The first prompt of a session has none yet.
  const model = (await lastAssistant(input.transcript_path, 0))?.model ?? 'unknown';
  append(file, entry('PROMPT', num, now, model, input.prompt ?? ''));
}

async function onResponse() {
  const now = new Date();
  const file = logFile(now);
  const entries = readEntries(file);
  // Pair with the latest prompt. 0 means the prompt was never captured (the
  // hook was installed mid-turn); the response is still real, so it is kept.
  const prompts = entries.filter((e) => e.type === 'PROMPT');
  const num = prompts.length ? prompts[prompts.length - 1].num : 0;
  // The transcript's last line may not be flushed when Stop fires; wait briefly.
  const last = await lastAssistant(input.transcript_path, 2000);
  const text = input.last_assistant_message ?? last?.text ?? '';
  append(file, entry('RESPONSE', num, now, last?.model ?? 'unknown', text));
}

function logFile(now) {
  fs.mkdirSync(logDir, { recursive: true });
  const existing = fs.readdirSync(logDir).find((f) => f.endsWith(`_${sessionId}.md`));
  if (existing) return path.join(logDir, existing);
  const stamp = now.toISOString().slice(0, 19).replace('T', '_').replaceAll(':', '-');
  return path.join(logDir, `${stamp}_${sessionId}.md`);
}

function entry(type, num, time, model, body) {
  return (
    `[LOG_ENTRY type=${type} num=${num} session=${short}]\n` +
    `timestamp: ${time.toISOString()}\n` +
    `model: ${model}\n\n` +
    // Verbatim: no trimming. Only a line break is added if the text lacks one.
    `${body}${body.endsWith('\n') ? '' : '\n'}\n\n`
  );
}

// Entry headers are matched on this session's id at the start of a line, so a
// pasted example log inside a prompt is not mistaken for a real entry.
function readEntries(file) {
  return fs.existsSync(file) ? parseEntries(fs.readFileSync(file, 'utf8')) : [];
}

function parseEntries(raw) {
  const re = new RegExp(
    `^\\[LOG_ENTRY type=(PROMPT|RESPONSE) num=(\\d+) session=${short}\\]\\n` +
      `timestamp: (\\S+)\\nmodel: (\\S+)$`,
    'gm',
  );
  return [...raw.matchAll(re)].map((m) => ({ type: m[1], num: +m[2], time: m[3], model: m[4] }));
}

function append(file, text) {
  const raw = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const start = raw.indexOf(`[LOG_ENTRY `);
  const body = (start === -1 ? '' : raw.slice(start)) + text;
  fs.writeFileSync(file + '.tmp', header(body) + body);
  fs.renameSync(file + '.tmp', file);
}

function header(body) {
  const entries = parseEntries(body);
  const prompts = entries.filter((e) => e.type === 'PROMPT');
  const models = [...new Set(entries.map((e) => e.model).filter((m) => m !== 'unknown'))];
  const first = prompts[0]?.time ?? entries[0]?.time ?? '';
  const last = prompts.at(-1)?.time ?? '';
  const date = (first || new Date().toISOString()).slice(0, 10);
  return `---
session_id: ${sessionId}
date: ${date}
author: ${AUTHOR}
model: ${models.join(', ') || 'unknown'}
tool: ${TOOL}
project: ${project}
total_exchanges: ${prompts.length}
first_prompt_time: ${first}
last_prompt_time: ${last}
---

# Session Log - ${date}

Session: \`${short}\` | Project: \`${project}\` | Author: \`${AUTHOR}\`

---

`;
}

// The newest main-thread (not subagent) assistant entry: its model, and the
// text of the final message. Polls up to `waitMs` for it to be flushed.
async function lastAssistant(transcriptPath, waitMs) {
  const deadline = Date.now() + waitMs;
  for (;;) {
    const found = scan(transcriptPath);
    if (found || Date.now() >= deadline) return found;
    await new Promise((r) => setTimeout(r, 150));
  }
}

function scan(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return null;
  const lines = fs.readFileSync(transcriptPath, 'utf8').trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    let e;
    try {
      e = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    if (e.type !== 'assistant' || e.isSidechain || !e.message?.model) continue;
    const content = Array.isArray(e.message.content) ? e.message.content : [];
    const text = content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n');
    return { model: e.message.model, text };
  }
  return null;
}
