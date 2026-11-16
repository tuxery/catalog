import { setTimeout as sleep } from "node:timers/promises";
import { fetchOrThrow } from "../_shared/http";
import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import {
  WIKIDATA_PACKAGE_PROPERTIES,
  type WikidataCacheEntry,
  type WikidataFetchMetadata,
  type WikidataPackageProperty,
} from "./types";

// The Wikidata Query Service: the whole dataset in five SPARQL queries,
// no per-item request (https://www.mediawiki.org/wiki/Wikidata_Query_Service/User_Manual#Query_limits:
// 60 s of query time per minute per client, a User-Agent that says who we
// are). Each query below runs in one or two seconds. Joining the four
// detail fields into one query, or selecting the items in a subquery first,
// times out at 60 s: the optimizer picks a bad plan, so each field is its
// own plain join.
const ENDPOINT = "https://query.wikidata.org/sparql";
// Between two queries, well inside the per-minute budget.
const PAUSE_MS = 2_000;

const PACKAGE_PROPERTIES = Object.keys(WIKIDATA_PACKAGE_PROPERTIES) as WikidataPackageProperty[];
const PACKAGE_VALUES = PACKAGE_PROPERTIES.map((property) => `wdt:${property}`).join(" ");

const PACKAGES_QUERY = `SELECT ?item ?property ?value WHERE {
  VALUES ?property { ${PACKAGE_VALUES} }
  ?item ?property ?value .
}`;

/** The item fields read besides package ids, each its own query over the items that have one. */
const DETAIL_PATTERNS = {
  label: `?item rdfs:label ?value . FILTER(LANG(?value) = "en")`,
  websites: "?item wdt:P856 ?value .",
  repositories: "?item wdt:P1324 ?value .",
  logos: "?item wdt:P154 ?value .",
} as const;

type DetailField = keyof typeof DETAIL_PATTERNS;

function detailQuery(field: DetailField): string {
  return `SELECT DISTINCT ?item ?value WHERE {
  VALUES ?property { ${PACKAGE_VALUES} }
  ?item ?property [] .
  ${DETAIL_PATTERNS[field]}
}`;
}

/** One row of a SPARQL JSON result, the variables we select. */
export interface SparqlRow {
  item?: { value: string };
  property?: { value: string };
  value?: { value: string };
}

interface SparqlResult {
  results: { bindings: SparqlRow[] };
}

/** `http://www.wikidata.org/entity/Q698` -> `Q698`; same for a `prop/direct/P4655` IRI. */
export function lastSegment(iri: string): string {
  return iri.slice(iri.lastIndexOf("/") + 1);
}

/** A P154 value, `http://commons.wikimedia.org/wiki/Special:FilePath/Firefox%20logo%2C%202019.svg` -> `Firefox logo, 2019.svg`. */
export function commonsFileName(iri: string): string {
  return decodeURIComponent(lastSegment(iri));
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].toSorted();
}

/**
 * Folds the query results into one entry per item, ordered by numeric QID
 * so a refresh's diff only shows what changed. Rows without an item or a
 * value, or with a property we didn't ask for, are skipped. Pure.
 */
export function collectItems(
  packageRows: readonly SparqlRow[],
  details: Partial<Record<DetailField, readonly SparqlRow[]>>,
): WikidataCacheEntry[] {
  const packages = new Map<string, Map<WikidataPackageProperty, Set<string>>>();
  for (const row of packageRows) {
    const value = row.value?.value.trim();
    if (!row.item || !row.property || !value) continue;
    const property = lastSegment(row.property.value);
    if (!Object.hasOwn(WIKIDATA_PACKAGE_PROPERTIES, property)) continue;
    const qid = lastSegment(row.item.value);
    const byProperty = packages.get(qid) ?? new Map<WikidataPackageProperty, Set<string>>();
    packages.set(qid, byProperty);
    const values = byProperty.get(property as WikidataPackageProperty) ?? new Set<string>();
    byProperty.set(property as WikidataPackageProperty, values);
    values.add(value);
  }

  const indexed = new Map<string, Partial<Record<DetailField, string[]>>>();
  for (const [field, rows] of Object.entries(details) as [DetailField, SparqlRow[]][]) {
    for (const row of rows) {
      if (!row.item || !row.value?.value) continue;
      const qid = lastSegment(row.item.value);
      const entry = indexed.get(qid) ?? {};
      indexed.set(qid, entry);
      const value = field === "logos" ? commonsFileName(row.value.value) : row.value.value;
      (entry[field] ??= []).push(value);
    }
  }

  return [...packages.entries()]
    .toSorted(([a], [b]) => Number(a.slice(1)) - Number(b.slice(1)))
    .map(([qid, byProperty]) => {
      const fields = indexed.get(qid) ?? {};
      const entry: WikidataCacheEntry = {
        qid,
        packages: Object.fromEntries(
          PACKAGE_PROPERTIES.filter((property) => byProperty.has(property)).map((property) => [
            property,
            sortedUnique(byProperty.get(property)!),
          ]),
        ),
      };
      const label = fields.label?.toSorted()[0];
      if (label) entry.label = label;
      for (const field of ["websites", "repositories", "logos"] as const) {
        const values = fields[field];
        if (values?.length) entry[field] = sortedUnique(values);
      }
      return entry;
    });
}

async function runQuery(query: string, label: string): Promise<SparqlRow[]> {
  const response = await fetchOrThrow(ENDPOINT, `Wikidata (${label})`, {
    method: "POST",
    headers: {
      Accept: "application/sparql-results+json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ query }).toString(),
  });
  const result = (await response.json()) as SparqlResult;
  return result.results.bindings;
}

/**
 * Fetches every Wikidata item that names a package on one of the
 * repositories in `WIKIDATA_PACKAGE_PROPERTIES`, with its English label,
 * official website, source repository and logo, and writes them to
 * `cachePath`. Wikidata is CC0 (config/source-terms.json).
 */
export async function fetchWikidata(cachePath: string): Promise<number> {
  const packageRows = await runQuery(PACKAGES_QUERY, "package ids");
  if (packageRows.length === 0) {
    throw new Error("Wikidata returned no package ids; keeping the cache as it is.");
  }
  const details: Partial<Record<DetailField, SparqlRow[]>> = {};
  for (const field of Object.keys(DETAIL_PATTERNS) as DetailField[]) {
    // Sequential on purpose: one query at a time, within the service's budget.
    // eslint-disable-next-line no-await-in-loop
    await sleep(PAUSE_MS);
    // eslint-disable-next-line no-await-in-loop
    details[field] = await runQuery(detailQuery(field), field);
  }

  const entries = collectItems(packageRows, details);
  writeNdjson(cachePath, entries);

  // In WIKIDATA_PACKAGE_PROPERTIES order, so a refresh's diff stays small.
  const statements = Object.fromEntries(
    PACKAGE_PROPERTIES.map((property) => [
      property,
      entries.reduce((sum, entry) => sum + (entry.packages[property]?.length ?? 0), 0),
    ]),
  );
  writeMetadata<WikidataFetchMetadata>(cachePath, {
    source: "wikidata",
    fetchedAt: new Date().toISOString(),
    url: ENDPOINT,
    entryCount: entries.length,
    queries: {
      packages: PACKAGES_QUERY,
      ...Object.fromEntries(
        (Object.keys(DETAIL_PATTERNS) as DetailField[]).map((field) => [field, detailQuery(field)]),
      ),
    },
    statements,
  });
  return entries.length;
}
