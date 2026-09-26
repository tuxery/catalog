import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildDataset } from "../src/pipeline";
import {
  loadLlmClassifications,
  type LlmClassificationEntry,
} from "../src/curator/enrich/llm-classifications";
import {
  APP_CATEGORY_LABEL_VALUES,
  GAME_CATEGORY_LABEL_VALUES,
} from "../src/curator/enrich/category";

const CONFIG_PATH = fileURLToPath(new URL("../config/llm-classifications.json", import.meta.url));

// --- CLI flags ---
function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}
// A flag whose value is optional (`--sample` alone, or `--sample 20`) — the
// next argv token only counts as the value if it doesn't itself look like
// another flag, so `--sample --dry-run` reads as "5 (default), then
// --dry-run" rather than trying to parse "--dry-run" as a number.
function optionalNumberFlag(name: string, defaultValue: number): number | undefined {
  if (!hasFlag(name)) return undefined;
  const next = flag(name);
  if (next === undefined || next.startsWith("--")) return defaultValue;
  const parsed = Number(next);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

// Free tier only (no billing on the key's Google project). Google no longer
// publishes free-tier quotas (only shown per project in AI Studio,
// https://aistudio.google.com/rate-limit); observed 2026-09-26: 20 requests
// per day *per model* (GenerateRequestsPerDayPerProjectPerModel-FreeTier),
// and 503 "high demand" failures appear to count against it too. So
// requests are the scarce resource: batches are large, a 503 moves on to
// the next model after one retry instead of burning quota on backoff, and
// since the cap is per model, the run rotates through MODELS — a model
// that hits its daily cap is dropped for the rest of the run. Progress is
// persisted after every batch; when every model is exhausted the run saves
// and exits cleanly, to be resumed after the reset (midnight Pacific time).
const batchSize = Number(flag("--batch-size") ?? 200);
const concurrency = Number(flag("--concurrency") ?? 1);
const limit = flag("--limit") ? Number(flag("--limit")) : undefined;
// Requests-per-minute pacing across all workers — conservative default so
// the per-minute quota is rarely what stops a run; a per-minute 429 still
// waits Google's own retryDelay and retries.
const rpm = Number(flag("--rpm") ?? 5);
// Hard cap on real Gemini calls for this run — e.g. to leave part of the
// day's quota for something else. Unset = run until done or quota-stopped.
const maxRequests = flag("--max-requests") ? Number(flag("--max-requests")) : undefined;
const dryRun = hasFlag("--dry-run");
// `--sample [N]` (default 5): real Gemini calls on just N still-unclassified
// apps, to test the whole chain end to end (network, schema, parsing) —
// distinct from --dry-run (no network call at all, fake data) and from
// --limit (a real, scoped, PERSISTED run). Sample results are printed, never
// written to config/llm-classifications.json, so testing never consumes
// part of the real quota-tracked run or leaves throwaway entries in a
// committed file. Conflicts with --dry-run (nothing to sample from a fake
// call) and --limit (redundant scoping) — checked below.
const sample = optionalNumberFlag("--sample", 5);
if (sample !== undefined && dryRun) {
  throw new Error("--sample makes real Gemini calls; it can't be combined with --dry-run.");
}
if (sample !== undefined && limit !== undefined) {
  throw new Error("--sample already scopes the run; --limit alongside it is redundant.");
}

// --- Types ---
interface BatchItem {
  id: string;
  name: string;
  description: string;
}
type Confidence = LlmClassificationEntry["confidence"];
// `n` echoes the item's 1-based position in the prompt rather than its name:
// two different apps in one batch can share a display name, and matching
// back by name would silently assign one's result to the other.
interface BatchResult {
  n: number;
  category: string;
  confidence: Confidence;
  reason: string;
}

// Tried in order. Only full Flash models: on a 20-app side-by-side sample,
// gemini-3.5-flash-lite applied a wrong category at medium confidence, and
// every request costs the same quota whatever the model. GEMINI_MODELS
// (comma-separated) or GEMINI_MODEL (a single one) override the chain.
const MODELS = (
  process.env.GEMINI_MODELS ??
  process.env.GEMINI_MODEL ??
  "gemini-3.8-flash,gemini-3.6-flash,gemini-3.7-flash,gemini-3.5-flash"
)
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);

/**
 * Thrown when this run should stop for now — every model's daily quota
 * spent, the `--max-requests` cap, or every model staying overloaded (503)
 * through several rounds. The caller persists progress and exits cleanly: re-running later
 * resumes where this one left off, so none of these warrant a crash.
 */
class StopRun extends Error {}

/** One model can't serve right now: `daily` = its per-day quota is spent (drop it for this run), else overloaded (skip it for this batch). */
class ModelUnavailable extends Error {
  constructor(
    message: string,
    readonly daily: boolean,
  ) {
    super(message);
  }
}

const SYSTEM_PROMPT =
  "You classify Linux software packages by their name and short description. Assign each package the single most accurate category from the allowed list, and rate your confidence: 'high' when the name/description make the category unambiguous, 'medium' when it's a reasonable best guess, 'low' when the description is missing, too vague, or fits several categories equally. Prefer an honest 'low' over a confident guess. Keep each reason under 15 words. Respond with valid JSON only, one result per package, echoing each package's number n exactly as given.";

function outputSchema(allowedCategories: string[]): Record<string, unknown> {
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
        },
      },
    },
    required: ["results"],
  };
}

function buildPrompt(items: BatchItem[]): string {
  const lines = items.map(
    (item, i) => `n=${i + 1} name=${item.name} desc=${(item.description || "").slice(0, 200)}`,
  );
  return `Classify each package below into exactly one category.\n\n${lines.join("\n")}`;
}

// --- Model rotation ---
const exhaustedModels = new Set<string>();
// The model that served the last batch — tried first for the next one, so
// a batch doesn't start by re-hitting a model that was just overloaded.
let preferredModel: string | undefined;
const OVERLOAD_ROUNDS = 3;
const OVERLOAD_ROUND_WAIT_MS = 60_000;

/**
 * Classifies one batch on the first model able to serve it, starting from
 * `preferredModel`. Recursion rather than a loop so the awaited calls don't
 * trip `no-await-in-loop`: `offset` walks the model chain, `round` counts
 * full passes where every remaining model was overloaded.
 */
async function classifyGemini(
  items: BatchItem[],
  allowedCategories: string[],
  offset = 0,
  round = 0,
): Promise<{ results: BatchResult[]; model: string }> {
  const available = MODELS.filter((model) => !exhaustedModels.has(model));
  if (available.length === 0) {
    throw new StopRun(`daily quota spent on every model (${MODELS.join(", ")})`);
  }
  if (offset >= available.length) {
    if (round + 1 >= OVERLOAD_ROUNDS) {
      throw new StopRun(`every model still overloaded after ${OVERLOAD_ROUNDS} rounds`);
    }
    console.warn(`All models overloaded — waiting ${OVERLOAD_ROUND_WAIT_MS / 1000}s`);
    await new Promise((resolve) => setTimeout(resolve, OVERLOAD_ROUND_WAIT_MS));
    return classifyGemini(items, allowedCategories, 0, round + 1);
  }
  const start = Math.max(0, available.indexOf(preferredModel ?? ""));
  const model = available[(start + offset) % available.length] as string;
  try {
    const results = await classifyWith(model, items, allowedCategories);
    preferredModel = model;
    return { results, model };
  } catch (error) {
    if (!(error instanceof ModelUnavailable)) throw error;
    if (error.daily) {
      exhaustedModels.add(model);
      console.warn(`${model}: ${error.message} — dropped for this run`);
      // `available` shrinks by one, so the same offset now points at the
      // model that came after this one.
      return classifyGemini(items, allowedCategories, offset, round);
    }
    console.warn(`${model}: ${error.message} — trying the next model`);
    return classifyGemini(items, allowedCategories, offset + 1, round);
  }
}

async function classifyWith(
  model: string,
  items: BatchItem[],
  allowedCategories: string[],
): Promise<BatchResult[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey)
    throw new Error("GEMINI_API_KEY is required — see https://aistudio.google.com/apikey");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ role: "user", parts: [{ text: `${SYSTEM_PROMPT}\n\n${buildPrompt(items)}` }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: outputSchema(allowedCategories),
      temperature: 0,
      // Classification from a name + one-line description doesn't need
      // extended reasoning, and thinking tokens count against the same
      // free-tier token quota as the answer itself.
      thinkingConfig: { thinkingLevel: "low" },
    },
  };
  return request(url, payload, 0);
}

// --- Free-tier pacing ---
let requestsMade = 0;
let nextSlotAt = 0;
/** Reserves the next request slot under the `--rpm` budget, shared by every worker. */
async function paced(): Promise<void> {
  if (maxRequests !== undefined && requestsMade >= maxRequests) {
    throw new StopRun(`--max-requests ${maxRequests} reached`);
  }
  requestsMade += 1;
  const now = Date.now();
  const slot = Math.max(now, nextSlotAt);
  nextSlotAt = slot + 60_000 / rpm;
  if (slot > now) await new Promise((resolve) => setTimeout(resolve, slot - now));
}

interface GeminiErrorDetail {
  "@type"?: string;
  retryDelay?: string;
  violations?: { quotaId?: string; quotaValue?: string }[];
}

/**
 * Reads a 429 body's google.rpc details: which quota was hit (a per-day
 * `quotaId` means stop for today, anything else is transient) and Google's
 * own suggested `retryDelay`.
 */
function parseQuotaError(bodyText: string): { daily: boolean; retryMs?: number; quota: string } {
  let details: GeminiErrorDetail[] = [];
  try {
    details =
      (JSON.parse(bodyText) as { error?: { details?: GeminiErrorDetail[] } }).error?.details ?? [];
  } catch {
    // Non-JSON body — treat as transient, fall back to exponential backoff.
  }
  const violations = details.flatMap((detail) => detail.violations ?? []);
  const quota =
    violations.map((v) => `${v.quotaId} (limit ${v.quotaValue})`).join(", ") || "unknown quota";
  const daily = violations.some((v) => /PerDay/i.test(v.quotaId ?? ""));
  const delay = details.find((detail) => detail.retryDelay)?.retryDelay;
  const retryMs = delay ? Number.parseFloat(delay) * 1000 : undefined;
  return { daily, retryMs, quota };
}

/**
 * One paced Gemini generateContent call on one model. A per-minute 429 is
 * retried after Google's own retryDelay (else exponential backoff); a
 * per-day 429 or a 5xx that survives one short retry throws
 * `ModelUnavailable`, letting `classifyGemini` move to the next model.
 * Recursion rather than a loop so the awaited calls don't trip
 * `no-await-in-loop`.
 */
async function request(url: string, payload: unknown, attempt: number): Promise<BatchResult[]> {
  await paced();
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (response.ok) {
    const body = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    return JSON.parse(text).results as BatchResult[];
  }
  const bodyText = await response.text();
  const retryable = response.status === 429 || response.status >= 500;
  if (response.status === 429) {
    const { daily, retryMs, quota } = parseQuotaError(bodyText);
    if (daily) throw new ModelUnavailable(`daily quota hit: ${quota}`, true);
    if (attempt < 5) {
      const waitMs = retryMs ?? 5000 * 2 ** attempt;
      console.warn(`Gemini 429 (${quota}) — retrying in ${Math.round(waitMs / 1000)}s`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      return request(url, payload, attempt + 1);
    }
  } else if (retryable) {
    // 5xx here is almost always 503 "high demand" — Google-side overload
    // that can last hours on one model while another is fine, and failed
    // requests seem to count against the daily quota. One short retry,
    // then let the caller try another model.
    if (attempt >= 1) {
      throw new ModelUnavailable(`still ${response.status} after a retry`, false);
    }
    console.warn(`Gemini ${response.status} — retrying in 10s`);
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    return request(url, payload, attempt + 1);
  }
  throw new Error(`Gemini ${response.status}: ${bodyText}`);
}

function writeConfig(entries: Map<string, LlmClassificationEntry>): void {
  // Insertion order is kept (existing entries first, new ones appended) so
  // incremental re-runs append rather than reshuffle — friendlier for git
  // review of a generated file than a sort would be.
  writeFileSync(CONFIG_PATH, `${JSON.stringify([...entries.values()], null, 2)}\n`);
}

/**
 * Runs the sources + curator pipeline, classifies every still-unclassified
 * app ("To Classify") via the chosen backend, and writes the results back
 * to `config/llm-classifications.json` — which `enrichApps` then consumes
 * as a last-resort signal before its own "To Classify" fallback on the
 * next rebuild.
 *
 * Uses the Gemini API with structured JSON output (responseSchema). Requires
 * GEMINI_API_KEY from a project with NO billing enabled — that's what keeps
 * it on the free tier, where exceeding a quota returns a 429 instead of a
 * bill. Rotates through MODELS (see there for overrides). Each entry
 * records the model that produced it and the LLM's own `confidence`; `low`
 * ones are stored but not applied (see `llmCategoryMap`). When no model can
 * serve (all daily-capped, or all overloaded) the run saves and exits
 * cleanly — see the free-tier note by the CLI flags above.
 *
 * Resumable in every mode (--sample included): re-running skips ids already
 * present in the config file, so a sample run never reclassifies the same
 * handful of apps twice in a row — it naturally samples further into the
 * "To Classify" backlog each time, same as a real run would.
 */
async function main(): Promise<void> {
  const dataset = await buildDataset();
  const existing = new Map(loadLlmClassifications().map((entry) => [entry.id, entry]));
  const toClassify = dataset.apps.filter(
    (app) => app.category === "To Classify" && !existing.has(app.id),
  );
  const effectiveLimit = sample ?? limit;
  const todo = effectiveLimit === undefined ? toClassify : toClassify.slice(0, effectiveLimit);

  const games = todo.filter((app) => app.contentType === "game");
  const apps = todo.filter((app) => app.contentType !== "game");

  console.log(
    `To classify: ${todo.length} (${games.length} games, ${apps.length} apps) | batch ${batchSize} (~${Math.ceil(games.length / batchSize) + Math.ceil(apps.length / batchSize)} requests) | ${MODELS.join(" > ")} | ${rpm} RPM | concurrency ${concurrency}${maxRequests !== undefined ? ` | max ${maxRequests} requests` : ""}${dryRun ? " | DRY RUN" : ""}${sample !== undefined ? ` | SAMPLE (${sample}, not persisted)` : ""}`,
  );

  const persist = !dryRun && sample === undefined;
  const classifier = classifyGemini;
  const results = new Map(existing);
  let newEntries = 0;

  async function runGroup(
    group: { id: string; name: string; description: string }[],
    allowedCategories: string[],
  ): Promise<void> {
    const batches: BatchItem[][] = [];
    for (let i = 0; i < group.length; i += batchSize) {
      batches.push(group.slice(i, i + batchSize));
    }

    let cursor = 0;
    async function worker(): Promise<void> {
      const batch = batches[cursor++];
      if (!batch) return;
      if (dryRun) {
        for (const item of batch) {
          results.set(item.id, {
            id: item.id,
            category: allowedCategories[0] as LlmClassificationEntry["category"],
            confidence: "low",
            reason: "dry-run placeholder",
            model: "dry-run",
          });
        }
      } else {
        const { results: batchResults, model } = await classifier(batch, allowedCategories);
        for (const result of batchResults) {
          const item = batch[result.n - 1];
          if (!item) continue;
          results.set(item.id, {
            id: item.id,
            category: result.category as LlmClassificationEntry["category"],
            confidence: result.confidence,
            reason: result.reason,
            model,
          });
          newEntries += 1;
        }
      }
      // Persist after every batch: a batch is a whole request's worth of
      // scarce free-tier quota, never worth losing to a crash or Ctrl-C.
      if (persist) writeConfig(results);
      return worker();
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
  }

  try {
    await runGroup(
      games.map((app) => ({ id: app.id, name: app.name, description: app.shortDescription })),
      [...GAME_CATEGORY_LABEL_VALUES],
    );
    await runGroup(
      apps.map((app) => ({ id: app.id, name: app.name, description: app.shortDescription })),
      [...APP_CATEGORY_LABEL_VALUES],
    );
  } catch (error) {
    if (!(error instanceof StopRun)) throw error;
    console.warn(
      `Stopped: ${error.message}. ${newEntries} new entries saved (${requestsMade} requests this run) — re-run later to continue where this left off (daily quotas reset at midnight Pacific time).`,
    );
    if (sample === undefined) return;
  }

  if (dryRun) {
    console.log(`Dry run complete — would write ${results.size} entries.`);
    return;
  }

  if (sample !== undefined) {
    console.log(
      `Sample complete (${requestsMade} requests) — real Gemini results (not written to config):`,
    );
    for (const item of todo) {
      const result = results.get(item.id);
      console.log(
        `  [${result?.confidence ?? "-"}] ${item.name} -> ${result?.category ?? "(no result)"} (${result?.reason ?? ""}) — ${item.shortDescription.slice(0, 80)}`,
      );
    }
    return;
  }

  const byConfidence = [...results.values()].reduce<Record<string, number>>((acc, entry) => {
    acc[entry.confidence] = (acc[entry.confidence] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `Done. ${newEntries} new entries (${requestsMade} requests); ${results.size} total in config/llm-classifications.json — ${JSON.stringify(byConfidence)}.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
