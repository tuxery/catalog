import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Runs libSQL's `sqld` server, the one Turso's CLI ships (`turso dev` is a
 * thin wrapper around it), directly rather than through `turso dev`, for
 * two reasons:
 *
 * - `turso dev` looks `sqld` up on PATH only, but the installer puts it in
 *   `~/.turso` and wires that into `~/.bashrc` alone: any non-interactive
 *   shell (VS Code task, CI step, agent) gets "sqld: executable file not
 *   found in $PATH".
 * - `turso dev` has no flag for sqld's admin API, whose
 *   `GET /v1/namespaces/default/stats` reports `rows_read`/`rows_written`
 *   per query, the counters Turso bills on. That's what lets read and write
 *   costs be measured locally, without spending quota (`pnpm turso-stats
 *   --local`, `pnpm seed --measure`).
 *
 * Not iso with Turso Cloud (checked 2026-10-04): the latest released sqld
 * (0.24.32) embeds SQLite 3.45.1 where the cloud runs 3.47.0, and lacks
 * ENABLE_STAT4, so a query plan, and its row count, can differ. Treat local
 * numbers as an estimate to calibrate against preview, not a bill.
 */

export const SQLD_PORT = 8080;
export const SQLD_ADMIN_PORT = 8081;

export interface SqldStats {
  rows_read_count: number;
  rows_written_count: number;
  top_queries: { query: string; rows_read: number; rows_written: number }[];
}

export function findSqld(): string {
  if (spawnSync("which", ["sqld"]).status === 0) return "sqld";
  const installed = join(homedir(), ".turso", "sqld");
  if (existsSync(installed)) return installed;
  console.error(
    "sqld not found (checked PATH and ~/.turso/sqld). It ships with the Turso CLI:\n" +
      "  curl -sSfL https://get.tur.so/install.sh | bash",
  );
  process.exit(1);
}

/**
 * Starts sqld in front of an existing SQLite file: a throwaway data dir whose
 * default namespace's `data` is a symlink to it, so writes land in that file
 * and `file:` clients see them. `turso dev --db-file` puts the symlink at the
 * dir's root instead, which sqld 0.24 takes for a pre-0.18 layout and
 * migrates on every start.
 */
export function startSqld(
  dbFile: string,
  {
    port = SQLD_PORT,
    adminPort = SQLD_ADMIN_PORT,
    stdio = "inherit",
  }: { port?: number; adminPort?: number; stdio?: "inherit" | "ignore" } = {},
): { child: ChildProcess; url: string; adminUrl: string; stop: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "catalog-sqld-"));
  mkdirSync(join(dir, "dbs", "default"), { recursive: true });
  symlinkSync(resolve(dbFile), join(dir, "dbs", "default", "data"));
  const child = spawn(
    findSqld(),
    [
      "--no-welcome",
      "--http-listen-addr",
      // 0.0.0.0, like `turso dev`: what app's dev server and CI already reach.
      `0.0.0.0:${port}`,
      "--admin-listen-addr",
      `127.0.0.1:${adminPort}`,
      "-d",
      dir,
    ],
    { stdio },
  );
  const stop = (): void => {
    child.kill("SIGINT");
    rmSync(dir, { recursive: true, force: true });
  };
  return {
    child,
    url: `http://127.0.0.1:${port}`,
    adminUrl: `http://127.0.0.1:${adminPort}`,
    stop,
  };
}

/** Polls until sqld answers a real query (a TCP accept alone isn't enough), or throws. */
export async function waitForSqld(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  // Sequential on purpose: each poll waits for the previous one.
  /* eslint-disable no-await-in-loop */
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/v2/pipeline`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requests: [{ type: "execute", stmt: { sql: "SELECT 1" } }] }),
      });
      if (response.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((done) => setTimeout(done, 250));
  }
  /* eslint-enable no-await-in-loop */
  throw new Error(`sqld didn't answer on ${url} within ${timeoutMs / 1000}s`);
}

export async function readSqldStats(adminUrl: string): Promise<SqldStats> {
  const response = await fetch(`${adminUrl}/v1/namespaces/default/stats`);
  if (!response.ok) {
    throw new Error(`sqld admin API ${response.status} on ${adminUrl}: ${await response.text()}`);
  }
  return (await response.json()) as SqldStats;
}
