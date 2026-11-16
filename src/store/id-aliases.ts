import { chunk } from "helpers4/array";
import type { Client, InStatement } from "@libsql/client";

// Old app ids and the current id each one now redirects to.
//
// An app's id (`/app/<id>/` in `app`) is picked from its packages (curator's
// `buildAppId`), so it changes when its group does: a group gains a Snap or
// Flatpak package and takes that package's id, a package is renamed
// upstream, two groups merge and one id goes, the matcher splits a group.
// Links and search results pointing at the old id must keep working, so a
// publish records, for every id that leaves the catalog, where its packages
// went, and `app` answers a request for it with a permanent redirect.
//
// An alias keeps the package keys the old app had, the one that named it
// first, rather than only its target: every publish resolves each alias
// again against the new dataset, so an alias follows its packages through
// any number of later renames and merges (A became B, then B became C: A
// leads to C) and survives its target leaving the catalog as long as one
// of its packages is still listed somewhere.

export const ID_ALIASES_TABLE_SQL = `CREATE TABLE IF NOT EXISTS id_aliases (
  alias TEXT PRIMARY KEY,
  target TEXT NOT NULL,
  packages_json TEXT NOT NULL
)`;

/** Ids per `WHERE id IN (...)` read. */
const READ_BATCH_SIZE = 200;
/** Statements per `db.batch()` round trip. */
const WRITE_BATCH_SIZE = 500;

interface PackageRef {
  source: string;
  name: string;
  appId?: string;
}

function asPackageRef(pkg: unknown): PackageRef | undefined {
  if (typeof pkg !== "object" || pkg === null) return undefined;
  const { source, name, appId } = pkg as Record<string, unknown>;
  if (typeof source !== "string" || typeof name !== "string") return undefined;
  return { source, name, appId: typeof appId === "string" ? appId : undefined };
}

/** A package's identity across datasets: curator's `packageKey`, `source:appId` or `source:name`. */
export function packageKey(pkg: PackageRef): string {
  return `${pkg.source}:${pkg.appId ?? pkg.name}`;
}

/**
 * The id a group takes when this package names it: curator's
 * `standaloneAppId`, mirrored here since the store depends on no other
 * module. Used only to find which of an old app's packages its id came from.
 */
function namingId(pkg: PackageRef): string {
  if (pkg.source === "snap-snapcraft") return pkg.appId ?? pkg.name;
  if ((pkg.source === "flatpak-flathub" || pkg.source === "flatpak-appcenter") && pkg.appId) {
    return pkg.appId;
  }
  return `${pkg.source}:${(pkg.appId ?? pkg.name).replaceAll("/", ":")}`;
}

function companionPackages(companion: unknown): readonly unknown[] {
  if (typeof companion !== "object" || companion === null) return [];
  const { packages } = companion as { packages?: unknown };
  return Array.isArray(packages) ? packages : [];
}

/**
 * Each package key of the dataset to the app whose page lists it: the app
 * it belongs to, else the product listing it as a companion (an app that
 * became a plugin of another lives on as a line of that product's page).
 * The first app wins, should two list one package.
 */
export function packageOwners(
  apps: ReadonlyArray<{
    id: string;
    packages: readonly unknown[];
    companions?: readonly unknown[];
  }>,
): Map<string, string> {
  const owners = new Map<string, string>();
  const own = (id: string, packages: readonly unknown[]): void => {
    for (const pkg of packages) {
      const ref = asPackageRef(pkg);
      if (!ref) continue;
      const key = packageKey(ref);
      if (!owners.has(key)) owners.set(key, id);
    }
  };
  for (const app of apps) own(app.id, app.packages);
  for (const app of apps) {
    for (const companion of app.companions ?? []) own(app.id, companionPackages(companion));
  }
  return owners;
}

/**
 * The package keys an alias for `id` keeps: the package its id came from
 * first, then the others in their order, without repeats.
 */
export function aliasPackageKeys(id: string, packages: readonly unknown[]): string[] {
  const refs = packages.flatMap((pkg) => asPackageRef(pkg) ?? []);
  const naming = refs.find((ref) => namingId(ref) === id);
  const keys = [...(naming ? [packageKey(naming)] : []), ...refs.map(packageKey)];
  return [...new Set(keys)];
}

/**
 * Where an alias leads in a dataset: the app now listing the package the
 * old id came from (`keys[0]`, see `aliasPackageKeys`) — a split keeps the
 * URL on the half that kept its name — else the app listing most of its
 * other packages (the first of them on a tie), else nowhere.
 */
export function resolveAlias(
  keys: readonly string[],
  owners: ReadonlyMap<string, string>,
): string | undefined {
  const first = keys[0] === undefined ? undefined : owners.get(keys[0]);
  if (first !== undefined) return first;
  const votes = new Map<string, number>();
  for (const key of keys) {
    const owner = owners.get(key);
    if (owner !== undefined) votes.set(owner, (votes.get(owner) ?? 0) + 1);
  }
  let best: string | undefined;
  for (const [owner, count] of votes) {
    if (best === undefined || count > (votes.get(best) ?? 0)) best = owner;
  }
  return best;
}

export interface IdAlias {
  target: string;
  /** See `aliasPackageKeys`. */
  packageKeys: string[];
}

/**
 * Every alias a dataset should leave: the live ones and one per app that
 * left the catalog (`vanished`), each resolved again against the dataset
 * (`owners`, see `resolveAlias`). An alias for an id the dataset lists
 * again is dropped (its own page answers), so is one none of whose
 * packages the dataset still lists, or one that would lead to itself.
 */
export function nextAliases(
  live: ReadonlyMap<string, IdAlias>,
  vanished: ReadonlyArray<{ id: string; packages: readonly unknown[] }>,
  owners: ReadonlyMap<string, string>,
  datasetIds: ReadonlySet<string>,
): Map<string, IdAlias> {
  const keysByAlias = new Map<string, string[]>();
  for (const [alias, { packageKeys }] of live) keysByAlias.set(alias, packageKeys);
  // A vanished app's packages describe it as it last was: they replace
  // whatever an older alias for the same id kept.
  for (const app of vanished) keysByAlias.set(app.id, aliasPackageKeys(app.id, app.packages));

  const next = new Map<string, IdAlias>();
  for (const [alias, packageKeys] of keysByAlias) {
    if (datasetIds.has(alias)) continue;
    const target = resolveAlias(packageKeys, owners);
    if (target === undefined || target === alias) continue;
    next.set(alias, { target, packageKeys });
  }
  return next;
}

/** What a publish did to the aliases. */
export interface AliasReport {
  /** Aliases for ids that left the catalog in this publish. */
  added: number;
  /** Live aliases now leading somewhere else. */
  repointed: number;
  /** Live aliases removed: the id is listed again, or none of its packages is. */
  dropped: number;
  /** Aliases after the publish. */
  total: number;
}

/** Every live alias. A store published before aliases existed has none. */
export async function readAliases(db: Client): Promise<Map<string, IdAlias>> {
  await db.execute(ID_ALIASES_TABLE_SQL);
  const result = await db.execute(`SELECT alias, target, packages_json FROM id_aliases`);
  return new Map(
    result.rows.map((row) => [
      String(row.alias),
      {
        target: String(row.target),
        packageKeys: JSON.parse(String(row.packages_json)) as string[],
      },
    ]),
  );
}

/** Each of `ids`' stored packages, read from the live `apps` table before they are deleted. */
export async function readVanishedApps(
  db: Client,
  ids: readonly string[],
): Promise<Array<{ id: string; packages: unknown[] }>> {
  const apps: Array<{ id: string; packages: unknown[] }> = [];
  for (const part of chunk([...ids], READ_BATCH_SIZE)) {
    // eslint-disable-next-line no-await-in-loop
    const result = await db.execute({
      sql: `SELECT id, packages_json FROM apps WHERE id IN (${part.map(() => "?").join(", ")})`,
      args: part,
    });
    for (const row of result.rows) {
      apps.push({
        id: String(row.id),
        packages: JSON.parse(String(row.packages_json)) as unknown[],
      });
    }
  }
  return apps;
}

/**
 * Brings `id_aliases` to what `nextAliases` computes, writing only the rows
 * that differ. Runs before the publish deletes anything from `apps`: a
 * publish that dies half way has then either recorded the aliases or not
 * deleted their apps yet, and the next one finds them again.
 */
export async function updateAliases(
  db: Client,
  vanishedIds: readonly string[],
  owners: ReadonlyMap<string, string>,
  datasetIds: ReadonlySet<string>,
): Promise<AliasReport> {
  const live = await readAliases(db);
  const vanished = await readVanishedApps(db, vanishedIds);
  const next = nextAliases(live, vanished, owners, datasetIds);

  const report: AliasReport = { added: 0, repointed: 0, dropped: 0, total: next.size };
  const statements: InStatement[] = [];
  for (const [alias, { target, packageKeys }] of next) {
    const before = live.get(alias);
    const packagesJson = JSON.stringify(packageKeys);
    if (before?.target === target && JSON.stringify(before.packageKeys) === packagesJson) continue;
    if (before === undefined) report.added += 1;
    else if (before.target !== target) report.repointed += 1;
    statements.push({
      sql: `INSERT INTO id_aliases (alias, target, packages_json) VALUES (?, ?, ?)
            ON CONFLICT(alias) DO UPDATE SET target = excluded.target, packages_json = excluded.packages_json`,
      args: [alias, target, packagesJson],
    });
  }
  for (const alias of live.keys()) {
    if (next.has(alias)) continue;
    report.dropped += 1;
    statements.push({ sql: `DELETE FROM id_aliases WHERE alias = ?`, args: [alias] });
  }
  for (const part of chunk(statements, WRITE_BATCH_SIZE)) {
    // eslint-disable-next-line no-await-in-loop
    await db.batch(part, "write");
  }
  return report;
}
