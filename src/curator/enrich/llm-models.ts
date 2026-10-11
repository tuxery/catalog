import { fileURLToPath } from "node:url";
import { z } from "zod";
import { readJson } from "../_shared/json";

const LLM_MODELS_PATH = fileURLToPath(new URL("../../../config/llm-models.json", import.meta.url));

/**
 * One Gemini model `scripts/classify-llm.ts` may use, with the settings
 * tuned to its free-tier quota: Gemini caps *requests* per day per model,
 * so batches should be as large as a response still comes back complete.
 * Array order is the rotation's priority order: a batch goes to the first
 * enabled model that can serve it.
 */
const LlmModelSchema = z
  .object({
    id: z
      .string()
      .describe("The Gemini API model id, exactly as the API expects it, e.g. 'gemini-3.8-flash'."),
    enabled: z
      .boolean()
      .describe(
        "false keeps the settings on file but leaves the model out of the rotation (it can still be forced with --models).",
      ),
    batchSize: z.int().positive().describe("Apps per request."),
    requestsPerMinute: z
      .number()
      .positive()
      .describe("Request pacing for this model — at or below its per-minute request quota."),
    reasoning: z
      .enum(["minimal", "low", "medium", "high"])
      .describe(
        "Gemini thinkingLevel ('minimal' is its floor) — reasoning tokens count against quota, and classifying from a name + one line rarely needs more than 'low'.",
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
    "The Gemini models `pnpm classify-llm` rotates through, in priority order, with per-model batch size, pacing, reasoning effort, and overload-retry settings tuned to the free-tier quota.",
});

/** Loads the LLM model list (`config/llm-models.json`, missing file reads as empty). */
export function loadLlmModels(): LlmModel[] {
  return readJson(LLM_MODELS_PATH, LlmModelsListSchema);
}
