import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMatchOverrides } from "../src/curator/match/overrides";
import { buildDataset } from "../src/pipeline/build-dataset";
import { bridgeWikidata } from "../src/pipeline/wikidata-bridge";
import { renderWikidataReport, splitBucket } from "../src/pipeline/wikidata-report";
import { cachePathFor } from "../src/sources/_shared/cache-path";
import { readMetadata } from "../src/sources/_shared/metadata";
import { readWikidataItems } from "../src/sources/wikidata";

/**
 * `pnpm wikidata-suggest`: where Wikidata's items (src/sources/cache/wikidata.ndjson)
 * disagree with our grouping, as a Markdown report to review by hand —
 * candidate `config/match-force.json` entries (one item, several of our
 * groups) and `config/match-apart.json` entries (one group, several items).
 * Never edits config: see src/pipeline/wikidata-bridge.ts. The report
 * names packages of every source, restricted ones included
 * (`RESTRICTED_SOURCES`): it stays in the gitignored dist/, never in a
 * public log or commit.
 *
 *   pnpm wikidata-suggest                 # writes dist/wikidata-suggestions.md and .json
 *   pnpm wikidata-suggest --out <file.md> # elsewhere (the JSON goes next to it)
 */

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const OUTPUT_PATH =
  outIndex >= 0 && args[outIndex + 1]
    ? args[outIndex + 1]!
    : fileURLToPath(new URL("../dist/wikidata-suggestions.md", import.meta.url));

const cachePath = cachePathFor("wikidata");
const items = readWikidataItems(cachePath);
if (items.length === 0) {
  console.error(`No Wikidata items in ${cachePath}: run \`pnpm refresh wikidata\` first.`);
  process.exit(1);
}
const fetchedAt = readMetadata(cachePath)?.fetchedAt;

const { apps, generatedAt } = await buildDataset({ includeExcluded: true });
const overrides = loadMatchOverrides();
const result = bridgeWikidata(apps, items, {
  force: overrides.force,
  denyPairs: overrides.denyPairs,
  apart: overrides.apart ?? [],
});

mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, renderWikidataReport(result, { generatedAt, fetchedAt }));
writeFileSync(OUTPUT_PATH.replace(/\.md$/, ".json"), `${JSON.stringify(result, null, 2)}\n`);
const buckets = Object.groupBy(result.splits, splitBucket);
console.log(
  `${result.itemsLinked}/${result.items} items linked; ${result.splits.length} split suggestions (${Object.entries(
    buckets,
  )
    .map(([bucket, list]) => `${list?.length ?? 0} ${bucket}`)
    .join(", ")}); ${result.aparts.length} apart suggestions. Report: ${OUTPUT_PATH}`,
);
