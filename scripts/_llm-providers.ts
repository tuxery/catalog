import type { LlmModel } from "../src/curator/enrich/llm-models";

/**
 * The Gemini API adapter behind `callModel` — request format, auth, and
 * above all how Gemini's quota errors map onto the three outcomes the
 * rotation in `_llm-rotation.ts` acts on:
 *
 * - `RetryLater`: a short per-minute limit — wait and retry this model.
 * - `ModelUnavailable` (daily): this model's daily quota is spent — rest
 *   it until `retryAt` (next midnight Pacific).
 * - `ModelUnavailable` (not daily): overloaded or unusable output — try
 *   the next model for this batch.
 *
 * Anything else (bad key, malformed request) is a plain `Error`: a config problem to
 * fix, not something rotating models would solve.
 */

export interface CallResult<T> {
  results: T[];
  /** Total tokens billed for the request (input + output + reasoning), when Gemini reports it — for the run's usage report. */
  tokens?: number;
}

/**
 * One request's prompt, and how to read the answer: every task asks for
 * the same `{"results": [string, ...]}` shape (see `outputSchema`) and
 * parses its own lines — `parse` returns the valid ones and throws when
 * the text isn't parseable at all.
 */
export interface Prompt<T> {
  system: string;
  user: string;
  parse: (text: string | undefined) => T[];
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

/**
 * The output schema: one "n|type|category|k|reason" string per app rather
 * than one JSON object. Measured (2026-09-27, same 20 apps): output fell
 * from ~28 to ~12 tokens per app — per-field JSON punctuation cost about
 * as much as the fields themselves — with agreement unchanged or better,
 * while numbered categories instead of labels dropped agreement to 50%.
 * The flip side: Gemini can no longer enforce the type/category enums, so
 * `parseResults` validates every field itself.
 */
const OUTPUT_SCHEMA = {
  type: "object",
  properties: { results: { type: "array", items: { type: "string" } } },
  required: ["results"],
};

/**
 * The prompt's `parse` for a successful response. Unparseable output (typically
 * truncated at maxOutputTokens), or output with no valid line at all (the
 * model ignored the format), counts as the model being unavailable, like
 * an overload: the batch moves to the next model, and a model that keeps
 * doing it is dropped by the rotation's overload streak — instead of
 * silently burning quota on answers that yield nothing (11 Gemini requests
 * for 0 apps, 2026-09-29).
 */
function parseOk<T>(text: string | undefined, parse: Prompt<T>["parse"]): T[] {
  let results: T[];
  try {
    results = parse(text);
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

function requireEnv(name: string, hint: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required — see ${hint}`);
  return value;
}

interface GeminiErrorDetail {
  retryDelay?: string;
  violations?: { quotaId?: string; quotaValue?: string }[];
}

async function callGemini<T>(model: LlmModel, prompt: Prompt<T>): Promise<CallResult<T>> {
  const apiKey = requireEnv("GEMINI_API_KEY", "https://aistudio.google.com/apikey");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent`,
    {
      method: "POST",
      // In a header rather than `?key=`: a URL ends up in error messages and
      // proxy logs, the header doesn't.
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: prompt.system }] },
        contents: [{ role: "user", parts: [{ text: prompt.user }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: OUTPUT_SCHEMA,
          thinkingConfig: { thinkingLevel: model.reasoning },
          temperature: 0,
        },
      }),
    },
  );
  if (response.ok) {
    const body = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { totalTokenCount?: number };
    };
    return {
      results: parseOk(body.candidates?.[0]?.content?.parts?.[0]?.text, prompt.parse),
      tokens: body.usageMetadata?.totalTokenCount,
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

export const callModel = callGemini;
