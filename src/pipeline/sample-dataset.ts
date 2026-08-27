import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDataset } from "./build-dataset";

const SAMPLE_SIZE = 1000;
const DEFAULT_OUT = fileURLToPath(new URL("./dev-sample/dataset.json", import.meta.url));

function flagValue(name: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg?.slice(name.length + 3);
}

/**
 * Regenerates the web app's dev sample: a deterministic slice of real
 * pipeline output (not hand-authored fixtures) — deterministic because
 * groupPackages/enrichApps iterate sources in a fixed order. Committed
 * here (same repo as this command), read cross-repo by `app`'s
 * `dev-worker.mjs` default — see that file's comment. Manual/occasional
 * maintenance command, not run on every dev boot — see AGENTS.md.
 */
async function main() {
  const outPath = flagValue("out") ?? DEFAULT_OUT;
  const dataset = await buildDataset();
  const sample = { ...dataset, apps: dataset.apps.slice(0, SAMPLE_SIZE) };

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(sample, null, 2));
  console.log(`Wrote ${sample.apps.length} apps to ${outPath}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
