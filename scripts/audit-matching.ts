import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDataset } from "../src/pipeline/build-dataset";
import {
  checkGolden,
  generateGolden,
  GoldenListSchema,
  hiddenAppSuspects,
  megagroupSuspects,
  sameNameSuspects,
  sharedHomepageSuspects,
  type AuditSuspect,
} from "../src/pipeline/audit";

/**
 * `pnpm audit-matching`: suspected matching mistakes in a freshly built dataset,
 * ranked by reach, plus the golden-set check — see src/pipeline/audit.ts.
 *
 *   pnpm audit-matching                  # summary + dist/audit.json; exit 0
 *   pnpm audit-matching --check          # exit 2 when a golden product is split or merged
 *   pnpm audit-matching --init-golden    # (re)write config/audit-golden.json from the
 *                                        # current data: the 200 most-installed products
 *
 * dist/audit.json is what the audit review page is built from.
 */

const GOLDEN_PATH = fileURLToPath(new URL("../config/audit-golden.json", import.meta.url));
const OUTPUT_PATH = fileURLToPath(new URL("../dist/audit.json", import.meta.url));
const GOLDEN_SIZE = 200;
// The review page lists this many suspects per signal, by reach.
const SUSPECTS_PER_SIGNAL = 300;

const args = new Set(process.argv.slice(2));
const { apps, generatedAt } = await buildDataset({ includeExcluded: true });

if (args.has("--init-golden")) {
  const golden = generateGolden(apps, GOLDEN_SIZE);
  writeFileSync(GOLDEN_PATH, `${JSON.stringify(golden, null, 2)}\n`);
  console.log(`Wrote ${golden.length} golden products to ${GOLDEN_PATH} — review before trusting.`);
}

const golden = existsSync(GOLDEN_PATH)
  ? GoldenListSchema.parse(JSON.parse(readFileSync(GOLDEN_PATH, "utf8")))
  : [];
const violations = checkGolden(apps, golden);

const signals: Record<string, AuditSuspect[]> = {
  "shared-homepage": sharedHomepageSuspects(apps),
  "same-name": sameNameSuspects(apps),
  megagroup: megagroupSuspects(apps),
  "hidden-app": hiddenAppSuspects(apps),
};

const published = apps.filter((app) => !app.excluded && !app.companionOf);
const report = {
  generatedAt,
  datasetGeneratedAt: generatedAt,
  totals: {
    groups: apps.length,
    published: published.length,
    excluded: apps.filter((app) => app.excluded).length,
    companions: apps.filter((app) => app.companionOf).length,
    singleSource: published.filter(
      (app) => new Set(app.packages.map((pkg) => pkg.source)).size === 1,
    ).length,
  },
  counts: Object.fromEntries(
    Object.entries(signals).map(([signal, list]) => [signal, list.length]),
  ),
  suspects: Object.fromEntries(
    Object.entries(signals).map(([signal, list]) => [
      signal,
      list.toSorted((a, b) => b.reach - a.reach).slice(0, SUSPECTS_PER_SIGNAL),
    ]),
  ),
  golden: { products: golden.length, violations },
};

mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`);

console.log(`${report.totals.published} published of ${report.totals.groups} groups.`);
for (const [signal, count] of Object.entries(report.counts)) console.log(`  ${signal}: ${count}`);
console.log(`Golden: ${golden.length} products, ${violations.length} violations.`);
for (const violation of violations.slice(0, 20)) {
  console.log(`  ${violation.kind} ${violation.product}: ${violation.detail}`);
}
console.log(`Report: ${OUTPUT_PATH}`);

if (args.has("--check") && violations.length > 0) process.exit(2);
