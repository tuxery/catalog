import { existsSync, readFileSync } from "node:fs";

// Credential files shared by every repo in the devcontainer, never
// committed: one per Turso environment ("preview" backs Cloudflare's
// preview Worker, "prod" the production one), plus the base `.env` for
// everything that isn't per-environment. Only exist locally; CI has no
// such files and gets the same values as GitHub Actions secrets in
// `process.env` instead.
export const SHARED_ENV_PATH = "/workspaces/.dev/.env";
export const PREVIEW_ENV_PATH = "/workspaces/.dev/.env.preview";
export const PROD_ENV_PATH = "/workspaces/.dev/.env.prod";

/** Parses a `KEY=value` env file (blank lines and `#` comments skipped); a missing file reads as empty. */
export function readSharedEnv(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const env: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return env;
}
