import { PREVIEW_ENV_PATH, PROD_ENV_PATH, SHARED_ENV_PATH, readSharedEnv } from "./_shared-env";

/**
 * `pnpm turso-stats`: the Turso org's usage for the current billing month
 * against its plan's quotas, per database, and a non-zero exit when usage
 * crosses a threshold — so a scheduled workflow can alert before Turso
 * hard-blocks the database.
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
 * What it reads (Turso Platform API, verified live 2026-10-01): the org's
 * `subscription` (plan name + billing period), the plan's `quotas` from
 * `plans`, and each database's `usage`. Not available through the API: a
 * per-query breakdown (the documented `/stats` route returns 404) — that
 * only exists in the CLI (`turso db inspect <db> --queries`, interactive
 * login), so finding *which* query is expensive stays a manual step.
 *
 * Credentials: a Turso Platform API token (`TURSO_API_TOKEN`), not the
 * per-database auth tokens the app uses — those can query a database but
 * can't read usage. Mint one scoped to the org and read-only:
 *   turso auth api-tokens mint turso-stats --org <org> --read-only
 * Locally it's read from /workspaces/.dev/.env; in CI from a secret.
 * Databases come from the same TURSO_DB_URLs `pnpm seed --preview/--prod`
 * uses (PREVIEW_/PROD_TURSO_DB_URL in CI); the org slug is derived from
 * them (`libsql://<db>-<org>.…`) unless TURSO_ORG is set.
 */

const API = "https://api.turso.tech/v1";

// Before this share of the billing period has elapsed, the end-of-month projection
// is too noisy to alert on (a busy first morning extrapolates wildly).
const MIN_ELAPSED_FOR_PROJECTION = 0.1;

interface Usage {
  rows_read: number;
  rows_written: number;
  storage_bytes: number;
}

interface PlanQuotas {
  rowsRead: number;
  rowsWritten: number;
  storage: number;
}

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const threshold = flag("--threshold") === undefined ? undefined : Number(flag("--threshold"));
const asJson = process.argv.includes("--json");

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

/** Where `now` sits in the plan's billing period (not the calendar month: Turso's runs from the 1st at 04:00 UTC). */
function periodElapsed(start: string, end: string, now = Date.now()): number {
  const from = Date.parse(start);
  return (now - from) / (Date.parse(end) - from);
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

  const [subscriptionResponse, plansResponse, orgResponse] = await Promise.all([
    api<{
      subscription: {
        plan: string;
        current_billing_period_start: string;
        current_billing_period_end: string;
      };
    }>(token, `/organizations/${org}/subscription`),
    api<{ plans: { name: string; quotas: PlanQuotas }[] }>(token, `/organizations/${org}/plans`),
    api<{ organization: { blocked_reads: boolean; blocked_writes: boolean } }>(
      token,
      `/organizations/${org}`,
    ),
  ]);
  const {
    plan,
    current_billing_period_start: periodStart,
    current_billing_period_end: periodEnd,
  } = subscriptionResponse.subscription;
  const quotasOfPlan = plansResponse.plans.find((candidate) => candidate.name === plan)?.quotas;
  if (!quotasOfPlan) throw new Error(`Plan "${plan}" not found in the org's plan list.`);
  const { blocked_reads: blockedReads, blocked_writes: blockedWrites } = orgResponse.organization;
  const elapsed = periodElapsed(periodStart, periodEnd);

  const databases = await Promise.all(
    names.map(async (name) => {
      const usage = await api<{ total: Usage }>(
        token,
        `/organizations/${org}/databases/${name}/usage?from=${encodeURIComponent(periodStart)}`,
      );
      return { name, total: usage.total };
    }),
  );

  // Quotas are org-wide: every database's usage counts against the same
  // allowance. Storage isn't projected — it doesn't reset each period.
  const metrics = [
    { metric: "rows_read", limit: quotasOfPlan.rowsRead, projects: true },
    { metric: "rows_written", limit: quotasOfPlan.rowsWritten, projects: true },
    { metric: "storage_bytes", limit: quotasOfPlan.storage, projects: false },
  ] as const;
  const quotas = metrics.map(({ metric, limit, projects }) => {
    const used = databases.reduce((sum, db) => sum + (db.total[metric] ?? 0), 0);
    const percent = (100 * used) / limit;
    const projected = elapsed > 0 ? percent / elapsed : 0;
    const overThreshold = threshold !== undefined && percent >= threshold;
    const projectedOver =
      projects &&
      threshold !== undefined &&
      elapsed >= MIN_ELAPSED_FOR_PROJECTION &&
      projected >= 100;
    return {
      metric,
      used,
      limit,
      percent,
      projected,
      projects,
      alert: overThreshold || projectedOver,
    };
  });
  // Already hard-blocked is the worst case, whatever the percentages say.
  const alert = blockedReads || blockedWrites || quotas.some((quota) => quota.alert);

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          org,
          plan,
          periodStart,
          periodEnd,
          elapsed,
          blockedReads,
          blockedWrites,
          quotas,
          databases,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(
      `Turso org "${org}" (${plan} plan) — billing period ${periodStart.slice(0, 10)} → ${periodEnd.slice(0, 10)}, ${Math.round(elapsed * 100)}% elapsed${threshold === undefined ? "" : `, alert at ${threshold}%`}`,
    );
    if (blockedReads || blockedWrites) {
      console.log(
        `  ALERT database access is BLOCKED by Turso: reads ${blockedReads ? "blocked" : "ok"}, writes ${blockedWrites ? "blocked" : "ok"}`,
      );
    }
    for (const quota of quotas) {
      const unit = quota.metric === "storage_bytes" ? "B" : "";
      const projection =
        quota.projects && elapsed >= MIN_ELAPSED_FOR_PROJECTION
          ? `, on track for ${Math.round(quota.projected)}% by period end`
          : "";
      console.log(
        `  ${quota.alert ? "ALERT" : "ok   "} ${quota.metric.padEnd(13)} ${(human(quota.used) + unit).padStart(9)} / ${human(quota.limit)}${unit} (${quota.percent.toFixed(1)}%${projection})`,
      );
    }
    for (const db of databases) {
      console.log(
        `  ${db.name.padEnd(8)} ${human(db.total.rows_read)} read, ${human(db.total.rows_written)} written, ${human(db.total.storage_bytes)}B stored`,
      );
    }
  }

  if (alert) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
