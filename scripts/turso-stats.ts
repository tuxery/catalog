import { PREVIEW_ENV_PATH, PROD_ENV_PATH, SHARED_ENV_PATH, readSharedEnv } from "./_shared-env";

/**
 * `pnpm turso-stats`: the Turso org's usage for the current calendar month
 * against its monthly quotas, per-database usage, and each database's
 * costliest queries — and a non-zero exit when usage crosses a threshold,
 * so a scheduled workflow can alert before Turso hard-blocks the database.
 *
 * Both past incidents (writes 2026-09-04/05, 10.36M/10M; reads 2026-09-11,
 * 518.93M/500M) were found only after Turso's own email, once the database
 * was already blocked. Watching CI failures can't catch this either: the
 * counters move with live-site traffic, not with CI runs.
 *
 *   pnpm turso-stats                  # report; exit 0
 *   pnpm turso-stats --threshold 80   # exit 2 if any quota is >= 80% used,
 *                                     # or projected to exceed 100% by month end
 *   pnpm turso-stats --json           # machine-readable report
 *
 * Credentials: a Turso *Platform API* token (`TURSO_API_TOKEN`), not the
 * per-database auth tokens the app uses — those can query a database but
 * can't read its usage. Mint one scoped to the org and read-only:
 *   turso auth api-tokens mint turso-stats --org <org> --read-only
 * Locally it's read from /workspaces/.dev/.env; in CI from a secret.
 * Databases come from the same TURSO_DB_URLs `pnpm seed --preview/--prod`
 * uses (PREVIEW_/PROD_TURSO_DB_URL in CI); the org slug is derived from
 * them (`libsql://<db>-<org>.…`) unless TURSO_ORG is set.
 */

const API = "https://api.turso.tech/v1";

// Monthly quotas of the org's plan, as reported in the two incidents
// (Turso's own alert emails). Turso's org-usage endpoint documents an
// allowance object, but its exact meaning wasn't verifiable without a
// token — so the limits are explicit here, overridable per env var, and
// the raw org response is printed by --json to check against.
const DEFAULT_LIMITS = {
  rows_read: 500_000_000,
  rows_written: 10_000_000,
};

// Before this share of the month has elapsed, the end-of-month projection
// is too noisy to alert on (a busy first morning extrapolates wildly).
const MIN_ELAPSED_FOR_PROJECTION = 0.1;

interface Usage {
  rows_read: number;
  rows_written: number;
  storage_bytes: number;
  bytes_synced: number;
}

interface TopQuery {
  query: string;
  rows_read: number;
  rows_written: number;
}

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const threshold = flag("--threshold") === undefined ? undefined : Number(flag("--threshold"));
const asJson = process.argv.includes("--json");
const topCount = Number(flag("--top") ?? 5);

/** `process.env` first (CI secrets), then the devcontainer's shared env file. */
function env(name: string, file = SHARED_ENV_PATH): string | undefined {
  return process.env[name] || readSharedEnv(file)[name] || undefined;
}

/** "libsql://prod-tuxery.aws-eu-west-1.turso.io" → "prod-tuxery". */
function hostLabel(url: string): string {
  return new URL(url.replace(/^libsql:/, "https:")).hostname.split(".")[0] ?? "";
}

function resolveDatabases(): { org: string; names: string[] } {
  const urls = [
    env("PREVIEW_TURSO_DB_URL") ?? readSharedEnv(PREVIEW_ENV_PATH).TURSO_DB_URL,
    env("PROD_TURSO_DB_URL") ?? readSharedEnv(PROD_ENV_PATH).TURSO_DB_URL,
  ].filter((url): url is string => Boolean(url));
  if (urls.length === 0) {
    throw new Error(
      "No database URL found: set PREVIEW_TURSO_DB_URL/PROD_TURSO_DB_URL, or TURSO_DB_URL in /workspaces/.dev/.env.preview/.env.prod.",
    );
  }
  const labels = urls.map(hostLabel);
  // Turso hostnames are "<db>-<org>": without TURSO_ORG, assume a
  // hyphen-free org slug — the last hyphen-separated part.
  const org = env("TURSO_ORG") ?? labels[0]?.split("-").at(-1) ?? "";
  const suffix = `-${org}`;
  const names = labels.map((label) =>
    label.endsWith(suffix) ? label.slice(0, -suffix.length) : label,
  );
  return { org, names };
}

async function api<T>(token: string, path: string): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Turso API ${response.status} on ${path}: ${await response.text()}`);
  }
  return (await response.json()) as T;
}

function monthWindow(now = new Date()): { from: Date; to: Date; elapsed: number } {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { from, to, elapsed: (now.getTime() - from.getTime()) / (to.getTime() - from.getTime()) };
}

function human(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}G`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

async function main(): Promise<void> {
  const token = env("TURSO_API_TOKEN");
  if (!token) {
    throw new Error(
      "TURSO_API_TOKEN is required (a Platform API token, not a database token): turso auth api-tokens mint turso-stats --org <org> --read-only — then add it to /workspaces/.dev/.env (local) or as a secret (CI).",
    );
  }
  const { org, names } = resolveDatabases();
  const { from, elapsed } = monthWindow();
  const limits = {
    rows_read: Number(env("TURSO_READS_LIMIT") ?? DEFAULT_LIMITS.rows_read),
    rows_written: Number(env("TURSO_WRITES_LIMIT") ?? DEFAULT_LIMITS.rows_written),
  };

  const orgUsage = await api<unknown>(token, `/organizations/${org}/usage`);
  const databases = await Promise.all(
    names.map(async (name) => {
      const [usage, stats] = await Promise.all([
        api<{ database: { total: Usage } }>(
          token,
          `/organizations/${org}/databases/${name}/usage?from=${encodeURIComponent(from.toISOString())}`,
        ),
        api<{ top_queries?: TopQuery[] }>(token, `/organizations/${org}/databases/${name}/stats`),
      ]);
      // A fresh copy, so sorting in place is safe — toSorted() needs ES2023,
      // past this repo's lib target (same as turso-client.ts).
      const topQueries = [...(stats.top_queries ?? [])];
      // eslint-disable-next-line unicorn/no-array-sort
      topQueries.sort((a, b) => b.rows_read + b.rows_written - (a.rows_read + a.rows_written));
      return { name, total: usage.database.total, topQueries: topQueries.slice(0, topCount) };
    }),
  );

  // Quotas are org-wide: every database's usage counts against the same
  // monthly allowance.
  const quotas = (["rows_read", "rows_written"] as const).map((metric) => {
    const used = databases.reduce((sum, db) => sum + (db.total[metric] ?? 0), 0);
    const limit = limits[metric];
    const percent = (100 * used) / limit;
    const projected = elapsed > 0 ? percent / elapsed : 0;
    const overThreshold = threshold !== undefined && percent >= threshold;
    const projectedOver =
      threshold !== undefined && elapsed >= MIN_ELAPSED_FOR_PROJECTION && projected >= 100;
    return { metric, used, limit, percent, projected, alert: overThreshold || projectedOver };
  });
  const alert = quotas.some((quota) => quota.alert);

  if (asJson) {
    console.log(
      JSON.stringify({ org, monthElapsed: elapsed, quotas, databases, orgUsage }, null, 2),
    );
  } else {
    console.log(
      `Turso org "${org}" — ${from.toISOString().slice(0, 7)}, ${Math.round(elapsed * 100)}% of the month elapsed${threshold === undefined ? "" : `, alert at ${threshold}%`}`,
    );
    for (const quota of quotas) {
      const projection =
        elapsed >= MIN_ELAPSED_FOR_PROJECTION
          ? `, on track for ${Math.round(quota.projected)}% by month end`
          : "";
      console.log(
        `  ${quota.alert ? "ALERT" : "ok   "} ${quota.metric.padEnd(13)} ${human(quota.used).padStart(8)} / ${human(quota.limit)} (${quota.percent.toFixed(1)}%${projection})`,
      );
    }
    for (const db of databases) {
      console.log(
        `\n  ${db.name}: ${human(db.total.rows_read)} rows read, ${human(db.total.rows_written)} written, ${human(db.total.storage_bytes)}B stored`,
      );
      for (const query of db.topQueries) {
        const sql = query.query.replaceAll(/\s+/g, " ").slice(0, 110);
        console.log(
          `    ${human(query.rows_read).padStart(8)} read ${human(query.rows_written).padStart(8)} written  ${sql}`,
        );
      }
    }
  }

  if (alert) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
