import { fileURLToPath } from "node:url";
import { z } from "zod";
import { readJson } from "../_shared/json";

const LLM_MODELS_PATH = fileURLToPath(new URL("../../../config/llm-models.json", import.meta.url));

/**
 * One LLM `scripts/classify-llm.ts` may use, with the settings tuned to
 * its provider's free-tier quota shape. Two providers bottleneck on
 * different things, which is why these are per-model rather than global:
 * Gemini caps *requests* per day (so batches should be as large as
 * possible), Groq caps *tokens* per minute and per day (so a batch must
 * stay under the per-minute token cap, and requests are paced by tokens
 * spent rather than by count). Array order is the rotation's priority
 * order: a batch goes to the first enabled model that can serve it.
 */
const LlmModelSchema = z
  .object({
    id: z
      .string()
      .describe(
        "The provider's model id, exactly as its API expects it, e.g. 'gemini-3.8-flash' or 'openai/gpt-oss-20b'.",
      ),
    provider: z
      .enum(["gemini", "groq"])
      .describe(
        "Which API adapter serves this model — decides the request format, auth, and how quota errors are read.",
      ),
    enabled: z
      .boolean()
      .describe(
        "false keeps the settings on file but leaves the model out of the rotation (it can still be forced with --models).",
      ),
    batchSize: z
      .int()
      .positive()
      .describe(
        "Apps per request. Large for request-capped providers (Gemini); for token-capped ones (Groq), small enough that one request's input + output + reasoning tokens stay under tokensPerMinute.",
      ),
    requestsPerMinute: z
      .number()
      .positive()
      .describe("Request pacing for this model — at or below its per-minute request quota."),
    tokensPerMinute: z
      .int()
      .positive()
      .optional()
      .describe(
        "Token pacing for token-capped providers: after each request, the model's next slot is pushed back by (tokens used / tokensPerMinute) minutes. Omit for request-capped providers.",
      ),
    outputTokensPerMinute: z
      .int()
      .positive()
      .optional()
      .describe(
        "Output-only token pacing, for providers that also cap output tokens per minute (Groq's qwen3.8-27b: 1,000). Same mechanism as tokensPerMinute, counting only output tokens.",
      ),
    maxOutputTokens: z
      .int()
      .positive()
      .optional()
      .describe(
        "Explicit per-request output cap. Needed where the provider checks a request's *requested* output against a per-minute output cap before running it (Groq rejects the request outright otherwise). Keep batchSize small enough that its answers fit — a truncated answer is unparseable and the batch moves to the next model.",
      ),
    reasoning: z
      .enum(["none", "minimal", "low", "medium", "high"])
      .describe(
        "Reasoning effort, mapped to the provider's own parameter (Gemini thinkingLevel, Groq reasoning_effort) — reasoning tokens count against quota, and classifying from a name + one line rarely needs more than 'low'. Not every model accepts every level (e.g. Groq's gpt-oss has no 'none').",
      ),
    overloadRetries: z
      .int()
      .min(0)
      .describe(
        "Same-model retries on an overload error (5xx) before moving on to the next model. 0 when failed requests count against the daily quota (observed on Gemini's free tier).",
      ),
    reason: z
      .string()
      .describe(
        "Why this model is in the list, at this position, with these settings — so a later edit knows what it's trading off.",
      ),
  })
  .strict();

export type LlmModel = z.infer<typeof LlmModelSchema>;

export const LlmModelsListSchema = z.array(LlmModelSchema).meta({
  title: "Enrich: LLM models",
  description:
    "The models `pnpm classify-llm` rotates through, in priority order, with per-model batch size, pacing, reasoning effort, and overload-retry settings tuned to each provider's free-tier quota shape.",
});

/** Loads the LLM model list (`config/llm-models.json`, missing file reads as empty). */
export function loadLlmModels(): LlmModel[] {
  return readJson(LLM_MODELS_PATH, LlmModelsListSchema);
}
