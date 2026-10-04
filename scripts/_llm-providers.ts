import type { LlmModel } from "../src/curator/enrich/llm-models";
import { parseResults, type BatchResult, type Taxonomy } from "../src/curator/enrich/llm-prompt";

/**
 * One API adapter per provider behind a single `callModel` — request
 * format, auth, and above all how each provider's quota errors map onto
 * the three outcomes the rotation in `classify-llm.ts` acts on:
 *
 * - `RetryLater`: a short per-minute limit — wait and retry this model.
 * - `ModelUnavailable` (daily): this model's daily quota is spent — rest
 *   it until `retryAt` (Gemini: next midnight Pacific; Groq: its rolling
 *   window's own "try again in").
 * - `ModelUnavailable` (not daily): overloaded or unusable output — try
 *   the next model for this batch.
 *
 * Anything else (bad key, malformed request, batch too large for the
 * model's per-minute token cap) is a plain `Error`: a config problem to
 * fix, not something rotating models would solve.
 */

export interface CallResult {
  results: BatchResult[];
  /** Total tokens billed for the request (input + output + reasoning), when the provider reports it — drives token pacing. */
  tokens?: number;
  /** Output tokens alone (answer + reasoning) — drives output-token pacing. */
  outputTokens?: number;
}

export interface Prompt {
  system: string;
  user: string;
  taxonomy: Taxonomy;
}

export class RetryLater extends Error {
  constructor(
    message: string,
    readonly waitMs: number,
  ) {
    super(message);
  }
}

export class ModelUnavailable extends Error {
  constructor(
    message: string,
    readonly daily: boolean,
    /** For a daily quota: when the provider says it frees up again (epoch ms), if known. */
    readonly retryAt?: number,
  ) {
    super(message);
  }
}

/**
 * Next midnight Pacific time (epoch ms), plus a small margin — when
 * Gemini's per-day quotas reset. Read off the wall clock in that zone
 * rather than a fixed UTC offset, so daylight saving is handled.
 */
function nextPacificMidnight(now = Date.now()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(now));
  const part = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const sinceMidnightMs = (part("hour") * 3600 + part("minute") * 60 + part("second")) * 1000;
  return now - sinceMidnightMs + 24 * 3600_000 + 5 * 60_000;
}

/** Parses Groq's "try again in 1h2m31.92s"-style delay (any subset of h/m/s) into ms. */
function parseTryAgainMs(message: string): number | undefined {
  const match = /try again in ((?:\d+(?:\.\d+)?[hms])+)/i.exec(message);
  if (!match?.[1]) return undefined;
  const units: Record<string, number> = { h: 3600_000, m: 60_000, s: 1000 };
  let total = 0;
  for (const [, value, unit] of match[1].matchAll(/(\d+(?:\.\d+)?)([hms])/g)) {
    total += Number(value) * (units[unit as string] ?? 0);
  }
  return total;
}

/**
 * The output schema, shared by both providers: one "n|type|category|k|reason"
 * string per app rather than one JSON object. Measured on qwen3.8-27b
 * (2026-09-27, same 20 apps): output fell from ~28 to ~12 tokens per app —
 * per-field JSON punctuation cost about as much as the fields themselves —
 * with agreement to Gemini unchanged or better, while numbered categories
 * instead of labels dropped agreement to 50%. The flip side: the provider
 * can no longer enforce the type/category enums, so `parseResults` validates
 * every field itself. `strict` adds what Groq's strict json_schema mode
 * requires (closed objects); Gemini's responseSchema, an OpenAPI subset,
 * doesn't accept `additionalProperties`.
 */
function outputSchema(strict: boolean): Record<string, unknown> {
  return {
    type: "object",
    properties: { results: { type: "array", items: { type: "string" } } },
    required: ["results"],
    ...(strict ? { additionalProperties: false } : {}),
  };
}

/**
 * `parseResults` for a successful response. Unparseable output (typically
 * truncated at maxOutputTokens), or output with no valid line at all (the
 * model ignored the format), counts as the model being unavailable, like
 * an overload: the batch moves to the next model, and a model that keeps
 * doing it is dropped by the rotation's overload streak — instead of
 * silently burning quota on answers that yield nothing (11 Gemini requests
 * for 0 apps, 2026-09-29).
 */
function parseOk(text: string | undefined, taxonomy: Taxonomy): BatchResult[] {
  let results: BatchResult[];
  try {
    results = parseResults(text, taxonomy);
  } catch {
    throw new ModelUnavailable("unparseable output (truncated? lower batchSize)", false);
  }
  if (results.length === 0) {
    throw new ModelUnavailable(
      `no valid result line (format ignored?): ${String(text).slice(0, 160)}`,
      false,
    );
  }
  return results;
}

/** `parseResults` on a schema-rejected answer: whatever valid lines it has are already paid for. */
function salvageResults(text: string | undefined, taxonomy: Taxonomy): BatchResult[] {
  try {
    return parseResults(text, taxonomy);
  } catch {
    return [];
  }
}

function requireEnv(name: string, hint: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required — see ${hint}`);
  return value;
}

// --- Gemini ---

interface GeminiErrorDetail {
  retryDelay?: string;
  violations?: { quotaId?: string; quotaValue?: string }[];
}

// Gemini 3's thinkingLevel has no "none"; "minimal" is its floor.
const GEMINI_THINKING: Record<LlmModel["reasoning"], string> = {
  none: "minimal",
  minimal: "minimal",
  low: "low",
  medium: "medium",
  high: "high",
};

/** The system prompt folded into the user message, for `plainPrompt` models that take no system role. */
function plainUserText(prompt: Prompt): string {
  return `${prompt.system}\n\n${prompt.user}`;
}

async function callGemini(model: LlmModel, prompt: Prompt): Promise<CallResult> {
  const apiKey = requireEnv(
    model.apiKeyEnv ?? "GEMINI_API_KEY",
    "https://aistudio.google.com/apikey",
  );
  // Gemma on the Gemini API (`plainPrompt`) rejects systemInstruction, JSON
  // mode and thinkingConfig alike: everything goes in the one user message.
  const plain = model.plainPrompt === true;
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(plain ? {} : { systemInstruction: { parts: [{ text: prompt.system }] } }),
        contents: [
          { role: "user", parts: [{ text: plain ? plainUserText(prompt) : prompt.user }] },
        ],
        generationConfig: {
          ...(plain
            ? {}
            : {
                responseMimeType: "application/json",
                responseSchema: outputSchema(false),
                thinkingConfig: { thinkingLevel: GEMINI_THINKING[model.reasoning] },
              }),
          temperature: 0,
          ...(model.maxOutputTokens === undefined
            ? {}
            : { maxOutputTokens: model.maxOutputTokens }),
        },
      }),
    },
  );
  if (response.ok) {
    const body = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: {
        totalTokenCount?: number;
        candidatesTokenCount?: number;
        thoughtsTokenCount?: number;
      };
    };
    const usage = body.usageMetadata;
    return {
      results: parseOk(body.candidates?.[0]?.content?.parts?.[0]?.text, prompt.taxonomy),
      tokens: usage?.totalTokenCount,
      outputTokens:
        usage?.candidatesTokenCount === undefined
          ? undefined
          : usage.candidatesTokenCount + (usage.thoughtsTokenCount ?? 0),
    };
  }
  const bodyText = await response.text();
  if (response.status === 429) {
    // google.rpc details say which quota was hit — a per-day quotaId means
    // this model is done for today — and Google's own suggested retryDelay.
    let details: GeminiErrorDetail[] = [];
    try {
      details =
        (JSON.parse(bodyText) as { error?: { details?: GeminiErrorDetail[] } }).error?.details ??
        [];
    } catch {
      // Non-JSON body — treated as a per-minute limit below.
    }
    const violations = details.flatMap((detail) => detail.violations ?? []);
    const quota =
      violations.map((v) => `${v.quotaId} (limit ${v.quotaValue})`).join(", ") || "unknown quota";
    if (violations.some((v) => /PerDay/i.test(v.quotaId ?? ""))) {
      throw new ModelUnavailable(`daily quota hit: ${quota}`, true, nextPacificMidnight());
    }
    const delay = details.find((detail) => detail.retryDelay)?.retryDelay;
    throw new RetryLater(`429 ${quota}`, delay ? Number.parseFloat(delay) * 1000 : 30_000);
  }
  if (response.status >= 500) {
    throw new ModelUnavailable(`overloaded (${response.status})`, false);
  }
  throw new Error(`Gemini ${model.id} ${response.status}: ${bodyText}`);
}

// --- OpenAI-compatible (Groq, and provider "openai": Mistral, NVIDIA NIM, ...) ---

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

function responseFormat(model: LlmModel): Record<string, unknown> {
  if (model.responseFormat === "json_object") return { type: "json_object" };
  return {
    type: "json_schema",
    json_schema: { name: "classification_results", strict: true, schema: outputSchema(true) },
  };
}

/**
 * One chat-completions call. Groq is this same API with its own base URL,
 * key and `reasoning_effort` (the generic "openai" provider doesn't send
 * it: support varies per API). Error handling is Groq's, the most detailed
 * of the lot — its specific codes (413, json_validate_failed, 498) simply
 * never occur elsewhere, and a generic 429 is read the same way: "per day"
 * / "daily" in the message means the daily quota.
 */
async function callOpenAiCompatible(model: LlmModel, prompt: Prompt): Promise<CallResult> {
  const groq = model.provider === "groq";
  const label = groq ? "Groq" : (model.baseUrl ?? "openai");
  const apiKey = groq
    ? requireEnv(model.apiKeyEnv ?? "GROQ_API_KEY", "https://console.groq.com/keys")
    : requireEnv(model.apiKeyEnv ?? "", "config/llm-models.json's apiKeyEnv for this model");
  const plain = model.plainPrompt === true;
  const response = await fetch(`${groq ? GROQ_BASE_URL : model.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: model.id,
      messages: plain
        ? [{ role: "user", content: plainUserText(prompt) }]
        : [
            { role: "system", content: prompt.system },
            { role: "user", content: prompt.user },
          ],
      ...(plain ? {} : { response_format: responseFormat(model) }),
      temperature: 0,
      ...(groq && !plain ? { reasoning_effort: model.reasoning } : {}),
      ...(model.maxOutputTokens === undefined
        ? {}
        : { max_completion_tokens: model.maxOutputTokens }),
    }),
  });
  if (response.ok) {
    const body = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { total_tokens?: number; completion_tokens?: number };
    };
    return {
      results: parseOk(body.choices?.[0]?.message?.content, prompt.taxonomy),
      tokens: body.usage?.total_tokens,
      outputTokens: body.usage?.completion_tokens,
    };
  }
  const bodyText = await response.text();
  let message = bodyText;
  let code: string | undefined;
  let failedGeneration: string | undefined;
  try {
    const error = (
      JSON.parse(bodyText) as {
        error?: { message?: string; code?: string; failed_generation?: string };
      }
    ).error;
    message = error?.message ?? bodyText;
    code = error?.code;
    failedGeneration = error?.failed_generation;
  } catch {
    // Non-JSON body — keep the raw text.
  }
  if (response.status === 429) {
    // Groq's 429 names the limit in plain text: "... on tokens per day
    // (TPD): Limit 200000 ..." / "... tokens per minute (TPM) ..." /
    // "... requests per day (RPD) ...". Only the per-day ones end this
    // model's run; per-minute ones come with a retry-after header.
    // Groq's per-day windows are rolling: its "try again in ..." says when
    // enough quota frees up, often minutes away rather than tomorrow.
    if (/per day|daily/i.test(message)) {
      const waitMs = parseTryAgainMs(message);
      throw new ModelUnavailable(
        `daily quota hit: ${message.split(". ")[0]}`,
        true,
        waitMs === undefined ? undefined : Date.now() + waitMs + 30_000,
      );
    }
    const retryAfter = Number(response.headers.get("retry-after"));
    throw new RetryLater(
      `429 ${message}`,
      (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 30) * 1000,
    );
  }
  if (response.status === 413) {
    // One request larger than the per-minute token cap can never succeed —
    // lower this model's batchSize in config/llm-models.json.
    throw new Error(
      `${label} ${model.id}: batch too large for its per-minute token cap — ${message}`,
    );
  }
  if (response.status === 400 && code === "json_validate_failed") {
    const salvaged = salvageResults(failedGeneration, prompt.taxonomy);
    if (salvaged.length > 0) {
      console.warn(
        `${model.id}: output failed schema validation — salvaged ${salvaged.length} valid results`,
      );
      // Groq doesn't report usage on an error; leave token pacing to the
      // per-minute 429 + retry-after fallback for this one request.
      return { results: salvaged };
    }
    // Say what the model actually produced — "Failed to generate JSON"
    // alone doesn't tell truncation (hit maxOutputTokens) from malformed
    // output.
    const generated = failedGeneration ?? "";
    throw new ModelUnavailable(
      `output failed schema validation: ${message.split(". ")[0]} (generated ${generated.length} chars, ending ${JSON.stringify(generated.slice(-120))})`,
      false,
    );
  }
  if (response.status >= 500 || response.status === 498) {
    // 498 is Groq's "flex tier capacity exceeded" — same meaning as a 503.
    throw new ModelUnavailable(`overloaded (${response.status})`, false);
  }
  throw new Error(`${label} ${model.id} ${response.status}: ${message}`);
}

export function callModel(model: LlmModel, prompt: Prompt): Promise<CallResult> {
  return model.provider === "gemini"
    ? callGemini(model, prompt)
    : callOpenAiCompatible(model, prompt);
}
