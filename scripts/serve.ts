import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SQLD_ADMIN_PORT, SQLD_PORT, startSqld } from "./_sqld";

// Must match scripts/seed.ts's LOCAL_DB_PATH.
const LOCAL_DB_PATH = fileURLToPath(new URL("../.turso-state/local.db", import.meta.url));

if (!existsSync(LOCAL_DB_PATH)) {
  console.error(`No local database at ${LOCAL_DB_PATH} — run \`pnpm seed\` first.`);
  process.exit(1);
}

// Foreground, blocking — this repo owns the data, so it owns exposing it.
// `app`'s dev server is a pure client: it only ever connects to a URL,
// it never starts this (or any) database infrastructure itself.
console.log(
  `Serving ${LOCAL_DB_PATH} on :${SQLD_PORT}, admin API on :${SQLD_ADMIN_PORT} ` +
    "(`pnpm turso-stats --local` for rows read/written). Ctrl-C to stop.",
);
const { child, stop } = startSqld(LOCAL_DB_PATH);
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code) => {
  stop();
  process.exit(code ?? 0);
});
