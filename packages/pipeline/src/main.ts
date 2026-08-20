import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createTursoClient } from "@tuxery/store";
import { buildDataset } from "./build-dataset";

const OUT_PATH = join(process.cwd(), "dist", "dataset.json");

/**
 * Always writes the build artifact (`dist/dataset.json`) — that's what
 * `scripts/seed.ts`'s reuse tier checks for, independent of whether a
 * publish target is configured. Publishing to Turso is an additive step
 * on top, only when `TURSO_DB_URL` is set (unset when just testing the
 * pipeline itself, e.g. `pnpm --filter @tuxery/pipeline test`).
 */
async function main() {
  const dataset = await buildDataset();

  await mkdir(dirname(OUT_PATH), { recursive: true });
  // Compact, not pretty-printed — this file is only ever machine-read
  // (scripts/seed.ts's reuse-tier check), never manually inspected, so
  // indentation would just cost extra bytes/parse time for no benefit.
  await writeFile(OUT_PATH, JSON.stringify(dataset));
  console.log(`Wrote ${dataset.apps.length} apps to ${OUT_PATH}.`);

  const { TURSO_DB_URL, TURSO_DB_AUTH_TOKEN } = process.env;
  if (TURSO_DB_URL) {
    const client = createTursoClient({ url: TURSO_DB_URL, authToken: TURSO_DB_AUTH_TOKEN });
    await client.publish(dataset);
    console.log(`Published ${dataset.apps.length} apps to ${TURSO_DB_URL}.`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
