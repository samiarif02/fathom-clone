import type { Bindings } from "./env";
import type { AiRunner } from "../shared/pipeline.ts";

/** Workers AI's free plan has a daily allowance; it fails with code 4006 once it's used up. */
export const isQuotaError = (e: unknown) => /4006|daily free allocation|neurons/i.test(e instanceof Error ? e.message : String(e));

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const GEMINI_MODEL = "gemini-2.5-flash";

/** Gemini's OpenAI-compatible endpoint, used only when the Workers AI allowance runs out. */
async function gemini(env: Bindings, body: Record<string, unknown>) {
  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.GEMINI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: GEMINI_MODEL,
      messages: body.messages,
      temperature: body.temperature,
      max_tokens: body.max_tokens,
      reasoning_effort: "low",
    }),
  });
  const json = (await res.json()) as { choices?: unknown[]; error?: { message?: string } } | { error?: { message?: string } }[];
  const err = Array.isArray(json) ? json[0]?.error : json.error;
  if (!res.ok || err) throw new Error(`Gemini: ${err?.message ?? res.status}`);
  return json;
}

/** Chat completions: Workers AI first, Gemini's free tier as a fallback when the daily allowance is gone. */
export const chatAi = (env: Bindings): AiRunner => async (model, body) => {
  try {
    return await env.AI.run(model as Parameters<Ai["run"]>[0], body as never);
  } catch (e) {
    if (isQuotaError(e) && env.GEMINI_API_KEY) return gemini(env, body);
    throw e;
  }
};
