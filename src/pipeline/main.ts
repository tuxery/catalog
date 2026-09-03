import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { buildDataset } from "./build-dataset";

const OUT_PATH = join(process.cwd(), "dist", "dataset.json");

/**
 * Only ever writes the build artifact (`dist/dataset.json`) — never
 * touches Turso. `scripts/seed.ts --preview`/`--prod` is the sole,
 * explicit publish path (each reading its own `.env.preview`/`.env.prod`
 * credentials); this file used to also auto-publish whenever a bare
 * `TURSO_DB_URL` happened to be set in the environment, which was both
 * unused (no CI workflow ever relied on it) and a real risk to "local
 * dev/CI dataset rebuilds never touch a live database" — removed
 * 2026-09-03.
 */
async function main() {
  const dataset = await buildDataset();

  await mkdir(dirname(OUT_PATH), { recursive: true });
  // Compact, not pretty-printed — this file is only ever machine-read
  // (scripts/seed.ts's reuse-tier check), never manually inspected, so
  // indentation would just cost extra bytes/parse time for no benefit.
  await writeFile(OUT_PATH, JSON.stringify(dataset));
  console.log(`Wrote ${dataset.apps.length} apps to ${OUT_PATH}.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
