import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { refreshSources } from "./_refresh-sources";

// Absolute sibling path — matches the fixed workspace layout the root
// CLAUDE.md documents (repos cloned as siblings under /workspaces/<name>
// by the devcontainer setup, never bind-mounted). Mirrors the app/catalog
// split @tuxery/store's r2-client.ts doc comment already describes.
const APP_DEV_WORKER = "/workspaces/app/apps/web/scripts/dev-worker.mjs";

const DATASET_PATH = fileURLToPath(new URL("../packages/pipeline/dist/dataset.json", import.meta.url));

function run(cmd: string, args: string[]): void {
  const result = spawnSync(cmd, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const force = process.argv.includes("--force");

if (force) refreshSources();

if (force || !existsSync(DATASET_PATH)) {
  run("pnpm", ["--filter", "@tuxery/pipeline", "start"]);
} else {
  console.log(`Reusing ${DATASET_PATH} (pass --force to re-fetch sources and rebuild).`);
}

run("node", [APP_DEV_WORKER, `--dataset=${DATASET_PATH}`]);
