import type { LlmModel } from "../src/curator/enrich/llm-models";

/**
 * One API adapter per provider behind a single `callModel` — request
 * format, auth, and above all how each provider's quota errors map onto
 * the three outcomes the rotation in `classify-llm.ts` acts on:
 *
 * - `RetryLater`: a short per-minute limit — wait and retry this model.
 * - `ModelUnavailable` (daily): this model's daily quota is spent — drop
 *   it for the rest of the run.
 * - `ModelUnavailable` (not daily): overloaded or unusable output — try
 *   the next model for this batch.
 *
 * Anything else (bad key, malformed request, batch too large for the
 * model's per-minute token cap) is a plain `Error`: a config problem to
 * fix, not something rotating models would solve.
 */

export type Confidence = "high" | "medium" | "low";

export interface BatchResult {
  n: number;
  category: string;
  confidence: Confidence;
  reason: string;
}

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
  allowedCategories: string[];
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
  ) {
    super(message);
  }
}

/**
 * The output schema, shared by both providers. `strict` adds what Groq's
 * strict json_schema mode requires (closed objects); Gemini's
 * responseSchema is an OpenAPI subset that doesn't accept
 * `additionalProperties`, so it gets the plain version.
 */
function outputSchema(allowedCategories: string[], strict: boolean): Record<string, unknown> {
  const closed = strict ? { additionalProperties: false } : {};
  return {
    type: "object",
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          properties: {
            n: { type: "integer" },
            category: { type: "string", enum: allowedCategories },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            reason: { type: "string" },
          },
          required: ["n", "category", "confidence", "reason"],
          ...closed,
        },
      },
    },
    required: ["results"],
    ...closed,
  };
}

function parseResults(text: string | undefined): BatchResult[] {
  return (JSON.parse(text ?? "{}") as { results?: BatchResult[] }).results ?? [];
}

/** `parseResults` for a successful response: unparseable output (typically truncated at maxOutputTokens) moves the batch to the next model instead of crashing the run. */
function parseOk(text: string | undefined): BatchResult[] {
  try {
    return parseResults(text);
  } catch {
    throw new ModelUnavailable("unparseable output (truncated? lower batchSize)", false);
  }
}

/**
 * Keeps the entries of a schema-rejected output that are still valid. On
 * Groq, strict json_schema is validated *after* generation, not enforced
 * while decoding: one invented category (seen on gpt-oss-20b) rejects a
 * whole 50-app batch whose other 49 answers are fine and already paid
 * for. The invalid ones just stay unclassified for a later run.
 */
function salvageResults(text: string | undefined, allowedCategories: string[]): BatchResult[] {
  let parsed: BatchResult[];
  try {
    parsed = parseResults(text);
  } catch {
    return [];
  }
  const allowed = new Set(allowedCategories);
  return parsed.filter(
    (result) =>
      Number.isInteger(result.n) &&
      allowed.has(result.category) &&
      ["high", "medium", "low"].includes(result.confidence) &&
      typeof result.reason === "string",
  );
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

async function callGemini(model: LlmModel, prompt: Prompt): Promise<CallResult> {
  const apiKey = requireEnv("GEMINI_API_KEY", "https://aistudio.google.com/apikey");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `${prompt.system}\n\n${prompt.user}` }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: outputSchema(prompt.allowedCategories, false),
          temperature: 0,
          thinkingConfig: { thinkingLevel: GEMINI_THINKING[model.reasoning] },
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
      results: parseOk(body.candidates?.[0]?.content?.parts?.[0]?.text),
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
      throw new ModelUnavailable(`daily quota hit: ${quota}`, true);
    }
    const delay = details.find((detail) => detail.retryDelay)?.retryDelay;
    throw new RetryLater(`429 ${quota}`, delay ? Number.parseFloat(delay) * 1000 : 30_000);
  }
  if (response.status >= 500) {
    throw new ModelUnavailable(`overloaded (${response.status})`, false);
  }
  throw new Error(`Gemini ${model.id} ${response.status}: ${bodyText}`);
}

// --- Groq ---

async function callGroq(model: LlmModel, prompt: Prompt): Promise<CallResult> {
  const apiKey = requireEnv("GROQ_API_KEY", "https://console.groq.com/keys");
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: model.id,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "classification_results",
          strict: true,
          schema: outputSchema(prompt.allowedCategories, true),
        },
      },
      temperature: 0,
      reasoning_effort: model.reasoning,
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
      results: parseOk(body.choices?.[0]?.message?.content),
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
    if (/per day/i.test(message)) throw new ModelUnavailable(`daily quota hit: ${message}`, true);
    const retryAfter = Number(response.headers.get("retry-after"));
    throw new RetryLater(
      `429 ${message}`,
      (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 30) * 1000,
    );
  }
  if (response.status === 413) {
    // One request larger than the per-minute token cap can never succeed —
    // lower this model's batchSize in config/llm-models.json.
    throw new Error(`Groq ${model.id}: batch too large for its per-minute token cap — ${message}`);
  }
  if (response.status === 400 && code === "json_validate_failed") {
    const salvaged = salvageResults(failedGeneration, prompt.allowedCategories);
    if (salvaged.length > 0) {
      console.warn(
        `${model.id}: output failed schema validation — salvaged ${salvaged.length} valid results`,
      );
      // Groq doesn't report usage on an error; leave token pacing to the
      // per-minute 429 + retry-after fallback for this one request.
      return { results: salvaged };
    }
    throw new ModelUnavailable(`output failed schema validation: ${message.slice(0, 300)}`, false);
  }
  if (response.status >= 500 || response.status === 498) {
    // 498 is Groq's "flex tier capacity exceeded" — same meaning as a 503.
    throw new ModelUnavailable(`overloaded (${response.status})`, false);
  }
  throw new Error(`Groq ${model.id} ${response.status}: ${message}`);
}

export function callModel(model: LlmModel, prompt: Prompt): Promise<CallResult> {
  return model.provider === "gemini" ? callGemini(model, prompt) : callGroq(model, prompt);
}
