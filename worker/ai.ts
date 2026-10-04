import type { Bindings } from "./env";
import type { AiRunner } from "../shared/pipeline.ts";

/** Workers AI's free plan has a daily allowance; it fails with code 4006 once it's used up. */
export const isQuotaError = (e: unknown) => /4006|daily free allocation|neurons/i.test(e instanceof Error ? e.message : String(e));

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
// Aliases, so a model retirement doesn't break the fallback. Lite is less loaded during spikes.
const GEMINI_MODELS = ["gemini-flash-latest", "gemini-flash-lite-latest"];

/** Gemini's OpenAI-compatible endpoint, used only when the Workers AI allowance runs out. */
async function gemini(env: Bindings, body: Record<string, unknown>): Promise<unknown> {
  let lastError = "";
  for (const model of GEMINI_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(GEMINI_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.GEMINI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: body.messages, temperature: body.temperature, max_tokens: body.max_tokens, reasoning_effort: "low" }),
      });
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } } | { error?: { message?: string } }[];
      const err = Array.isArray(json) ? json[0]?.error : json.error;
      if (res.ok && !err && !Array.isArray(json) && json.choices?.[0]?.message?.content) return json;
      lastError = err?.message ?? `HTTP ${res.status}`;
      // "High demand" (503) and rate limits (429) are momentary: retry once, then try the next model.
      if (res.status !== 503 && res.status !== 429) break;
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
  throw new Error(`Gemini: ${lastError}`);
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
