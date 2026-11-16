import { fetchOrThrow } from "../_shared/http";
import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import { percentileScores } from "../_shared/popularity";
import type { HomebrewCacheEntry, HomebrewFetchMetadata } from "./types";

// formulae.brew.sh's documented JSON API (https://formulae.brew.sh/docs/api/):
// every formula of homebrew/core in one file, every cask of homebrew/cask
// in another, and one analytics file for popularity. Three GETs in all, no
// pagination, no per-package request.
const FORMULA_URL = "https://formulae.brew.sh/api/formula.json";
const CASK_URL = "https://formulae.brew.sh/api/cask.json";
// Installs a user asked for (not pulled in as a dependency) over the last
// 30 days, homebrew/core only, grouped by formula name. Counted on every
// OS Homebrew runs on, so mostly on macOS.
const ANALYTICS_URL =
  "https://formulae.brew.sh/api/analytics/install-on-request/homebrew-core/30d.json";

// Homebrew's platform tags for Linux, as bottle files, `variations` keys
// and a cask's `supported_platforms` name them.
const LINUX_TAGS = ["x86_64_linux", "arm64_linux"] as const;

interface RawRequirement {
  name?: string;
  version?: string | null;
  specs?: string[];
}

/** A formula as `formula.json` lists it: the fields read here. */
export interface RawFormula {
  name: string;
  desc?: string | null;
  homepage?: string | null;
  license?: string | null;
  tap?: string;
  versions?: { stable?: string | null };
  bottle?: { stable?: { files?: Record<string, unknown> } };
  requirements?: RawRequirement[];
  executables?: string[];
  service?: unknown;
  deprecated?: boolean;
  disabled?: boolean;
  /** What differs per platform tag: `requirements`, `deprecated`, `disabled`... */
  variations?: Record<string, Partial<RawFormula>>;
}

/** A cask as `cask.json` lists it: the fields read here. */
export interface RawCask {
  token: string;
  name?: string[];
  desc?: string | null;
  homepage?: string | null;
  version?: string;
  tap?: string;
  supported_platforms?: string[];
  deprecated?: boolean;
  disabled?: boolean;
  /** What differs per platform tag: `version`, `url`, `disabled`... */
  variations?: Record<string, Partial<RawCask>>;
}

/** The analytics file: every variant of a formula (`wget`, `wget --HEAD`) under its name, counts as text (`"30,536"`). */
export interface RawAnalytics {
  start_date?: string;
  end_date?: string;
  formulae?: Record<string, { formula?: string; count?: string }[]>;
}

function hasLinuxTag(tags: readonly string[]): boolean {
  return LINUX_TAGS.some((tag) => tags.includes(tag));
}

/**
 * `raw` as Homebrew resolves it on Linux: the JSON's top level describes
 * the newest macOS on ARM, and `variations` holds what changes elsewhere.
 * Reads the first Linux tag among `supported`, x86_64 when there is none
 * (a formula whose one bottle serves every platform). Pure.
 */
export function onLinux<T extends { variations?: Record<string, Partial<T>> }>(
  raw: T,
  supported: readonly string[],
): T {
  const tag = LINUX_TAGS.find((candidate) => supported.includes(candidate)) ?? LINUX_TAGS[0];
  return { ...raw, ...raw.variations?.[tag] };
}

/** A bare `depends_on :macos` on the stable release. With a version it is a minimum for macOS users, and met on Linux. */
function requiresMacos(formula: RawFormula): boolean {
  return (formula.requirements ?? []).some(
    (requirement) =>
      requirement.name === "macos" &&
      !requirement.version &&
      (requirement.specs ?? ["stable"]).includes("stable"),
  );
}

/**
 * A formula's cache row, or `undefined` when `brew install` can't install
 * it on Linux: no bottle built for Linux (macOS software), a bottle shared
 * by all platforms next to a bare `depends_on :macos` (scripts around
 * macOS tools), no bottle at all (Homebrew's own `portable-*` build
 * inputs), or `disabled`, which `brew install` refuses. A deprecated
 * formula still installs: kept, with the flag. Pure.
 */
export function mapFormula(raw: RawFormula): HomebrewCacheEntry | undefined {
  const bottles = Object.keys(raw.bottle?.stable?.files ?? {});
  const formula = onLinux(raw, bottles);
  const installable = hasLinuxTag(bottles) || (bottles.includes("all") && !requiresMacos(formula));
  if (!installable || formula.disabled) return undefined;

  return {
    kind: "formula",
    name: formula.name,
    desc: formula.desc ?? "",
    version: formula.versions?.stable ?? "",
    homepage: formula.homepage ?? undefined,
    license: formula.license ?? undefined,
    tap: formula.tap ?? "homebrew/core",
    deprecated: formula.deprecated ? true : undefined,
    executables: formula.executables?.length,
    service: formula.service ? true : undefined,
  };
}

/**
 * A cask's cache row, or `undefined` when it isn't for Linux
 * (`supported_platforms` names no Linux tag: most casks are macOS apps),
 * is `disabled`, or is a font: `font-*` is the naming rule of the fonts
 * that make up most of the casks supporting Linux, and the catalog lists
 * no fonts. Pure.
 */
export function mapCask(raw: RawCask): HomebrewCacheEntry | undefined {
  const platforms = raw.supported_platforms ?? [];
  if (!hasLinuxTag(platforms) || raw.token.startsWith("font-")) return undefined;
  const cask = onLinux(raw, platforms);
  if (cask.disabled) return undefined;

  return {
    kind: "cask",
    name: cask.token,
    title: cask.name?.[0],
    desc: cask.desc ?? "",
    version: cask.version ?? "",
    homepage: cask.homepage ?? undefined,
    tap: cask.tap ?? "homebrew/cask",
    deprecated: cask.deprecated ? true : undefined,
  };
}

/** Each formula's install-on-request count, from its plain variant only (never `--HEAD` or an option set). Pure. */
export function parseInstallCounts(analytics: RawAnalytics): Map<string, number> {
  const counts = new Map<string, number>();
  for (const [name, variants] of Object.entries(analytics.formulae ?? {})) {
    const plain = variants.find((variant) => variant.formula === name);
    const count = Number(plain?.count?.replaceAll(",", ""));
    if (count > 0) counts.set(name, count);
  }
  return counts;
}

/**
 * `formulae` with their popularity: each one's install count as a
 * percentile among the formulae given (see `percentileScores`), so a
 * macOS-only formula left out of the cache doesn't take a rank. A formula
 * nobody installed in the period gets no score. Pure.
 */
export function withPopularity(
  formulae: HomebrewCacheEntry[],
  installs: ReadonlyMap<string, number>,
): HomebrewCacheEntry[] {
  const counts = new Map<string, number>();
  for (const { name } of formulae) {
    const count = installs.get(name);
    if (count) counts.set(name, count);
  }
  const scores = percentileScores(counts);
  return formulae.map((formula) => ({ ...formula, popularity: scores.get(formula.name) }));
}

async function fetchJson<T>(url: string, label: string): Promise<T> {
  const response = await fetchOrThrow(url, label);
  return (await response.json()) as T;
}

/**
 * Downloads Homebrew's formula and cask lists, keeps what installs on
 * Linux and writes it to `cachePath` as NDJSON, formulae first. See
 * docs/sources.md.
 */
export async function fetchHomebrew(cachePath: string): Promise<number> {
  const [rawFormulae, rawCasks, analytics] = await Promise.all([
    fetchJson<RawFormula[]>(FORMULA_URL, "Homebrew formulae"),
    fetchJson<RawCask[]>(CASK_URL, "Homebrew casks"),
    fetchJson<RawAnalytics>(ANALYTICS_URL, "Homebrew install analytics"),
  ]);

  const formulae = withPopularity(
    rawFormulae.flatMap((raw) => mapFormula(raw) ?? []),
    parseInstallCounts(analytics),
  );
  const casks = rawCasks.flatMap((raw) => mapCask(raw) ?? []);
  const entries = [...formulae, ...casks];

  writeNdjson(cachePath, entries);
  writeMetadata<HomebrewFetchMetadata>(cachePath, {
    source: "brew-homebrew",
    fetchedAt: new Date().toISOString(),
    url: `${FORMULA_URL}, ${CASK_URL}`,
    entryCount: entries.length,
    formulaeTotal: rawFormulae.length,
    formulaeKept: formulae.length,
    casksTotal: rawCasks.length,
    casksOnLinux: rawCasks.filter((raw) => hasLinuxTag(raw.supported_platforms ?? [])).length,
    casksKept: casks.length,
    analyticsUrl: ANALYTICS_URL,
    analyticsStart: analytics.start_date,
    analyticsEnd: analytics.end_date,
  });

  return entries.length;
}
