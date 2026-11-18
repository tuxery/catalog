import { sumBy, unique } from "helpers4/array";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { hasUpstreamCategory, type CatalogApp } from "../src/curator";
import { TO_CLASSIFY } from "../src/curator/enrich/category";
import {
  loadLlmClassifications,
  type LlmClassificationEntry,
} from "../src/curator/enrich/llm-classifications";
import { buildDataset } from "../src/pipeline";
import { hasRestrictedPackage } from "../src/sources/_shared/cache-path";
import {
  fetchGithubAbout,
  GITHUB_ABOUT_PATH,
  readGithubAbout,
  writeGithubAbout,
  type GithubAbout,
} from "../src/sources/github-stars/about";
import {
  dropSharedDescriptions,
  fetchHomepageAbout,
  HOMEPAGE_ABOUT_PATH,
  readHomepageAbout,
  saysMoreThanName,
  writeHomepageAbout,
  type HomepageAbout,
} from "../src/pipeline/homepage-about";
import { loadLlmModels, type LlmModel } from "../src/curator/enrich/llm-models";
import {
  buildSystemPrompt,
  buildUserPrompt,
  checkBatchResults,
  describeWithRepository,
  isGenericReason,
  parseResults,
  TAXONOMY,
  type BatchItem,
} from "../src/curator/enrich/llm-prompt";
import { createRotation, StopRun } from "./_llm-rotation";

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

// Free tier only: Gemini with no billing on the key's Google project —
// exceeding a quota returns a 429, never a bill. The quota is small
// (observed 2026-09-26: 20 requests/day per model), so per-model batch
// size, pacing, and retries live in config/llm-models.json rather than
// here. The run is built to be cut short and resumed: progress is
// persisted after every batch, a model that hits its daily cap is dropped
// for the rest of the run, and when no model can serve the run saves and
// exits cleanly (Gemini resets at midnight Pacific time).
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
// `--github-about`: re-asks the apps the deterministic signals leave in
// "To Classify" (their earlier verdicts were `low`, or there are none) that
// have a GitHub repository, now with the repository's own description and
// topics in the prompt: new input, not the same thin name asked again. The
// description and topics are fetched into a gitignored local file
// (`.cache/github-about.ndjson`, see `sources/github-stars/about.ts`),
// never committed. Only a verdict the model is sure enough of (`medium` or
// `high`) and whose reason names real content is kept: "Desktop
// application" is the model guessing from nothing. A `library` or `other`
// verdict, which would hide the app, isn't kept either: a repository's
// one-line blurb hid real apps (a shell plugin manager, a game editor, a
// crowdfunding app) in 4 of the 21 cases of the first run, 2026-11-17.
const githubAboutMode = hasFlag("--github-about");
// `--homepage-about`: the same re-ask for the To Classify apps that have a
// homepage, with what it says about the app: a page's title and meta
// description, or the opening of a GitHub repository's README (where
// `--github-about`'s description and topics are often empty). Fetched
// into a gitignored local file (`.cache/homepage-about.ndjson`, see
// `pipeline/homepage-about.ts`), never committed. Kept as for
// `--github-about`, but `high` only (see below), and only for a page that
// says more than the app's name (`saysMoreThanName`).
const homepageAboutMode = hasFlag("--homepage-about");
// `--restricted-category`: the To Classify apps that do have a text
// (description or the start of a long description) but carry a package
// from a restricted source, which every other mode keeps from the LLM.
// Approved by the owner on 2026-11-18 for classification only: the text
// goes to the model, and only the app's type and category come back into
// this public repository, never the model's reason (it could paraphrase
// the text). Kept as for `--homepage-about`: `high`, an app or a game.
const restrictedMode = hasFlag("--restricted-category");
if ([githubAboutMode, homepageAboutMode, restrictedMode].filter(Boolean).length > 1) {
  throw new Error("--github-about, --homepage-about and --restricted-category are separate runs.");
}
// The repository's description and topics make a longer line than a store's one-liner.
const GITHUB_ABOUT_MAX_DESCRIPTION = 300;
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

const SYSTEM_PROMPT = buildSystemPrompt();
const rotation = createRotation(MODELS, { maxRequests, maxIdleMinutes });

interface Group {
  items: BatchItem[];
  cursor: number;
}

/** Classifies the group's next batch — see `Rotation.next`. */
function classifyNextBatch(group: Group) {
  return rotation.next(group.items, group.cursor, (batch) => ({
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(
      batch,
      githubAboutMode || homepageAboutMode || restrictedMode
        ? GITHUB_ABOUT_MAX_DESCRIPTION
        : undefined,
    ),
    parse: (text) => parseResults(text, TAXONOMY),
  }));
}

function toItems(
  list: CatalogApp[],
  about?: ReadonlyMap<string, GithubAbout>,
  homepageAbout?: ReadonlyMap<string, HomepageAbout>,
): BatchItem[] {
  return list.map((app) => {
    const homepageText = app.homepage ? homepageAbout?.get(app.homepage)?.text : undefined;
    let description = app.shortDescription;
    if (about) {
      description = describeWithRepository(
        app.name,
        app.shortDescription,
        app.githubStars ? about.get(app.githubStars.repo) : undefined,
      );
    } else if (homepageAbout) {
      description = describeWithRepository(
        app.name,
        app.shortDescription,
        homepageText ? { description: homepageText } : undefined,
      );
    } else if (restrictedMode) {
      description = ownText(app);
    }
    return { id: app.id, name: app.name, description };
  });
}

/**
 * What an app says about itself: its short description, or the start of
 * its long one when the short one is empty or only repeats the name.
 */
function ownText(app: CatalogApp): string {
  const short = app.shortDescription.trim();
  if (short && saysMoreThanName(short, app.name)) return short;
  const long = (app.longDescription ?? "")
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
  return [short, long].filter(Boolean).join(" / ");
}

/**
 * What the homepage of every app in `apps` says: the local file's rows,
 * plus a fetch of the homepages it doesn't hold yet (none in a dry run),
 * saved back to it.
 */
async function loadHomepageAbout(apps: CatalogApp[]): Promise<Map<string, HomepageAbout>> {
  const rows = readHomepageAbout();
  const missing = [...new Set(apps.flatMap((app) => (app.homepage ? [app.homepage] : [])))].filter(
    (url) => !rows.has(url),
  );
  if (missing.length > 0 && !dryRun) {
    console.log(`Fetching what ${missing.length} homepages say...`);
    for (const row of await fetchHomepageAbout(missing)) rows.set(row.url, row);
    writeHomepageAbout(rows.values());
    console.log(`Saved ${rows.size} homepages to ${HOMEPAGE_ABOUT_PATH} (gitignored).`);
  }
  return new Map(dropSharedDescriptions([...rows.values()]).map((row) => [row.url, row]));
}

/**
 * Whether an app may be asked about at all. Names and descriptions go to
 * the LLM, to this run's public log and, through `reason`, to a public
 * file: never a restricted source's.
 */
function eligible(app: CatalogApp): boolean {
  return (
    !hasRestrictedPackage(app.packages) &&
    (sourceFilter === undefined || app.packages.some((pkg) => pkg.source === sourceFilter))
  );
}

/** Whether a fetched repository row says anything (a description or topics). */
function hasAbout(row: GithubAbout | undefined): boolean {
  return Boolean(row?.description || row?.topics?.length);
}

/**
 * The description and topics of the GitHub repository of every app in
 * `apps`: the local file's, plus a fetch of the repositories it doesn't
 * hold yet (none in a dry run), saved back to it.
 */
async function loadGithubAbout(apps: CatalogApp[]): Promise<Map<string, GithubAbout>> {
  const about = readGithubAbout();
  const missing = [
    ...new Set(apps.flatMap((app) => (app.githubStars ? [app.githubStars.repo] : []))),
  ].filter((repo) => !about.has(repo));
  if (missing.length > 0 && !dryRun) {
    console.log(`Fetching the description and topics of ${missing.length} GitHub repositories...`);
    for (const row of await fetchGithubAbout(missing)) about.set(row.repo, row);
    writeGithubAbout(about.values());
    console.log(`Saved ${about.size} repositories to ${GITHUB_ABOUT_PATH} (gitignored).`);
  }
  return about;
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
): {
  toClassify: CatalogApp[];
  heuristicOnly: CatalogApp[];
  upstream: CatalogApp[];
} {
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
  const total = sumBy([...counts.values()], (list) => list.length);
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
    const sources = unique(app.packages.map((pkg) => pkg.source)).join("+");
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
 * Needs GEMINI_API_KEY. Each entry records the
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
  const dataset = await buildDataset({
    llmClassifications: [],
    includeExcluded: true,
  });
  const stored = loadLlmClassifications();
  if (reportOnly) {
    report(dataset.apps, stored);
    return;
  }
  const existing = new Map(stored.map((entry) => [entry.id, entry]));
  // `--retry-low` also re-asks the entries a previous run left at "low".
  const retryLow = hasFlag("--retry-low");
  // `--github-about` asks about the apps the published dataset leaves in "To
  // Classify": no applied (medium or high) verdict, a GitHub repository.
  const unclassifiedWithRepository = (app: CatalogApp) =>
    app.category === TO_CLASSIFY &&
    app.githubStars !== undefined &&
    eligible(app) &&
    existing.get(app.id)?.confidence !== "high" &&
    existing.get(app.id)?.confidence !== "medium";
  const about = githubAboutMode
    ? await loadGithubAbout(dataset.apps.filter(unclassifiedWithRepository))
    : undefined;
  // `--homepage-about`: the same apps, by their homepage instead.
  const unclassifiedWithHomepage = (app: CatalogApp) =>
    app.category === TO_CLASSIFY &&
    app.homepage !== undefined &&
    eligible(app) &&
    existing.get(app.id)?.confidence !== "high" &&
    existing.get(app.id)?.confidence !== "medium";
  const homepageAbout = homepageAboutMode
    ? await loadHomepageAbout(dataset.apps.filter(unclassifiedWithHomepage))
    : undefined;
  const unclassifiedRestricted = (app: CatalogApp) =>
    app.category === TO_CLASSIFY &&
    hasRestrictedPackage(app.packages) &&
    (sourceFilter === undefined || app.packages.some((pkg) => pkg.source === sourceFilter)) &&
    existing.get(app.id)?.confidence !== "high" &&
    existing.get(app.id)?.confidence !== "medium";
  const groups = queueGroups(dataset.apps, (app) => {
    if (restrictedMode) {
      return unclassifiedRestricted(app) && saysMoreThanName(ownText(app), app.name);
    }
    if (about) {
      return unclassifiedWithRepository(app) && hasAbout(about.get(app.githubStars?.repo ?? ""));
    }
    if (homepageAbout) {
      const text = homepageAbout.get(app.homepage ?? "")?.text;
      return (
        unclassifiedWithHomepage(app) && text !== undefined && saysMoreThanName(text, app.name)
      );
    }
    return (
      eligible(app) &&
      (!existing.has(app.id) || (retryLow && existing.get(app.id)?.confidence === "low"))
    );
  });
  const reasking = about !== undefined || homepageAbout !== undefined || restrictedMode;
  const toClassify = reasking
    ? groups.toClassify
    : [...groups.toClassify, ...groups.heuristicOnly, ...(includeUpstream ? groups.upstream : [])];
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
  let unsure = 0;

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
    for (const result of checkBatchResults(batchResults, batch.length)) {
      const item = batch[result.n - 1];
      if (!item) continue;
      if (
        reasking &&
        (result.confidence === "low" ||
          // A homepage often says little (a bare title, a company's front
          // page): checked by hand on 2026-11-18, its `medium` verdicts
          // were guesses from the name about half the time, its `high`
          // ones right 90 times in 92.
          ((homepageAbout !== undefined || restrictedMode) && result.confidence === "medium") ||
          isGenericReason(result.reason) ||
          result.type === "library" ||
          result.type === "other")
      ) {
        unsure += 1;
        continue;
      }
      results.set(item.id, {
        id: item.id,
        type: result.type,
        ...("category" in result ? { category: result.category } : {}),
        confidence: result.confidence,
        // A restricted source's verdict keeps no reason (see `restrictedMode`).
        reason: restrictedMode ? "" : result.reason,
        model: model.id,
      } as LlmClassificationEntry);
      newEntries += 1;
      rotation.countItems(model, 1);
    }
    // Persist after every batch: a batch is a whole request's worth of
    // scarce free-tier quota, never worth losing to a crash or Ctrl-C.
    if (persist) writeConfig(results);
    return runGroup(group);
  }

  try {
    await runGroup({ items: toItems(todo, about, homepageAbout), cursor: 0 });
  } catch (error) {
    if (!(error instanceof StopRun)) throw error;
    console.warn(
      `Stopped: ${error.message}. ${newEntries} new entries saved (${rotation.requestsMade()} requests this run) — re-run later to continue where this left off.`,
    );
  }

  // Per-model usage, to calibrate batchSize against real numbers.
  for (const model of MODELS) {
    const {
      requests,
      items: appCount,
      tokens,
    } = rotation.stats().get(model.id) ?? {
      requests: 0,
      items: 0,
      tokens: 0,
    };
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
      `Sample complete (${rotation.requestsMade()} requests) — real results (not written to config):`,
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
  if (reasking) {
    console.log(
      `${unsure} answers left out (low confidence, a reason naming no content, or library/other): their earlier entry stays.`,
    );
  }
  console.log(
    `Done. ${newEntries} new entries (${rotation.requestsMade()} requests); ${results.size} total in config/llm-classifications.json — ${JSON.stringify(byConfidence)}.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
