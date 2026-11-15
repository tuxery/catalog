import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { hasRestrictedPackage } from "../sources/_shared/cache-path";
import { buildDataset } from "./build-dataset";

const SAMPLE_SIZE = 1000;
const DEFAULT_OUT = fileURLToPath(new URL("../../dist/sample-dataset.json", import.meta.url));

function flagValue(name: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg?.slice(name.length + 3);
}

/**
 * Writes a small dataset for local seeding: a deterministic slice of real
 * pipeline output (not hand-authored fixtures) — deterministic because
 * groupPackages/enrichApps iterate sources in a fixed order. Goes to
 * `dist/` (gitignored), never into the repository: a sample is a copy of
 * the sources' data like any other. An app carrying a restricted source's
 * package stays out, so the file can be shared.
 */
async function main() {
  const outPath = flagValue("out") ?? DEFAULT_OUT;
  const dataset = await buildDataset();
  const sample = {
    ...dataset,
    apps: dataset.apps.filter((app) => !hasRestrictedPackage(app.packages)).slice(0, SAMPLE_SIZE),
  };

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(sample, null, 2));
  console.log(`Wrote ${sample.apps.length} apps to ${outPath}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
