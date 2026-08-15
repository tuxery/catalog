import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { join } from "node:path";

// Must match scripts/seed.ts's LOCAL_DB_PATH.
const LOCAL_DB_PATH = fileURLToPath(new URL("../.turso-state/local.db", import.meta.url));
const LOCAL_DB_PORT = 8080;

function findTursoBinary(): string {
  if (spawnSync("which", ["turso"]).status === 0) return "turso";
  const installed = join(homedir(), ".turso", "turso");
  if (existsSync(installed)) return installed;
  console.error(
    "turso CLI not found (checked PATH and ~/.turso/turso).\n" +
      "Install it: curl -sSfL https://get.tur.so/install.sh | bash",
  );
  process.exit(1);
}

if (!existsSync(LOCAL_DB_PATH)) {
  console.error(`No local database at ${LOCAL_DB_PATH} — run \`pnpm seed\` first.`);
  process.exit(1);
}

// Foreground, blocking — this repo owns the data, so it owns exposing it.
// `app`'s dev server is a pure client: it only ever connects to a URL,
// it never starts this (or any) database infrastructure itself.
console.log(`Serving ${LOCAL_DB_PATH} on :${LOCAL_DB_PORT}. Ctrl-C to stop.`);
spawnSync(findTursoBinary(), ["dev", "--db-file", LOCAL_DB_PATH, "--port", String(LOCAL_DB_PORT)], {
  stdio: "inherit",
});
