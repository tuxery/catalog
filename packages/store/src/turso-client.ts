import { createClient, type Client } from "@libsql/client";

/**
 * A published app record — structurally compatible with `@tuxery/curator`'s
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
  category?: string;
  developer?: string;
  publisher?: string;
  license?: string;
  iconUrl?: string;
  approxSizeBytes?: number;
  changelog?: string;
  requirements?: string;
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
  /** Software-suite membership (a bundled "main" app plus its separately-installable "component" apps) — see `CatalogApp.suite`'s doc comment. */
  suite?: {
    id: string;
    name: string;
    role: "main" | "component";
    components?: { id: string; name: string }[];
    mainApp?: { id: string; name: string };
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
  "category",
  "developer",
  "publisher",
  "license",
  "icon_url",
  "approx_size_bytes",
  "changelog",
  "requirements",
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
  "suite_json",
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
      category TEXT,
      developer TEXT,
      publisher TEXT,
      license TEXT,
      icon_url TEXT,
      approx_size_bytes INTEGER,
      changelog TEXT,
      requirements TEXT,
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
      suite_json TEXT,
      packages_json TEXT NOT NULL
    )
  `;
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
    app.category ?? null,
    app.developer ?? null,
    app.publisher ?? null,
    app.license ?? null,
    app.iconUrl ?? null,
    app.approxSizeBytes ?? null,
    app.changelog ?? null,
    app.requirements ?? null,
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
    toJsonColumn(app.suite),
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
      await db.execute(`DROP TABLE IF EXISTS apps_next`);
      await db.execute(appsTableSql("apps_next"));

      // Sequential on purpose: each iteration already batches BATCH_SIZE
      // rows into one round trip; firing all batches concurrently would
      // just open many parallel connections against the same DB for no
      // real throughput gain.
      for (let i = 0; i < dataset.apps.length; i += BATCH_SIZE) {
        const chunk = dataset.apps.slice(i, i + BATCH_SIZE);
        // eslint-disable-next-line no-await-in-loop
        await db.batch(
          chunk.map((app) => ({
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

      await db.batch(
        [
          ...(existing.rows.length > 0 ? [{ sql: `ALTER TABLE apps RENAME TO apps_old` }] : []),
          { sql: `ALTER TABLE apps_next RENAME TO apps` },
          { sql: `DROP TABLE IF EXISTS apps_old` },
          {
            sql: `INSERT INTO meta (key, value) VALUES ('generatedAt', ?), ('totalApps', ?)
                  ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
            args: [dataset.generatedAt, String(dataset.apps.length)],
          },
        ],
        "write",
      );
    },
  };
}
