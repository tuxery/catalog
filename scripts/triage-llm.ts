import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadLlmModels, type LlmModel } from "../src/curator/enrich/llm-models";
import type { AuditSignal, AuditSuspect } from "../src/pipeline/audit";
import {
  GROUP_SIGNALS,
  MAX_CARDS,
  buildTriageSystemPrompt,
  buildTriageUserPrompt,
  parseTriageResults,
  TriageSuggestionsListSchema,
  type TriageItem,
  type TriageSuggestion,
} from "../src/pipeline/triage-prompt";
import { createRotation, StopRun } from "./_llm-rotation";

/**
 * `pnpm triage-llm`: an LLM's first opinion on each suspect of the last
 * `pnpm audit-matching` report (dist/audit.json), most-reached first, saved
 * to config/audit-llm-suggestions.json after every request — the same free
 * tiers and rotation as classify-llm (config/llm-models.json), resumable:
 * a suspect that already has a suggestion is skipped.
 *
 *   pnpm triage-llm                       # every listed suspect still without a suggestion
 *   pnpm triage-llm --signals declared-relation,same-name
 *   pnpm triage-llm --limit 100           # at most 100 suspects this run
 *   pnpm triage-llm --sample 10           # real calls, printed, not saved
 *   pnpm triage-llm --models qwen/qwen3.8-27b --max-requests 5
 *
 * Suggestions are shown on the review page next to human verdicts and are
 * never applied to config on their own.
 */

const REPORT_PATH = fileURLToPath(new URL("../dist/audit.json", import.meta.url));
const SUGGESTIONS_PATH = fileURLToPath(
  new URL("../config/audit-llm-suggestions.json", import.meta.url),
);
// Easiest first: a declared relation only needs confirming a quoted
// statement. Megagroups are left out: a suspect lists the group as one
// card, not its member packages, so a model can't see the mix — on the
// first run it called 12 of 13 "fine", `dotnet`'s 202 packages included.
const DEFAULT_SIGNALS: AuditSignal[] = [
  "declared-relation",
  "same-name",
  "shared-homepage",
  "hidden-app",
];

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const signals = (flag("--signals")?.split(",") ?? DEFAULT_SIGNALS) as AuditSignal[];
const limit = flag("--limit") ? Number(flag("--limit")) : undefined;
const sample = flag("--sample") ? Number(flag("--sample")) : undefined;
const maxRequests = flag("--max-requests") ? Number(flag("--max-requests")) : undefined;
const maxIdleMinutes = Number(flag("--max-idle") ?? 20);

function resolveModels(): LlmModel[] {
  const all = loadLlmModels();
  const ids = flag("--models");
  if (!ids) return all.filter((model) => model.enabled);
  return ids.split(",").map((id) => {
    const model = all.find((candidate) => candidate.id === id.trim());
    if (!model) throw new Error(`--models: "${id}" is not in config/llm-models.json`);
    return model;
  });
}

// A suspect carries several apps, about ten times an app's prompt in
// classify-llm, which sizes `batchSize`.
const suspectsPerRequest = (model: LlmModel) => Math.max(3, Math.floor(model.batchSize / 10));

function keyOf(entry: { signal: string; key: string; appId?: string }): string {
  return `${entry.signal}|${entry.key}${entry.appId ? `|${entry.appId}` : ""}`;
}

/** The suggestion keys a suspect needs: one per judged card in a group, else one. */
function neededKeys(item: TriageItem): string[] {
  if (!GROUP_SIGNALS.has(item.signal)) return [keyOf(item)];
  return item.apps.slice(1, MAX_CARDS).map((app) => keyOf({ ...item, appId: app.id }));
}

function save(suggestions: Map<string, TriageSuggestion>): void {
  writeFileSync(SUGGESTIONS_PATH, `${JSON.stringify([...suggestions.values()], null, 2)}\n`);
}

async function main(): Promise<void> {
  if (!existsSync(REPORT_PATH)) {
    throw new Error("No dist/audit.json — run `pnpm audit-matching` first.");
  }
  const report = JSON.parse(readFileSync(REPORT_PATH, "utf8")) as {
    suspects: Record<string, AuditSuspect[]>;
  };
  const stored = existsSync(SUGGESTIONS_PATH)
    ? TriageSuggestionsListSchema.parse(JSON.parse(readFileSync(SUGGESTIONS_PATH, "utf8")))
    : [];
  // Group suspects are judged card by card: a suggestion about a whole
  // group (from before) can't be accepted for any one card, so it goes.
  const suggestions = new Map(
    stored
      .filter((entry) => !GROUP_SIGNALS.has(entry.signal as AuditSignal) || entry.appId)
      .map((entry) => [keyOf(entry), entry]),
  );

  const queue: TriageItem[] = signals
    .flatMap((signal) =>
      (report.suspects[signal] ?? []).map((suspect) => ({
        signal,
        key: suspect.key,
        apps: suspect.apps,
        relation: suspect.relation,
        reach: suspect.reach,
      })),
    )
    .filter((item) => neededKeys(item).some((key) => !suggestions.has(key)));
  const todo = queue.slice(0, sample ?? limit ?? queue.length);

  const models = resolveModels();
  console.log(
    `To triage: ${todo.length} of ${queue.length} pending | ${models.map((m) => `${m.id} (x${suspectsPerRequest(m)})`).join(" > ")}${sample !== undefined ? " | SAMPLE (not saved)" : ""}`,
  );

  const rotation = createRotation(models, { maxRequests, maxIdleMinutes });
  const system = buildTriageSystemPrompt();
  let added = 0;

  async function run(cursor: number): Promise<void> {
    if (cursor >= todo.length) return;
    const { batch, results, model } = await rotation.next(
      todo,
      cursor,
      (items) => ({
        system,
        user: buildTriageUserPrompt(items),
        parse: (text) => parseTriageResults(text, items),
      }),
      suspectsPerRequest,
    );
    for (const result of results) {
      const item = batch[result.n - 1];
      if (!item) continue;
      const appId = GROUP_SIGNALS.has(item.signal) ? item.apps[result.card - 1]?.id : undefined;
      const suggestion: TriageSuggestion = {
        signal: item.signal,
        key: item.key,
        ...(appId ? { appId } : {}),
        verdict: result.verdict,
        confidence: result.confidence,
        reason: result.reason,
        model: model.id,
      };
      suggestions.set(keyOf(suggestion), suggestion);
      added += 1;
      if (sample !== undefined) {
        console.log(
          `  [${result.confidence}] ${item.signal} ${item.key}${appId ? ` · ${appId}` : ""} -> ${result.verdict} (${result.reason})`,
        );
      }
    }
    rotation.countItems(model, results.length);
    // A request is scarce free-tier quota: never lose one to a crash or Ctrl-C.
    if (sample === undefined) save(suggestions);
    return run(cursor + batch.length);
  }

  try {
    await run(0);
  } catch (error) {
    if (!(error instanceof StopRun)) throw error;
    console.warn(`Stopped: ${error.message} — re-run later to continue where this left off.`);
  }

  for (const model of models) {
    const stats = rotation.stats().get(model.id);
    if (stats?.requests) {
      console.log(
        `  ${model.id}: ${stats.requests} requests, ${stats.items} suspects, ${stats.tokens} tokens`,
      );
    }
  }
  console.log(
    `${added} suggestions ${sample === undefined ? `saved; ${suggestions.size} in config/audit-llm-suggestions.json` : "(sample, not saved)"} — ${rotation.requestsMade()} requests.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
