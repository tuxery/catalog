import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createTursoClient, type TursoDataset } from "../src/store";
import { refreshSources } from "./_refresh-sources";

const DATASET_PATH = fileURLToPath(new URL("../dist/dataset.json", import.meta.url));

// Local libSQL file — lives here, never under `app`, so no dataset bytes
// touch that repo's filesystem even transiently.
const LOCAL_DB_PATH = fileURLToPath(new URL("../.turso-state/local.db", import.meta.url));

// Shared credentials for the real hosted Turso DBs, used by --remote/--dev.
// One file per environment, read by both repos (`app`'s scripts/dev.mjs
// parses the dev one the same way) so there's a single place to update
// rather than drifting copies. Neither is committed — real credentials,
// per-environment. Only exist in the local devcontainer; CI has no such
// files and relies on the `process.env` fallback in `resolveTursoEnv`
// below instead (GitHub Actions injects secrets that way).
const SHARED_ENV_PATH = "/workspaces/.dev/.env";
const PROD_ENV_PATH = "/workspaces/.dev/.env.prod";

function run(cmd: string, args: string[]): void {
  const result = spawnSync(cmd, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function readSharedEnv(path: string): Record<string, string> {
  const content = readFileSync(path, "utf8");
  const env: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return env;
}

/**
 * Turso credentials for --remote/--dev/--prod: the shared env file if it
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
// `--dev` is an alias for `--remote` — same target (the real hosted Turso
// dev DB), just a name that reads symmetrically with `--prod` for CI/new
// call sites. `--remote` stays the primary documented name (shared with
// `app`'s own `pnpm dev --remote`, same concept there) — this isn't a
// rename, just a second spelling.
const dev = process.argv.includes("--dev");
const remote = process.argv.includes("--remote") || dev || prod;

if (force) refreshSources();

if (force || !existsSync(DATASET_PATH)) {
  run("pnpm", ["run", "start"]);
} else {
  console.log(`Reusing ${DATASET_PATH} (pass --force to re-fetch sources and rebuild).`);
}

const dataset = JSON.parse(readFileSync(DATASET_PATH, "utf8")) as TursoDataset;

if (remote) {
  const mode = prod ? "prod" : dev ? "dev" : "remote";
  const envPath = prod ? PROD_ENV_PATH : SHARED_ENV_PATH;
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
