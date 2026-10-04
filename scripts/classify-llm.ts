import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { hasUpstreamCategory, type CatalogApp } from "../src/curator";
import { TO_CLASSIFY } from "../src/curator/enrich/category";
import {
  loadLlmClassifications,
  type LlmClassificationEntry,
} from "../src/curator/enrich/llm-classifications";
import { buildDataset } from "../src/pipeline";
import { loadLlmModels, type LlmModel } from "../src/curator/enrich/llm-models";
import {
  buildSystemPrompt,
  buildUserPrompt,
  TAXONOMY,
  type BatchItem,
  type BatchResult,
} from "../src/curator/enrich/llm-prompt";
import { callModel, ModelUnavailable, RetryLater } from "./_llm-providers";

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

// Free tiers only: Gemini with no billing on the key's Google project, Groq
// on its free plan — exceeding a quota returns a 429, never a bill. Neither
// quota is generous (observed 2026-09-26: Gemini 20 requests/day per model,
// Groq 200k tokens/day per model), and they bottleneck on different things,
// so per-model batch size, pacing, and retries live in
// config/llm-models.json rather than here. The run is built to be cut short
// and resumed: progress is persisted after every batch, a model that hits
// its daily cap is dropped for the rest of the run, and when no model can
// serve the run saves and exits cleanly (Gemini resets at midnight Pacific
// time; Groq's per-day window is rolling).
const limit = flag("--limit") ? Number(flag("--limit")) : undefined;
// Hard cap on real API calls for this run, across all models.
const maxRequests = flag("--max-requests") ? Number(flag("--max-requests")) : undefined;
// `--models a,b` overrides config/llm-models.json's rotation: only these
// ids, in this order, disabled ones included — e.g. to sample one model.
const modelsFlag = flag("--models");
// When no model can serve right now, wait for the next one only if it's back
// within this many minutes; otherwise save and exit, printing when to re-run.
const maxIdleMinutes = Number(flag("--max-idle") ?? 20);
// `--source <id>` restricts the run to apps with a package from that source
// (e.g. `lutris`) — with `--sample`, to check the prompt on a source whose
// mix of games and apps differs from the backlog's AUR-heavy head.
const sourceFilter = flag("--source");
// `--include-upstream` also queues apps whose upstream store categories
// (Flathub, AppStream feeds, ...) already decided their type and category:
// there the LLM can only hide a library, so they're off by default.
const includeUpstream = hasFlag("--include-upstream");
// `--report`: no API call — compares the stored entries with the purely
// deterministic result and prints where they disagree (see `report`).
const reportOnly = hasFlag("--report");
const dryRun = hasFlag("--dry-run");
// `--sample [N]` (default 5): real API calls on just N still-unclassified
// apps, to test the whole chain end to end (network, schema, parsing) —
// distinct from --dry-run (no network call at all, fake data) and from
// --limit (a real, scoped, PERSISTED run). Sample results are printed, never
// written to config/llm-classifications.json, so testing never leaves
// throwaway entries in a committed file. Conflicts with --dry-run (nothing
// to sample from a fake call) and --limit (redundant scoping) — checked
// below.
const sample = optionalNumberFlag("--sample", 5);
if (sample !== undefined && dryRun) {
  throw new Error("--sample makes real API calls; it can't be combined with --dry-run.");
}
if (sample !== undefined && limit !== undefined) {
  throw new Error("--sample already scopes the run; --limit alongside it is redundant.");
}

function resolveModels(): LlmModel[] {
  const all = loadLlmModels();
  if (!modelsFlag) return all.filter((model) => model.enabled);
  return modelsFlag.split(",").map((id) => {
    const model = all.find((candidate) => candidate.id === id.trim());
    if (!model) throw new Error(`--models: "${id}" is not in config/llm-models.json`);
    return model;
  });
}
const MODELS = resolveModels();
if (MODELS.length === 0) throw new Error("No enabled model in config/llm-models.json.");

// --- Types ---
/**
 * Thrown when this run should stop for now — every model's daily quota
 * spent, the `--max-requests` cap, or every model staying overloaded
 * through several rounds. The caller persists progress and exits cleanly:
 * re-running later resumes where this one left off.
 */
class StopRun extends Error {}

const SYSTEM_PROMPT = buildSystemPrompt();

// --- Per-model pacing and stats ---
interface ModelState {
  nextSlotAt: number;
  requests: number;
  apps: number;
  tokens: number;
}
const state = new Map<string, ModelState>(
  MODELS.map((model) => [model.id, { nextSlotAt: 0, requests: 0, apps: 0, tokens: 0 }]),
);
let requestsMade = 0;

/** Waits for this model's next slot under its `requestsPerMinute` budget, and counts the request. */
async function paced(model: LlmModel): Promise<void> {
  if (maxRequests !== undefined && requestsMade >= maxRequests) {
    throw new StopRun(`--max-requests ${maxRequests} reached`);
  }
  requestsMade += 1;
  const modelState = state.get(model.id) as ModelState;
  modelState.requests += 1;
  const now = Date.now();
  const slot = Math.max(now, modelState.nextSlotAt);
  modelState.nextSlotAt = slot + 60_000 / model.requestsPerMinute;
  if (slot > now) await new Promise((resolve) => setTimeout(resolve, slot - now));
}

/** Token pacing: pushes the model's next slot back by the largest share of a minute's token budget (total, or output-only) this request used. */
function recordTokens(
  model: LlmModel,
  tokens: number | undefined,
  outputTokens: number | undefined,
): void {
  const modelState = state.get(model.id) as ModelState;
  modelState.tokens += tokens ?? 0;
  const minutes = Math.max(
    tokens !== undefined && model.tokensPerMinute !== undefined
      ? tokens / model.tokensPerMinute
      : 0,
    outputTokens !== undefined && model.outputTokensPerMinute !== undefined
      ? outputTokens / model.outputTokensPerMinute
      : 0,
  );
  modelState.nextSlotAt = Math.max(modelState.nextSlotAt, Date.now() + minutes * 60_000);
}

/**
 * One paced call on one model, retrying in place on a per-minute limit
 * (`RetryLater`, up to 5 times) and on overload up to the model's own
 * `overloadRetries`; anything else propagates to the rotation. Recursion
 * rather than a loop so the awaited calls don't trip `no-await-in-loop`.
 */
async function callPaced(
  model: LlmModel,
  batch: BatchItem[],
  attempt = 0,
  overloadAttempt = 0,
): Promise<BatchResult[]> {
  await paced(model);
  try {
    const { results, tokens, outputTokens } = await callModel(model, {
      system: SYSTEM_PROMPT,
      user: buildUserPrompt(batch),
      taxonomy: TAXONOMY,
    });
    recordTokens(model, tokens, outputTokens);
    return results;
  } catch (error) {
    if (error instanceof RetryLater && attempt < 5) {
      console.warn(
        `${model.id}: ${error.message} — retrying in ${Math.round(error.waitMs / 1000)}s`,
      );
      await new Promise((resolve) => setTimeout(resolve, error.waitMs));
      return callPaced(model, batch, attempt + 1, overloadAttempt);
    }
    if (
      error instanceof ModelUnavailable &&
      !error.daily &&
      overloadAttempt < model.overloadRetries
    ) {
      console.warn(`${model.id}: ${error.message} — retrying in 10s`);
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      return callPaced(model, batch, attempt, overloadAttempt + 1);
    }
    if (error instanceof RetryLater) throw new ModelUnavailable(error.message, false);
    throw error;
  }
}

// --- Model rotation ---
// Per-model availability instead of a one-way "exhausted" set: a daily cap
// rests the model until its provider's reset (Groq's rolling window is
// often back within minutes), an overload rests it with a growing backoff.
// Failed requests can count against a daily quota (observed on Gemini), so
// an overloaded model is probed at most MAX_OVERLOAD_STREAK times in a row
// before it's dropped for the run — bounding the quota a long outage burns.
interface Availability {
  availableAt: number;
  overloadStreak: number;
  dropped: boolean;
}
const availability = new Map<string, Availability>(
  MODELS.map((model) => [model.id, { availableAt: 0, overloadStreak: 0, dropped: false }]),
);
const MAX_OVERLOAD_STREAK = 5;
const OVERLOAD_BACKOFF_MS = 2 * 60_000;
const OVERLOAD_BACKOFF_CAP_MS = 30 * 60_000;

function availabilityOf(model: LlmModel): Availability {
  return availability.get(model.id) as Availability;
}

function clock(ms: number): string {
  return `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** Books the outcome of a failed attempt on this model's availability. */
function rest(model: LlmModel, error: ModelUnavailable): void {
  const slot = availabilityOf(model);
  if (error.daily) {
    // No reset time known: treat it as spent for the run.
    if (error.retryAt === undefined) slot.dropped = true;
    else slot.availableAt = error.retryAt;
    console.warn(
      `${model.id}: ${error.message} — ${slot.dropped ? "dropped for this run" : `resting until ${clock(slot.availableAt)}`}`,
    );
    return;
  }
  slot.overloadStreak += 1;
  if (slot.overloadStreak >= MAX_OVERLOAD_STREAK) {
    slot.dropped = true;
    console.warn(
      `${model.id}: ${error.message} — ${slot.overloadStreak} in a row, dropped for this run`,
    );
    return;
  }
  const backoff = Math.min(
    OVERLOAD_BACKOFF_MS * 2 ** (slot.overloadStreak - 1),
    OVERLOAD_BACKOFF_CAP_MS,
  );
  slot.availableAt = Date.now() + backoff;
  console.warn(`${model.id}: ${error.message} — resting ${backoff / 60_000} min`);
}

interface Group {
  items: BatchItem[];
  cursor: number;
}

/**
 * Classifies the group's next batch on the highest-priority model that's
 * available right now (array order of config/llm-models.json, so a
 * recovered Gemini model takes over again from Groq). The batch is sliced
 * only once the model is picked, since batch size is per model. When none
 * is available, waits for the next one if it's back within --max-idle,
 * else stops the run cleanly, saying when to re-run. Recursion rather than
 * a loop so the awaited calls don't trip `no-await-in-loop`.
 */
async function classifyNextBatch(
  group: Group,
): Promise<{ batch: BatchItem[]; results: BatchResult[]; model: LlmModel }> {
  const candidates = MODELS.filter((model) => !availabilityOf(model).dropped);
  if (candidates.length === 0) {
    throw new StopRun("no model left to try this run");
  }
  const now = Date.now();
  const model = candidates.find((candidate) => availabilityOf(candidate).availableAt <= now);
  if (!model) {
    const next = candidates.reduce((best, candidate) =>
      availabilityOf(candidate).availableAt < availabilityOf(best).availableAt ? candidate : best,
    );
    const nextAt = availabilityOf(next).availableAt;
    if (nextAt - now > maxIdleMinutes * 60_000) {
      throw new StopRun(
        `no model available before ${clock(nextAt)} (${next.id}) — re-run after that`,
      );
    }
    console.warn(`No model available — waiting until ${clock(nextAt)} for ${next.id}`);
    await new Promise((resolve) => setTimeout(resolve, nextAt - now));
    return classifyNextBatch(group);
  }
  const batch = group.items.slice(group.cursor, group.cursor + model.batchSize);
  try {
    const results = await callPaced(model, batch);
    availabilityOf(model).overloadStreak = 0;
    return { batch, results, model };
  } catch (error) {
    if (!(error instanceof ModelUnavailable)) throw error;
    rest(model, error);
    return classifyNextBatch(group);
  }
}

function toItems(list: { id: string; name: string; shortDescription: string }[]): BatchItem[] {
  return list.map((app) => ({ id: app.id, name: app.name, description: app.shortDescription }));
}

function writeConfig(entries: Map<string, LlmClassificationEntry>): void {
  // Insertion order is kept (existing entries first, new ones appended) so
  // incremental re-runs append rather than reshuffle — friendlier for git
  // review of a generated file than a sort would be. One entry per line,
  // still a valid JSON array: at ~50k entries, pretty-printing made it ~350k
  // lines; this is 7x fewer lines and ~30% fewer bytes, with one diff line
  // per classified app. Kept out of oxfmt via .prettierignore, which would
  // otherwise expand it back.
  const lines = [...entries.values()].map((entry) => JSON.stringify(entry));
  writeFileSync(CONFIG_PATH, `[\n${lines.join(",\n")}\n]\n`);
}

/**
 * Splits the apps still to ask into the queue's priority groups, in order:
 * apps the deterministic signals left in "To Classify" (no category at
 * all), then apps whose type and category came from the in-house
 * heuristics alone (where the LLM has the final say — mostly AUR, Arch,
 * Debian and AppImage, where libraries and game/app mistakes concentrate),
 * then apps with upstream store categories (`--include-upstream` only).
 * `apps` is the deterministic dataset, so an app's group never depends on
 * an earlier LLM answer.
 */
function queueGroups(
  apps: CatalogApp[],
  isPending: (app: CatalogApp) => boolean,
): { toClassify: CatalogApp[]; heuristicOnly: CatalogApp[]; upstream: CatalogApp[] } {
  const groups = {
    toClassify: [] as CatalogApp[],
    heuristicOnly: [] as CatalogApp[],
    upstream: [] as CatalogApp[],
  };
  for (const app of apps) {
    if (!isPending(app)) continue;
    if (app.category === TO_CLASSIFY) groups.toClassify.push(app);
    else if (hasUpstreamCategory(app.packages)) groups.upstream.push(app);
    else groups.heuristicOnly.push(app);
  }
  return groups;
}

function deterministicType(app: CatalogApp): "app" | "game" {
  return app.contentType === "game" ? "game" : "app";
}

/** Prints the `top` most frequent keys of a count map, most frequent first. */
function printTop(title: string, counts: Map<string, string[]>, top = 15): void {
  const total = [...counts.values()].reduce((sum, list) => sum + list.length, 0);
  console.log(`\n${title}: ${total}`);
  // A fresh array from the spread, safe to sort in place — toSorted() needs
  // ES2023, beyond this tsconfig's lib (same as src/store/turso-client.ts).
  // eslint-disable-next-line unicorn/no-array-sort
  const sorted = [...counts.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [key, examples] of sorted.slice(0, top)) {
    console.log(
      `  ${examples.length.toString().padStart(6)}  ${key}  e.g. ${examples.slice(0, 4).join(", ")}`,
    );
  }
}

function bump(counts: Map<string, string[]>, key: string, example: string): void {
  const list = counts.get(key) ?? [];
  list.push(example);
  counts.set(key, list);
}

/**
 * `--report`: where the stored (applied, not low) LLM entries disagree with
 * the purely deterministic result — which apps they hide, which type they
 * flip, which flips upstream metadata blocks, and which categories they
 * change within the same type. Frequent disagreements point at a
 * heuristic worth fixing (e.g. a GAME_ADJACENT_TOOL_* pattern) rather than
 * leaving the LLM to patch it app by app.
 */
function report(apps: CatalogApp[], entries: LlmClassificationEntry[]): void {
  const byId = new Map(apps.map((app) => [app.id, app]));
  const hidden = new Map<string, string[]>();
  const flipped = new Map<string, string[]>();
  const blocked = new Map<string, string[]>();
  const recategorized = new Map<string, string[]>();
  let applied = 0;
  for (const entry of entries) {
    if (entry.confidence === "low") continue;
    const app = byId.get(entry.id);
    if (!app) continue;
    applied += 1;
    const sources = [...new Set(app.packages.map((pkg) => pkg.source))].join("+");
    const type = deterministicType(app);
    if (entry.type === "library" || entry.type === "other") {
      if (entry.confidence === "high") bump(hidden, `${entry.type} (${sources})`, app.name);
      continue;
    }
    const upstream = hasUpstreamCategory(app.packages) && app.category !== TO_CLASSIFY;
    if (entry.type !== type) {
      bump(upstream ? blocked : flipped, `${type} -> ${entry.type} (${sources})`, app.name);
    } else if (app.category !== TO_CLASSIFY && app.category !== entry.category && !upstream) {
      bump(recategorized, `${type}: ${app.category} -> ${entry.category}`, app.name);
    }
  }
  console.log(
    `${applied} applied entries (medium/high) matched against the deterministic dataset.`,
  );
  printTop("Hidden (library/other, high)", hidden);
  printTop("Type flipped by the LLM (heuristics only)", flipped);
  printTop("Type flip blocked by upstream categories", blocked);
  printTop("Category changed by the LLM (same type, rule-based category)", recategorized);
}

/**
 * Runs the sources + curator pipeline and asks the LLM, by rotating
 * through config/llm-models.json's models, what each app is — `app`,
 * `game`, `library` or `other`, with a category for apps and games — in
 * the priority order of `queueGroups`. Results go to
 * `config/llm-classifications.json`, which `enrichApps` applies on the next
 * rebuild (upstream store categories > LLM > heuristics; library/other
 * hide the app at high confidence).
 *
 * Needs the API key of every provider the enabled models use (see each
 * model's `apiKeyEnv` in config/llm-models.json). Each entry records the
 * model that produced it and the LLM's own `confidence`; `low` ones are
 * stored but not applied (see `llmClassificationMap`). When no model can
 * serve (all daily-capped, or all overloaded) the run saves and exits
 * cleanly.
 *
 * Resumable in every mode (--sample included): re-running skips ids already
 * present in the config file, so a sample run never reclassifies the same
 * handful of apps twice in a row — it naturally samples further into the
 * queue each time, same as a real run would.
 */
async function main(): Promise<void> {
  // Deterministic view (no LLM entry applied): queue groups and the report
  // compare against what the rules alone decide.
  const dataset = await buildDataset({ llmClassifications: [], includeExcluded: true });
  const stored = loadLlmClassifications();
  if (reportOnly) {
    report(dataset.apps, stored);
    return;
  }
  const existing = new Map(stored.map((entry) => [entry.id, entry]));
  // `--retry-low` also re-asks the entries a previous run left at "low".
  const retryLow = hasFlag("--retry-low");
  const groups = queueGroups(
    dataset.apps,
    (app) =>
      (sourceFilter === undefined || app.packages.some((pkg) => pkg.source === sourceFilter)) &&
      (!existing.has(app.id) || (retryLow && existing.get(app.id)?.confidence === "low")),
  );
  const toClassify = [
    ...groups.toClassify,
    ...groups.heuristicOnly,
    ...(includeUpstream ? groups.upstream : []),
  ];
  console.log(
    `Queue: ${groups.toClassify.length} To Classify > ${groups.heuristicOnly.length} heuristics-only > ${groups.upstream.length} upstream${includeUpstream ? "" : " (skipped, --include-upstream)"}`,
  );
  const effectiveLimit = sample ?? limit;
  const todo = effectiveLimit === undefined ? toClassify : toClassify.slice(0, effectiveLimit);

  console.log(
    `To classify: ${todo.length} | ${MODELS.map((m) => `${m.id} (x${m.batchSize})`).join(" > ")}${maxRequests !== undefined ? ` | max ${maxRequests} requests` : ""}${dryRun ? " | DRY RUN" : ""}${sample !== undefined ? ` | SAMPLE (${sample}, not persisted)` : ""}`,
  );

  const persist = !dryRun && sample === undefined;
  const results = new Map(existing);
  let newEntries = 0;

  async function runGroup(group: Group): Promise<void> {
    if (group.cursor >= group.items.length) return;
    if (dryRun) {
      for (const item of group.items) {
        results.set(item.id, {
          id: item.id,
          type: "app",
          category: TAXONOMY.app[0],
          confidence: "low",
          reason: "dry-run placeholder",
          model: "dry-run",
        } as LlmClassificationEntry);
      }
      group.cursor = group.items.length;
      return;
    }
    const { batch, results: batchResults, model } = await classifyNextBatch(group);
    group.cursor += batch.length;
    for (const result of batchResults) {
      const item = batch[result.n - 1];
      if (!item) continue;
      results.set(item.id, {
        id: item.id,
        type: result.type,
        ...("category" in result ? { category: result.category } : {}),
        confidence: result.confidence,
        reason: result.reason,
        model: model.id,
      } as LlmClassificationEntry);
      newEntries += 1;
      (state.get(model.id) as ModelState).apps += 1;
    }
    // Persist after every batch: a batch is a whole request's worth of
    // scarce free-tier quota, never worth losing to a crash or Ctrl-C.
    if (persist) writeConfig(results);
    return runGroup(group);
  }

  try {
    await runGroup({ items: toItems(todo), cursor: 0 });
  } catch (error) {
    if (!(error instanceof StopRun)) throw error;
    console.warn(
      `Stopped: ${error.message}. ${newEntries} new entries saved (${requestsMade} requests this run) — re-run later to continue where this left off.`,
    );
  }

  // Per-model usage, to calibrate batchSize/tokensPerMinute against real numbers.
  for (const model of MODELS) {
    const { requests, apps: appCount, tokens } = state.get(model.id) as ModelState;
    if (requests === 0) continue;
    console.log(
      `  ${model.id}: ${requests} requests, ${appCount} apps, ${tokens} tokens${appCount > 0 && tokens > 0 ? ` (${Math.round(tokens / appCount)}/app)` : ""}`,
    );
  }

  if (dryRun) {
    console.log(`Dry run complete — would write ${results.size} entries.`);
    return;
  }

  if (sample !== undefined) {
    console.log(
      `Sample complete (${requestsMade} requests) — real results (not written to config):`,
    );
    for (const item of todo) {
      const result = results.get(item.id);
      console.log(
        `  [${result?.confidence ?? "-"}] ${item.name} -> ${result ? `${result.type}/${"category" in result ? result.category : "-"}` : "(no result)"} (${result?.reason ?? ""}) — ${item.shortDescription.slice(0, 80)}`,
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
