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

const CONFIG_PATH = fileURLToPath(
  new URL("../config/llm-classifications.json", import.meta.url),
);

// --- CLI flags ---
function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

// Batch of 75 keeps a full 50k-item pass at ~667 requests — comfortably
// under the free tier's 1,500 requests/day, even if the run spans a quota
// boundary. Smaller batches are fine too; larger ones risk the daily cap.
const batchSize = Number(flag("--batch-size") ?? 75);
const concurrency = Number(flag("--concurrency") ?? 1);
const limit = flag("--limit") ? Number(flag("--limit")) : undefined;
const saveEvery = Number(flag("--save-every") ?? 50);
const dryRun = hasFlag("--dry-run");

// --- Types ---
interface BatchItem {
  id: string;
  name: string;
  description: string;
}
interface BatchResult {
  name: string;
  category: string;
  reason: string;
}

const SYSTEM_PROMPT =
  "You classify Linux software packages by their name and short description. Assign each package the single most accurate category from the allowed list. Respond with valid JSON only, one result per package, echoing each package's name exactly as given.";

function outputSchema(allowedCategories: string[]): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            category: { type: "string", enum: allowedCategories },
            reason: { type: "string" },
          },
          required: ["name", "category", "reason"],
        },
      },
    },
    required: ["results"],
  };
}

function buildPrompt(items: BatchItem[]): string {
  const lines = items.map(
    (item, i) =>
      `${i + 1}. name=${item.name} desc=${(item.description || "").slice(0, 200)}`,
  );
  return `Classify each package below into exactly one category.\n\n${lines.join("\n")}`;
}

async function classifyGemini(
  items: BatchItem[],
  allowedCategories: string[],
): Promise<BatchResult[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is required — see https://aistudio.google.com/apikey");
  const model = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const payload = {
    contents: [
      { role: "user", parts: [{ text: `${SYSTEM_PROMPT}\n\n${buildPrompt(items)}` }] },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: outputSchema(allowedCategories),
      temperature: 0,
    },
  };
  return request(url, payload, 0);
}

/**
 * One Gemini generateContent call with a recursive retry on 429 (the free
 * tier's 15 RPM / 1,500 RPD) with backoff. Recursion rather than a loop so
 * the awaited calls don't trip `no-await-in-loop` — the default concurrency
 * of 1 makes bursts unlikely, but a transient limit hit shouldn't kill the
 * whole batch run.
 */
async function request(
  url: string,
  payload: unknown,
  attempt: number,
): Promise<BatchResult[]> {
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
  if (response.status === 429 && attempt < 5) {
    const waitMs = 2000 * 2 ** attempt;
    console.warn(`Gemini 429 (rate limit) — retrying in ${waitMs / 1000}s`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    return request(url, payload, attempt + 1);
  }
  throw new Error(`Gemini ${response.status}: ${await response.text()}`);
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
 * GEMINI_API_KEY (free tier, no credit card); GEMINI_MODEL overrides the
 * default model. Retries on 429 (rate limit) with backoff.
 *
 * Resumable: re-running skips ids already present in the config file.
 */
async function main(): Promise<void> {
  const dataset = await buildDataset();
  const existing = new Map(loadLlmClassifications().map((entry) => [entry.id, entry]));
  const toClassify = dataset.apps.filter(
    (app) => app.category === "To Classify" && !existing.has(app.id),
  );
  const todo = limit === undefined ? toClassify : toClassify.slice(0, limit);

  const games = todo.filter((app) => app.contentType === "game");
  const apps = todo.filter((app) => app.contentType !== "game");

  console.log(
    `To classify: ${todo.length} (${games.length} games, ${apps.length} apps) | batch ${batchSize} | concurrency ${concurrency}${dryRun ? " | DRY RUN" : ""}`,
  );

  const classifier = classifyGemini;
  const results = new Map(existing);
  let processedBatches = 0;

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
            reason: "dry-run placeholder",
          });
        }
      } else {
        const batchResults = await classifier(batch, allowedCategories);
        for (const result of batchResults) {
          const item = batch.find((candidate) => candidate.name === result.name);
          if (!item) continue;
          results.set(item.id, {
            id: item.id,
            category: result.category as LlmClassificationEntry["category"],
            reason: result.reason,
          });
        }
      }
      processedBatches += 1;
      if (!dryRun && processedBatches % saveEvery === 0) writeConfig(results);
      return worker();
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
  }

  await runGroup(
    games.map((app) => ({ id: app.id, name: app.name, description: app.shortDescription })),
    [...GAME_CATEGORY_LABEL_VALUES],
  );
  await runGroup(
    apps.map((app) => ({ id: app.id, name: app.name, description: app.shortDescription })),
    [...APP_CATEGORY_LABEL_VALUES],
  );

  if (dryRun) {
    console.log(`Dry run complete — would write ${results.size} entries.`);
    return;
  }

  writeConfig(results);
  console.log(`Done. Wrote ${results.size} entries to config/llm-classifications.json.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
