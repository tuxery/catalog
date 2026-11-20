import {
  applyGithubStars,
  attachFamilies,
  enrichApps,
  filterPackages,
  groupPackages,
  type CatalogApp,
} from "../curator";
import { applyDisplayNames, loadDisplayNames } from "../curator/enrich/display-name";
import type { LlmClassificationEntry } from "../curator/enrich/llm-classifications";
import {
  readGithubStars,
  searchAllSources,
  type GithubStarsCacheEntry,
  type SourcedPackage,
} from "../sources";
import { readBuildInfo, type BuildInfo } from "./build-info";

export interface Dataset {
  generatedAt: string;
  /** Which code built it and how old its sources are — see `BuildInfo`. */
  buildInfo: BuildInfo;
  apps: CatalogApp[];
}

function isAppstreamAddon(pkg: SourcedPackage): boolean {
  const type = pkg.formal?.componentType;
  return type === "addon" || type === "localization";
}

export interface BuildDatasetOptions {
  /**
   * Overrides `config/llm-classifications.json` — `[]` gives the purely
   * deterministic result (what `classify-llm` queues and audits against).
   */
  llmClassifications?: LlmClassificationEntry[];
  /** Keeps apps a high-confidence LLM verdict marked `excluded` (libraries, other non-apps). */
  includeExcluded?: boolean;
  /** Overrides the GitHub stars cache (`src/sources/cache/github-stars.ndjson`), keyed by repository. */
  githubStars?: ReadonlyMap<string, GithubStarsCacheEntry>;
}

/**
 * Runs the sources + curator pipeline end to end: fetch (cached) ->
 * filter out non-app/game packages -> group the rest into unified apps ->
 * enrich each group into a display-ready `CatalogApp` -> attach
 * companions and relations (docs/product-families.md) -> give the apps
 * left their GitHub repository's stars (popularity) -> drop the ones
 * the LLM marked `excluded` and the companions, so the published dataset
 * (and the site) only ever holds apps and games. Every source reads real cached data (see the
 * sources module) — see docs/sources.md in tuxery/catalog for status per
 * source.
 */
export async function buildDataset(options: BuildDatasetOptions = {}): Promise<Dataset> {
  const all = await searchAllSources("");
  // AppStream add-ons never stand as apps: they only join the product
  // they extend, as companions (see attachFamilies).
  const addons = all.filter(isAppstreamAddon);
  const packages = all.filter((pkg) => !isAppstreamAddon(pkg));
  const candidates = filterPackages(packages);
  const kept = new Set(candidates);
  const filteredOut = packages.filter((pkg) => !kept.has(pkg));
  const matched = groupPackages(candidates);
  const enriched = enrichApps(
    matched,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    options.llmClassifications,
  );
  // Before families: companion and relation signals read the product's name.
  applyDisplayNames(enriched, loadDisplayNames());
  const families = attachFamilies(enriched, [...addons, ...filteredOut]);
  const visible = families.filter((app) => !app.excluded && !app.companionOf);
  // Only published apps get stars; everything else pointing to the same
  // repository (a library, an add-on, an unpublished app) makes it shared.
  const published = new Set(visible);
  applyGithubStars(visible, options.githubStars ?? readGithubStars(), [
    ...families.filter((app) => !published.has(app)).flatMap((app) => app.packages),
    ...filteredOut,
    ...addons,
  ]);
  const apps = options.includeExcluded ? families : visible;

  return { generatedAt: new Date().toISOString(), buildInfo: readBuildInfo(), apps };
}
