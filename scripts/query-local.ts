import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";

// Must match scripts/seed.ts's LOCAL_DB_PATH.
const LOCAL_DB_PATH = fileURLToPath(new URL("../.turso-state/local.db", import.meta.url));

const sql = process.argv.slice(2).join(" ").trim();
if (!sql) {
  console.error('Usage: pnpm query-local "SELECT ..."');
  process.exit(1);
}

if (!existsSync(LOCAL_DB_PATH)) {
  console.error(`No local database at ${LOCAL_DB_PATH} — run \`pnpm seed\` first.`);
  process.exit(1);
}

// Opens the file directly — no `turso dev` server, no `pnpm serve`, and
// critically no network round trip to preview/prod, ever. This is the
// only sanctioned way to run an ad-hoc SQL query (EXPLAIN QUERY PLAN,
// row counts, spot-checking a WHERE clause, ...) while iterating on
// curator changes or verifying an index actually gets used — anything
// that isn't a plain read of dist/dataset.json itself (which is enough
// for most classification-stat checks and costs nothing at all). Real
// incident, 2026-09-03: ad-hoc verification queries run directly against
// the hosted preview/prod DBs contributed to burning through Turso's
// monthly read quota in days — this script exists so that never needs to
// happen again for anything exploratory.
const client = createClient({ url: `file:${LOCAL_DB_PATH}` });
const result = await client.execute(sql);
console.table(result.rows);
