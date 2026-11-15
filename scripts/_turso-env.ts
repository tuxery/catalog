// Credentials for the two hosted Turso databases (`pnpm seed --preview` /
// `--prod`, `pnpm turso-stats`), read from the environment only:
// - in the devcontainer, openbao-env loads them from OpenBao
//   (kv/orgs/tuxery) under the same names as the GitHub Actions secrets,
//   PREVIEW_TURSO_DB_URL/_AUTH_TOKEN and PROD_TURSO_DB_URL/_AUTH_TOKEN;
// - a CI job passes the unprefixed TURSO_DB_URL/TURSO_DB_AUTH_TOKEN of the
//   one database it publishes to.
// Never an unprefixed TURSO_DB_URL in the devcontainer: `app`'s `pnpm dev`
// would then talk to a hosted database instead of the local one.

export type TursoTarget = "preview" | "prod";

export interface TursoCredentials {
  url?: string;
  authToken?: string;
}

/** The URL and token for `target`: its prefixed pair if set, else the unprefixed pair (CI). */
export function tursoCredentials(
  target: TursoTarget,
  env: Record<string, string | undefined> = process.env,
): TursoCredentials {
  const prefix = target === "prod" ? "PROD" : "PREVIEW";
  const url = env[`${prefix}_TURSO_DB_URL`];
  if (url) return { url, authToken: env[`${prefix}_TURSO_DB_AUTH_TOKEN`] };
  return { url: env.TURSO_DB_URL, authToken: env.TURSO_DB_AUTH_TOKEN };
}
