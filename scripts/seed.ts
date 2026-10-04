import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createTursoClient, type TursoDataset } from "../src/store";
import { refreshSources } from "./_refresh-sources";
import { readSqldStats, startSqld, waitForSqld } from "./_sqld";
import { PREVIEW_ENV_PATH, PROD_ENV_PATH, readSharedEnv } from "./_shared-env";

const DATASET_PATH = fileURLToPath(new URL("../dist/dataset.json", import.meta.url));

// Local libSQL file — lives here, never under `app`, so no dataset bytes
// touch that repo's filesystem even transiently. This is local dev's only
// mode now — there is no hosted "Turso dev" database any more (see
// PREVIEW_ENV_PATH below): a Workers isolate can't open a SQLite file
// directly, so `app`'s local dev points at the `turso dev` HTTP server
// `pnpm serve` runs in front of this same file instead.
const LOCAL_DB_PATH = fileURLToPath(new URL("../.turso-state/local.db", import.meta.url));

// Credentials for the two real hosted Turso DBs (--preview/--prod) live in
// the shared env files described in _shared-env.ts, read by both repos
// (`app`'s scripts/dev.mjs parses them the same way) so there's a single
// place to update rather than drifting copies.

function run(cmd: string, args: string[]): void {
  const result = spawnSync(cmd, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

/**
 * Turso credentials for --preview/--prod: the shared env file if it
 * exists and has TURSO_DB_URL (the local devcontainer case), else
 * `process.env` directly (the CI case — GitHub Actions secrets arrive
 * this way, not as a file at `envPath`).
 */
function resolveTursoEnv(envPath: string): Record<string, string | undefined> {
  if (existsSync(envPath)) {
    const fileEnv = readSharedEnv(envPath);
    if (fileEnv.TURSO_DB_URL) return fileEnv;
  }
  return process.env;
}

const force = process.argv.includes("--force");
const prod = process.argv.includes("--prod");
const preview = process.argv.includes("--preview");
const measure = process.argv.includes("--measure");
const remote = preview || prod;

if (force) refreshSources();

if (force || !existsSync(DATASET_PATH)) {
  run("pnpm", ["run", "start"]);
} else {
  console.log(`Reusing ${DATASET_PATH} (pass --force to re-fetch sources and rebuild).`);
}

const dataset = JSON.parse(readFileSync(DATASET_PATH, "utf8")) as TursoDataset;

if (measure) {
  // What one publish costs in Turso's billed counters, without spending any
  // quota: publish through a throwaway sqld (on spare ports, so a running
  // `pnpm serve` is untouched) over a copy of the local database, so the
  // swap replaces a real previous dataset like a re-publish to preview/prod
  // does. An estimate to calibrate against `pnpm turso-stats` around a real
  // publish, not a bill (see scripts/_sqld.ts).
  const dir = mkdtempSync(join(tmpdir(), "catalog-measure-"));
  const dbFile = join(dir, "measure.db");
  if (existsSync(LOCAL_DB_PATH)) copyFileSync(LOCAL_DB_PATH, dbFile);
  else
    console.log(
      `No ${LOCAL_DB_PATH} to start from: measuring a first publish into an empty database.`,
    );
  const sqld = startSqld(dbFile, { port: 18080, adminPort: 18081, stdio: "ignore" });
  try {
    await waitForSqld(sqld.url);
    const before = await readSqldStats(sqld.adminUrl);
    const started = Date.now();
    await createTursoClient({ url: sqld.url }).publish(dataset);
    const after = await readSqldStats(sqld.adminUrl);
    console.log(
      `\nOne publish of ${dataset.apps.length} apps (${Math.round((Date.now() - started) / 1000)}s): ` +
        `${after.rows_written_count - before.rows_written_count} rows written, ` +
        `${after.rows_read_count - before.rows_read_count} rows read (local sqld estimate).`,
    );
    console.log("Top statements (cumulative):");
    // A fresh copy: toSorted() needs ES2023 (see turso-client.ts).
    // eslint-disable-next-line unicorn/no-array-sort
    const top = [...after.top_queries].sort((a, b) => b.rows_written - a.rows_written);
    for (const query of top) {
      console.log(
        `  ${String(query.rows_written).padStart(9)} written ${String(query.rows_read).padStart(9)} read  ${query.query.replace(/\s+/g, " ").slice(0, 100)}`,
      );
    }
  } finally {
    sqld.stop();
    rmSync(dir, { recursive: true, force: true });
  }
} else if (remote) {
  const mode = prod ? "prod" : "preview";
  const envPath = prod ? PROD_ENV_PATH : PREVIEW_ENV_PATH;
  const env = resolveTursoEnv(envPath);
  if (!env.TURSO_DB_URL) {
    console.error(`--${mode} requires TURSO_DB_URL in ${envPath} or the environment.`);
    process.exit(1);
  }
  const client = createTursoClient({ url: env.TURSO_DB_URL, authToken: env.TURSO_DB_AUTH_TOKEN });
  await client.publish(dataset);
  console.log(`\n${dataset.apps.length} apps published to ${env.TURSO_DB_URL} (${mode} mode).`);
} else {
  mkdirSync(dirname(LOCAL_DB_PATH), { recursive: true });
  const client = createTursoClient({ url: `file:${LOCAL_DB_PATH}` });
  await client.publish(dataset);
  console.log(
    `\n${dataset.apps.length} apps seeded at ${LOCAL_DB_PATH}. Run \`pnpm serve\` to start the local server.`,
  );
}
