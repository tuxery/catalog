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

// Shared credentials for the real hosted Turso dev DB, used by --remote.
// One file, read by both repos (`app`'s scripts/dev.mjs parses the same
// file) so there's a single place to update rather than two drifting
// copies. Not committed — real credentials, per-developer.
const SHARED_ENV_PATH = "/workspaces/.dev/.env";

function run(cmd: string, args: string[]): void {
  const result = spawnSync(cmd, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function readSharedEnv(): Record<string, string> {
  const content = readFileSync(SHARED_ENV_PATH, "utf8");
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

const force = process.argv.includes("--force");
const remote = process.argv.includes("--remote");

if (force) refreshSources();

if (force || !existsSync(DATASET_PATH)) {
  run("pnpm", ["run", "start"]);
} else {
  console.log(`Reusing ${DATASET_PATH} (pass --force to re-fetch sources and rebuild).`);
}

const dataset = JSON.parse(readFileSync(DATASET_PATH, "utf8")) as TursoDataset;

if (remote) {
  const env = readSharedEnv();
  if (!env.TURSO_DB_URL) {
    console.error(`--remote requires TURSO_DB_URL in ${SHARED_ENV_PATH}`);
    process.exit(1);
  }
  const client = createTursoClient({ url: env.TURSO_DB_URL, authToken: env.TURSO_DB_AUTH_TOKEN });
  await client.publish(dataset);
  console.log(`\n${dataset.apps.length} apps published to ${env.TURSO_DB_URL} (remote mode).`);
} else {
  mkdirSync(dirname(LOCAL_DB_PATH), { recursive: true });
  const client = createTursoClient({ url: `file:${LOCAL_DB_PATH}` });
  await client.publish(dataset);
  console.log(
    `\n${dataset.apps.length} apps seeded at ${LOCAL_DB_PATH}. Run \`pnpm serve\` to start the local server.`,
  );
}
