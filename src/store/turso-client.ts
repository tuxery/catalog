import { chunk } from "helpers4/array";
import { delay } from "helpers4/promise";
import { createClient, type Client } from "@libsql/client";

/**
 * A published app record — structurally compatible with the curator module's
 * `CatalogApp`, kept local so this package has no dependency on curator's
 * types (mirrors the app/catalog split already used elsewhere: no shared
 * import, callers just need to match the shape).
 */
export interface AppRecord {
  id: string;
  name: string;
  shortDescription: string;
  longDescription?: string;
  homepage?: string;
  /** "gui" when at least one source package has positive evidence of a launchable GUI app — see `CatalogApp.kind`'s doc comment for how narrow this signal still is. */
  kind?: "gui";
  /** "game" when at least one source package has positive evidence of being a game — see `CatalogApp.contentType`'s doc comment. */
  contentType?: "game";
  /** `true` for known app-store/package-manager frontends (GNOME Software, KDE Discover, ...) — see `CatalogApp.appStoreFrontend`'s doc comment. */
  appStoreFrontend?: boolean;
  category?: string;
  developer?: string;
  publisher?: string;
  license?: string;
  iconUrl?: string;
  approxSizeBytes?: number;
  changelog?: string;
  requirements?: string;
  /** The most recent release date across member packages, when at least one has one — see `CatalogApp.lastUpdated`'s doc comment. */
  lastUpdated?: string;
  rating?: { average: number; count: number };
  /** Trending/popularity signal (0-1), when at least one source has one — see `CatalogApp.popularity`'s doc comment. */
  popularity?: number;
  aiFeatures?: boolean;
  inAppPurchases?: boolean;
  gdprCompliant?: boolean;
  ageRating?: { system: string; value: string };
  languages?: string[];
  screenshots?: string[];
  videos?: string[];
  reviews?: Array<{ author: string; text: string; rating: number }>;
  features?: string[];
  permissions?: string[];
  editorialTags?: string[];
  /** Upstream store collections this app appears in (Flathub's verified/recently-added/recently-updated, Snapcraft's featured) — see `CatalogApp.storeCollections`'s doc comment. Distinct from `editorialTags` above (Tuxery's own manual curation). */
  storeCollections?: string[];
  /** Lifetime + last-7-day install counts (Flathub's own stats API today) — see `CatalogApp.installsTotal`/`installsLast7Days` doc comments. */
  installsTotal?: number;
  installsLast7Days?: number;
  /** Software-suite membership (a bundled "main" app plus its separately-installable "component" apps) — see `CatalogApp.suite`'s doc comment. */
  suite?: {
    id: string;
    name: string;
    role: "main" | "component";
    components?: { id: string; name: string }[];
    mainApp?: { id: string; name: string };
  };
  /** Known packaging-format compatibility issues, each scoped to the one source it affects — see `CatalogApp.compatibilityWarnings`'s doc comment. */
  compatibilityWarnings?: {
    source: string;
    severity: "warning" | "info";
    issue: string;
    fix?: string;
  }[];
  /** Deterministic data-confidence signals (name/license agreement across sources, a manual match-force verification) — see `CatalogApp.dataConfidence`'s doc comment. Always present, same "empty signals, not an absent field" discipline. */
  dataConfidence: {
    score: number;
    signals: Array<{ signal: string; delta: number; detail: string }>;
  };
  packages: unknown[];
}

export interface TursoDataset {
  generatedAt: string;
  apps: AppRecord[];
}

export interface TursoConfig {
  /** A `libsql://...` URL for the real hosted DB, `http://127.0.0.1:8080` for a local `turso dev` server, or `file:...` for a local file (Node only). */
  url: string;
  authToken?: string;
}

export interface TursoClient {
  publish(dataset: TursoDataset): Promise<void>;
}

const BATCH_SIZE = 500;

const INSERT_COLUMNS = [
  "id",
  "name",
  "short_description",
  "long_description",
  "homepage",
  "kind",
  "content_type",
  "app_store_frontend",
  "category",
  "developer",
  "publisher",
  "license",
  "icon_url",
  "approx_size_bytes",
  "changelog",
  "requirements",
  "last_updated",
  "rating_average",
  "rating_count",
  "popularity",
  "ai_features",
  "in_app_purchases",
  "gdpr_compliant",
  "age_rating_system",
  "age_rating_value",
  "languages_json",
  "screenshots_json",
  "videos_json",
  "reviews_json",
  "features_json",
  "permissions_json",
  "editorial_tags_json",
  "store_collections_json",
  "installs_total",
  "installs_last_7_days",
  "suite_json",
  "compat_warnings_json",
  "data_confidence_json",
  "packages_json",
];

function appsTableSql(tableName: string): string {
  return `
    CREATE TABLE ${tableName} (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      short_description TEXT NOT NULL,
      long_description TEXT,
      homepage TEXT,
      kind TEXT,
      content_type TEXT,
      app_store_frontend INTEGER,
      category TEXT,
      developer TEXT,
      publisher TEXT,
      license TEXT,
      icon_url TEXT,
      approx_size_bytes INTEGER,
      changelog TEXT,
      requirements TEXT,
      last_updated TEXT,
      rating_average REAL,
      rating_count INTEGER,
      popularity REAL,
      ai_features INTEGER,
      in_app_purchases INTEGER,
      gdpr_compliant INTEGER,
      age_rating_system TEXT,
      age_rating_value TEXT,
      languages_json TEXT,
      screenshots_json TEXT,
      videos_json TEXT,
      reviews_json TEXT,
      features_json TEXT,
      permissions_json TEXT,
      editorial_tags_json TEXT,
      store_collections_json TEXT,
      installs_total INTEGER,
      installs_last_7_days INTEGER,
      suite_json TEXT,
      compat_warnings_json TEXT,
      data_confidence_json TEXT NOT NULL,
      packages_json TEXT NOT NULL
    )
  `;
}

// Every column `app`'s catalog.ts filters or sorts by at request time —
// without these, SQLite/libSQL has no way to satisfy any of
// browseApps/getCategories/getTrendingApps/getNewApps/
// getDownloadTrendingApps/getAppsByCategory except by scanning the ENTIRE
// `apps` table (168k+ rows) on every single call, since the table
// otherwise has no index beyond the implicit one on `id`. Real incident,
// found live 2026-09-03: this exact gap burned through Turso's 500M-row
// monthly read quota in 3 days across prod+dev — a single homepage load
// fires ~13 of these queries (getTrendingApps x2, getNewApps,
// getDownloadTrendingApps, getCategories x2, getAppsByCategory x7), each
// a full-table scan, so a few dozen page loads a day was enough. Indexed
// on the finished `apps` table right after the atomic rename swap below
// (not per-row during the bulk insert — building an index once over
// finished data is far cheaper than maintaining it across
// `INSERT_COLUMNS.length` rows one at a time), and specifically AFTER
// the swap rather than on `apps_next` before it: index names are global
// to the whole database in SQLite, not scoped per table, so building
// them on `apps_next` while the previous run's same-named indexes are
// still attached to the live `apps` table collides ("index ... already
// exists") on every publish after the first — real failure, found live
// 2026-09-03 when CI's second publish to preview hit exactly this.
// Building them after `apps_old` (carrying the stale names) is dropped
// in the same swap batch frees the names up first. Composite
// `(content_type, category)` covers
// `getCategories`'s `WHERE content_type = ? GROUP BY category` and
// `browseApps`'s combined content_type+category filter directly; the
// single-column ones cover every other WHERE/ORDER BY column on its own.
// Deliberately NOT indexing `packages_json` (the `source` filter's
// `LIKE '%"source":"..."%'` can't use a b-tree index at all with a
// leading wildcard) — that filter is scoped to the much lower-traffic
// `/sources/[id]/` pages, not the homepage hot path that caused this.
const APPS_INDEXES_SQL = [
  `CREATE INDEX idx_apps_category ON apps(category)`,
  `CREATE INDEX idx_apps_content_type ON apps(content_type)`,
  `CREATE INDEX idx_apps_content_type_category ON apps(content_type, category)`,
  `CREATE INDEX idx_apps_popularity ON apps(popularity)`,
  `CREATE INDEX idx_apps_last_updated ON apps(last_updated)`,
  `CREATE INDEX idx_apps_installs_last_7_days ON apps(installs_last_7_days)`,
  // browseApps's unfiltered default listing (`ORDER BY name ASC`, no
  // WHERE at all) had no index to satisfy that sort with — real cost,
  // found live via the Turso dashboard's query stats 2026-09-04: a single
  // unfiltered browse page paid a full ~168k-row scan-and-sort. Same class
  // of gap as the original six, just missed the first time because `name`
  // never appears in a WHERE clause, only ORDER BY.
  `CREATE INDEX idx_apps_name ON apps(name)`,
  // `kind` never got one of the original six either — `browseApps`'s
  // `interfaceFilter: "gui"` (`WHERE kind = 'gui'`) has been a full scan
  // since day one, just lower-traffic than the homepage queries that
  // triggered the 2026-09-03 incident so it didn't show up in that
  // investigation.
  `CREATE INDEX idx_apps_kind ON apps(kind)`,
  // Composites for getTrendingApps/getNewApps/getDownloadTrendingApps's
  // exact `WHERE <col> IS NOT NULL [AND content_type = ?] ORDER BY <col>
  // DESC` shape — without these, a typeFilter'd trending query resolves
  // the content_type half via idx_apps_content_type but still pays for a
  // temp B-tree sort on the filtered rows (verified live via EXPLAIN
  // QUERY PLAN, 2026-09-03, right after applying the six indexes above
  // directly to prod: already a massive improvement over a full scan,
  // but not fully index-order for these three). Free to add — pure DDL,
  // no runtime cost beyond a slightly larger table on disk, and this
  // repo just got burned once on "good enough" leaving read amplification
  // on the table, so closing the gap all the way rather than leaving it
  // partial.
  `CREATE INDEX idx_apps_content_type_popularity ON apps(content_type, popularity)`,
  `CREATE INDEX idx_apps_content_type_last_updated ON apps(content_type, last_updated)`,
  `CREATE INDEX idx_apps_content_type_installs_last_7_days ON apps(content_type, installs_last_7_days)`,
  // `getAppsByCategory`'s `WHERE category = ? ORDER BY popularity ... DESC`
  // shape — `idx_apps_category` alone resolves the filter but still pays
  // for a temp B-tree sort of every row in that category before LIMIT can
  // trim it. Found live in Turso's own query stats after the read quota
  // was fully exhausted 2026-09-11: this exact query averaged ~1,940 rows
  // read per call (one category's worth) across 177 calls — the single
  // biggest per-call gap left after the 2026-09-03/04 index rounds, which
  // covered every other WHERE/ORDER BY combination but missed this one
  // since `category` and `popularity` never appeared together before.
  `CREATE INDEX idx_apps_category_popularity ON apps(category, popularity)`,
];

interface CategoryCount {
  category: string;
  count: number;
}

/**
 * Counts apps per category, highest first — mirrors `app`'s `getCategories`
 * SQL (`GROUP BY category ORDER BY count DESC`) exactly, computed here in
 * memory from the same `dataset.apps` already being written, rather than
 * making `app` re-derive it with a live `COUNT(*)` query. That query was
 * effectively a full-table scan under `typeFilter: "app"` (`WHERE
 * content_type IS NULL` matches nearly the entire catalog, so the index
 * barely narrows it) — found live in Turso's query stats as the single
 * largest read cost by far once the quota was fully exhausted 2026-09-11:
 * ~165,600 rows read per call, 4.14M rows for just 25 calls in one sample
 * window. `getStats` already reads its totals from `meta` instead of
 * `COUNT(*)`-ing `apps` at request time (see its own doc comment) —
 * `getCategories` just never got the same treatment when it was added.
 */
function countByCategory(apps: AppRecord[]): CategoryCount[] {
  const counts = new Map<string, number>();
  for (const app of apps) {
    const category = app.category ?? "";
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  const result = [...counts.entries()].map(([category, count]) => ({ category, count }));
  // A freshly built local array, not aliased anywhere else — safe to sort
  // in place. `toSorted()` (no-array-sort's suggested fix) needs ES2023,
  // this repo targets ES2022 (tsconfig.json's `lib`).
  // eslint-disable-next-line unicorn/no-array-sort
  result.sort((a, b) => b.count - a.count);
  return result;
}

// Mirrors `app`'s `TRENDING_PAGE_SIZE`/`CATEGORY_PREVIEW_SIZE` (src/catalog.ts)
// — kept in sync by hand, like every other cross-repo constant this
// incident's fixes reference (no shared package between `catalog` and `app`).
const TRENDING_PAGE_SIZE = 60;
const CATEGORY_PREVIEW_SIZE = 12;

type ListingTypeFilter = "all" | "game" | "app";

// icon_url only, not screenshots too — real bug in `app`'s side (the
// previous home of this filter, before these listings moved here), found
// live once the homepage's Trending row split into per-type (games/apps)
// rows: `AppCard` has no `screenshots` prop and never renders one, so a
// screenshot-only app admitted by a broader "has *some* visual asset"
// filter rendered as a bare placeholder-icon card anyway — the exact
// thing the filter was supposed to prevent. Verified live: 1,386 of the
// 21,844 popularity-scored apps have a real icon (mostly AUR's own
// usage-frequency signal, a source with no icon data at all) — still
// comfortably enough for every trending bucket and every homepage
// category row.
function hasVisualAsset(app: AppRecord): boolean {
  return app.iconUrl !== undefined;
}

function matchesTypeFilter(app: AppRecord, typeFilter: ListingTypeFilter): boolean {
  if (typeFilter === "game") return app.contentType === "game";
  if (typeFilter === "app") return app.contentType !== "game";
  return true;
}

function hasPackageFromSource(app: AppRecord, source: string): boolean {
  return app.packages.some((pkg) => (pkg as { source?: unknown }).source === source);
}

/** Every category actually present in this dataset — no import of curator's closed label lists needed, and self-maintaining if that list ever changes. */
function distinctCategories(apps: AppRecord[]): string[] {
  return [
    ...new Set(apps.map((app) => app.category).filter((category): category is string => category !== undefined)),
  ];
}

/** Every source actually present in this dataset's packages — same "derive from data, don't import/duplicate the enum" reasoning as `distinctCategories`. */
function distinctSources(apps: AppRecord[]): string[] {
  const sources = new Set<string>();
  for (const app of apps) {
    for (const pkg of app.packages) {
      const source = (pkg as { source?: unknown }).source;
      if (typeof source === "string") sources.add(source);
    }
  }
  return [...sources];
}

function sortInPlace<T>(items: T[], compare: (a: T, b: T) => number): T[] {
  // A freshly filtered array (Array#filter always returns a new one, never
  // aliased elsewhere), safe to sort in place — toSorted() needs ES2023,
  // this repo targets ES2022 (same reasoning as `countByCategory` above).
  // eslint-disable-next-line unicorn/no-array-sort
  items.sort(compare);
  return items;
}

function topIds(
  apps: AppRecord[],
  predicate: (app: AppRecord) => boolean,
  compare: (a: AppRecord, b: AppRecord) => number,
  limit: number,
): string[] {
  return sortInPlace(apps.filter(predicate), compare)
    .slice(0, limit)
    .map((app) => app.id);
}

function byPopularityDesc(a: AppRecord, b: AppRecord): number {
  return (b.popularity ?? 0) - (a.popularity ?? 0);
}

function byLastUpdatedDesc(a: AppRecord, b: AppRecord): number {
  const aValue = a.lastUpdated ?? "";
  const bValue = b.lastUpdated ?? "";
  return aValue === bValue ? 0 : aValue < bValue ? 1 : -1;
}

function byInstallsLast7DaysDesc(a: AppRecord, b: AppRecord): number {
  return (b.installsLast7Days ?? 0) - (a.installsLast7Days ?? 0);
}

// Mirrors app's `getAppsByCategory` ORDER BY `popularity IS NULL, popularity
// DESC, name ASC` — unscored apps sort last rather than being excluded, so
// every category still shows something even with zero scored apps in it.
function byCategoryPreviewOrder(a: AppRecord, b: AppRecord): number {
  const aScored = a.popularity !== undefined;
  const bScored = b.popularity !== undefined;
  if (aScored !== bScored) return aScored ? -1 : 1;
  if (aScored && bScored && a.popularity !== b.popularity) {
    return (b.popularity as number) - (a.popularity as number);
  }
  return a.name === b.name ? 0 : a.name < b.name ? -1 : 1;
}

/**
 * Precomputes every bounded "listing" query `app`'s catalog.ts used to run
 * live at request time — trending/new/download-trending (3 `typeFilter`
 * variants each), per-category previews (one per real category, ~27
 * today), and per-source trending (one per source actually present in
 * this dataset, ~25 today). Each has a small, closed parameter space that
 * only changes when this dataset republishes (manual, infrequent) — the
 * same "precompute once here instead of aggregating live on every
 * request" fix as `countByCategory` above, extended to the rest of the
 * homepage's query set once `getCategories` (by far the largest cost)
 * proved the pattern live in Turso's query stats 2026-09-11. Second
 * largest cost in that same report, `getAppsByCategory`, is included here
 * too — `idx_apps_category_popularity` above already fixed its per-call
 * cost, but eliminating it outright is strictly better than reducing it.
 *
 * Stores an ordered array of app ids per key, not full `AppSummary`
 * objects — the parts of `AppSummary` derived from the full `packages`
 * array (`ratingsBySource`/`channels`/`verifiedSources`) stay in `app`'s
 * own `toSummary()`, not duplicated here across repos. `app` resolves
 * whichever ids this returns via a small, bounded `SELECT ... WHERE id IN
 * (...)` — a PK lookup, already cheap regardless of table size, same as
 * the existing `getAppsByIds`.
 */
function computeListingIds(apps: AppRecord[]): Record<string, string[]> {
  const typeFilters: ListingTypeFilter[] = ["all", "game", "app"];
  const ids: Record<string, string[]> = {};

  for (const typeFilter of typeFilters) {
    ids[`trending:${typeFilter}`] = topIds(
      apps,
      (app) => app.popularity !== undefined && hasVisualAsset(app) && matchesTypeFilter(app, typeFilter),
      byPopularityDesc,
      TRENDING_PAGE_SIZE,
    );
    ids[`newApps:${typeFilter}`] = topIds(
      apps,
      (app) => app.lastUpdated !== undefined && hasVisualAsset(app) && matchesTypeFilter(app, typeFilter),
      byLastUpdatedDesc,
      TRENDING_PAGE_SIZE,
    );
    ids[`downloadTrending:${typeFilter}`] = topIds(
      apps,
      (app) => app.installsLast7Days !== undefined && hasVisualAsset(app) && matchesTypeFilter(app, typeFilter),
      byInstallsLast7DaysDesc,
      TRENDING_PAGE_SIZE,
    );
  }

  for (const category of distinctCategories(apps)) {
    ids[`categoryPreview:${category}`] = topIds(
      apps,
      (app) => app.category === category && hasVisualAsset(app),
      byCategoryPreviewOrder,
      CATEGORY_PREVIEW_SIZE,
    );
  }

  for (const source of distinctSources(apps)) {
    ids[`trendingBySource:${source}`] = topIds(
      apps,
      (app) => app.popularity !== undefined && hasVisualAsset(app) && hasPackageFromSource(app, source),
      byPopularityDesc,
      TRENDING_PAGE_SIZE,
    );
  }

  return ids;
}

const INDEX_RETRY_ATTEMPTS = 3;
const INDEX_RETRY_BASE_DELAY_MS = 500;

/**
 * Real failure, found live 2026-09-04 (preview, `workflow_dispatch` run
 * 33927189488): the swap batch above committed cleanly (verified after
 * the fact — `SELECT name FROM sqlite_master` showed the old `apps_old`
 * and every one of its indexes genuinely gone, nothing orphaned), yet the
 * very next statement — `CREATE INDEX idx_apps_category ON apps(category)`,
 * the first in `APPS_INDEXES_SQL` — failed with "index ... already
 * exists" anyway. `db.batch()` and `db.execute()` are separate HTTP round
 * trips against Turso's hosted hrana endpoint; the most likely explanation
 * is a brief read-your-writes lag between the batch's commit and the
 * schema view the next request sees, not a genuine name collision — the
 * 2026-09-03 fix for this same error message was only ever verified
 * against a local `file:` SQLite (fully synchronous, so it can't
 * reproduce an HTTP consistency gap like this). One retry with a short
 * backoff is enough for the schema to catch up; only re-throws (rather
 * than masking a real, non-transient collision) after every attempt sees
 * the same "already exists" error.
 */
async function createIndexWithRetry(db: Client, indexSql: string): Promise<void> {
  for (let attempt = 1; attempt <= INDEX_RETRY_ATTEMPTS; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await db.execute(indexSql);
      return;
    } catch (error) {
      const alreadyExists = error instanceof Error && /already exists/i.test(error.message);
      if (!alreadyExists || attempt === INDEX_RETRY_ATTEMPTS) throw error;
      // eslint-disable-next-line no-await-in-loop
      await delay(attempt * INDEX_RETRY_BASE_DELAY_MS);
    }
  }
}

function toBoolColumn(value: boolean | undefined): number | null {
  return value === undefined ? null : value ? 1 : 0;
}

function toJsonColumn(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

function toRow(app: AppRecord): unknown[] {
  return [
    app.id,
    app.name,
    app.shortDescription,
    app.longDescription ?? null,
    app.homepage ?? null,
    app.kind ?? null,
    app.contentType ?? null,
    toBoolColumn(app.appStoreFrontend),
    app.category ?? null,
    app.developer ?? null,
    app.publisher ?? null,
    app.license ?? null,
    app.iconUrl ?? null,
    app.approxSizeBytes ?? null,
    app.changelog ?? null,
    app.requirements ?? null,
    app.lastUpdated ?? null,
    app.rating?.average ?? null,
    app.rating?.count ?? null,
    app.popularity ?? null,
    toBoolColumn(app.aiFeatures),
    toBoolColumn(app.inAppPurchases),
    toBoolColumn(app.gdprCompliant),
    app.ageRating?.system ?? null,
    app.ageRating?.value ?? null,
    toJsonColumn(app.languages),
    toJsonColumn(app.screenshots),
    toJsonColumn(app.videos),
    toJsonColumn(app.reviews),
    toJsonColumn(app.features),
    toJsonColumn(app.permissions),
    toJsonColumn(app.editorialTags),
    toJsonColumn(app.storeCollections),
    app.installsTotal ?? null,
    app.installsLast7Days ?? null,
    toJsonColumn(app.suite),
    toJsonColumn(app.compatibilityWarnings),
    JSON.stringify(app.dataConfidence),
    JSON.stringify(app.packages),
  ];
}

/**
 * Publishes a dataset to a Turso/libSQL database — same code path for a
 * local dev file, a local `turso dev` server, or the real hosted DB, only
 * `config.url` differs (see `app`'s scripts/dev.mjs and
 * catalog/scripts/seed.ts for how each side points at one).
 *
 * Writes into a fresh `apps_next` table and swaps it in via `ALTER TABLE
 * ... RENAME` (an atomic metadata operation in SQLite) rather than
 * wiping `apps` in place — inserting the full dataset takes long enough
 * that, without the swap, readers would see an empty or half-populated
 * table for that whole window.
 */
export function createTursoClient(config: TursoConfig, client?: Client): TursoClient {
  const db = client ?? createClient({ url: config.url, authToken: config.authToken });

  return {
    async publish(dataset) {
      // Defends against a straggler `apps_old` from some earlier run that
      // never made it to this function's own `DROP TABLE IF EXISTS
      // apps_old` below (e.g. a crash/timeout between the rename and the
      // drop) — its indexes would otherwise squat the exact names
      // APPS_INDEXES_SQL tries to create later, permanently, on every
      // subsequent publish regardless of the read-your-writes retry above
      // (that retry only covers a transient lag, not a genuinely
      // still-existing table). Dropped up front rather than only right
      // before the swap so a straggler can't survive even if this run
      // itself fails before reaching that point.
      await db.execute(`DROP TABLE IF EXISTS apps_old`);
      await db.execute(`DROP TABLE IF EXISTS apps_next`);
      await db.execute(appsTableSql("apps_next"));

      // Sequential on purpose: each batch already groups BATCH_SIZE rows
      // into one round trip; firing all batches concurrently would just
      // open many parallel connections against the same DB for no real
      // throughput gain.
      for (const batch of chunk(dataset.apps, BATCH_SIZE)) {
        // eslint-disable-next-line no-await-in-loop
        await db.batch(
          batch.map((app) => ({
            sql: `INSERT INTO apps_next (${INSERT_COLUMNS.join(", ")}) VALUES (${INSERT_COLUMNS.map(() => "?").join(", ")})`,
            args: toRow(app) as never[],
          })),
          "write",
        );
      }

      await db.execute(
        `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
      );
      const existing = await db.execute(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='apps'`,
      );

      const categoryCountsAll = countByCategory(dataset.apps);
      const categoryCountsGame = countByCategory(
        dataset.apps.filter((app) => app.contentType === "game"),
      );
      const categoryCountsApp = countByCategory(
        dataset.apps.filter((app) => app.contentType !== "game"),
      );
      const listingIds = computeListingIds(dataset.apps);

      // A dynamic key/value list rather than a hand-written VALUES(?, ?, ...)
      // literal — ~60 precomputed listing keys (3 typeFilter variants x 3
      // metrics, plus one per category and one per source) makes hand-sizing
      // the positional args error-prone, and this scales to however many
      // categories/sources actually exist in a given dataset without the
      // SQL text itself needing to change.
      const metaEntries: Array<[string, string]> = [
        ["generatedAt", dataset.generatedAt],
        ["totalApps", String(dataset.apps.length)],
        ["categoryCounts:all", JSON.stringify(categoryCountsAll)],
        ["categoryCounts:game", JSON.stringify(categoryCountsGame)],
        ["categoryCounts:app", JSON.stringify(categoryCountsApp)],
        ...Object.entries(listingIds).map(
          ([key, ids]): [string, string] => [key, JSON.stringify(ids)],
        ),
      ];
      const metaValuesSql = metaEntries.map(() => "(?, ?)").join(", ");

      await db.batch(
        [
          ...(existing.rows.length > 0 ? [{ sql: `ALTER TABLE apps RENAME TO apps_old` }] : []),
          { sql: `ALTER TABLE apps_next RENAME TO apps` },
          { sql: `DROP TABLE IF EXISTS apps_old` },
          {
            sql: `INSERT INTO meta (key, value) VALUES ${metaValuesSql}
                  ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
            args: metaEntries.flat(),
          },
        ],
        "write",
      );

      // Built once over the finished `apps` table, after the swap above
      // has already dropped `apps_old` (and with it, any previous run's
      // same-named indexes) — see APPS_INDEXES_SQL's comment for why
      // this can't happen before the swap. Sequential for the same
      // "don't open parallel connections for no throughput gain" reason
      // as the insert batches. Briefly unindexed between the swap and
      // this loop finishing (a few seconds for 168k rows), which is a
      // far smaller cost than either failing outright on every publish
      // after the first, or dropping the live indexes before the swap
      // and running unindexed for the whole publish duration instead.
      for (const indexSql of APPS_INDEXES_SQL) {
        // eslint-disable-next-line no-await-in-loop
        await createIndexWithRetry(db, indexSql);
      }
    },
  };
}
