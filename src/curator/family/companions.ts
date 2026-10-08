import type { SourcedPackage } from "../../sources";
import type { CatalogApp } from "../enrich/types";
import type { Companion, CompanionKind } from "./types";

// Name tokens a companion package carries right after its product's own
// name: `chromium-extension-dark-reader`, `asf-plugin-monitoring`,
// `audacious-plugins`, `firefox-esr-i18n-fr`, `alacritty-themes`.
// Measured 2026-10-08 against the full source set: ~12,500 packages, the
// large majority already filtered out or LLM-hidden as non-apps.
const KIND_BY_TOKEN = new Map<string, CompanionKind>(
  Object.entries({
    extension: "extension",
    extensions: "extension",
    webext: "extension",
    plugin: "plugin",
    plugins: "plugin",
    addon: "plugin",
    addons: "plugin",
    theme: "theme",
    themes: "theme",
    skin: "theme",
    skins: "theme",
    i18n: "localization",
    l10n: "localization",
    langpack: "localization",
    langpacks: "localization",
    dict: "data",
    dictionary: "data",
  }) as [string, CompanionKind][],
);

const DESCRIPTION_LENGTH = 120;

/** Finds the product a package names itself after, by exact package name — the package's own source first. */
export interface ProductIndex {
  byName(source: string, name: string): CatalogApp | undefined;
  byAppstreamId(id: string): CatalogApp | undefined;
}

export function buildProductIndex(apps: readonly CatalogApp[]): ProductIndex {
  const bySourceName = new Map<string, CatalogApp>();
  const byBareName = new Map<string, CatalogApp>();
  const byAppstreamId = new Map<string, CatalogApp>();
  for (const app of apps) {
    for (const pkg of app.packages) {
      const name = pkg.name.toLowerCase();
      bySourceName.set(`${pkg.source}:${name}`, app);
      if (pkg.appId === pkg.name || !pkg.appId) byBareName.set(name, app);
      if (pkg.formal?.componentType && pkg.appId) {
        byAppstreamId.set(stripDesktop(pkg.appId), app);
      }
    }
  }
  return {
    byName: (source, name) =>
      bySourceName.get(`${source}:${name.toLowerCase()}`) ?? byBareName.get(name.toLowerCase()),
    byAppstreamId: (id) => byAppstreamId.get(stripDesktop(id)),
  };
}

function stripDesktop(id: string): string {
  return id.replace(/\.desktop$/, "");
}

// A native-messaging host is `*-native-host`/`*-native-messaging` —
// `native` alone usually means a native build (`pgadmin4-desktop-native`).
const NATIVE_HOST_FOLLOWERS = new Set(["host", "messaging", "connector"]);

// A standalone tool about a product's companions rather than one of them:
// `kitty-theme-manager`, `grub-theme-creator`, `gnome-extension-manager`,
// `vim-plugins-profiler` (sampled 2026-10-08 among the groups the name
// rule turned into companions).
const TOOL_WORDS = new Set([
  "manager",
  "creator",
  "generator",
  "editor",
  "switcher",
  "profiler",
  "updater",
  "installer",
  "picker",
  "selector",
  "chooser",
  "maker",
  "builder",
]);

/** The companion kind a package name declares, and the name tokens before it. */
function kindFromName(name: string): { kind: CompanionKind; before: string[] } | undefined {
  const tokens = name.toLowerCase().split("-");
  if (tokens.some((token) => TOOL_WORDS.has(token))) return undefined;
  for (let index = 1; index < tokens.length; index++) {
    const token = tokens[index] ?? "";
    // `nemo-with-extensions` is a build of Nemo, not an extension.
    if (tokens[index - 1] === "with") return undefined;
    if (token === "native") {
      if (NATIVE_HOST_FOLLOWERS.has(tokens[index + 1] ?? "")) {
        return { kind: "native-host", before: tokens.slice(0, index) };
      }
      continue;
    }
    const kind = KIND_BY_TOKEN.get(token);
    if (kind) return { kind, before: tokens.slice(0, index) };
  }
  return undefined;
}

export interface CompanionMatch {
  parent: CatalogApp;
  kind: CompanionKind;
}

/**
 * The product a package is a companion of, and what kind — `undefined`
 * when no signal names one (docs/product-families.md):
 *
 * 1. an AppStream add-on's `<extends>` (Flathub/AppCenter);
 * 2. a companion token after a product's own package name
 *    (`chromium-extension-*`, `firefox-esr-i18n-*`,
 *    `foo-native-host`) — not a tool about them (`kitty-theme-manager`);
 * 3. for a package that isn't an app (`standalone: false`), Debian's
 *    `Enhances` — on real apps it's misleading (`abook` enhances mutt,
 *    `alttab` enhances awesome, both standalone tools).
 *
 * Pure.
 */
export function companionOf(
  pkg: SourcedPackage,
  index: ProductIndex,
  { standalone }: { standalone: boolean },
): CompanionMatch | undefined {
  const named = kindFromName(pkg.name);
  const formal = pkg.formal;

  if (formal?.componentType === "addon" || formal?.componentType === "localization") {
    for (const id of formal.extends ?? []) {
      const parent = index.byAppstreamId(id);
      if (parent) {
        const kind = formal.componentType === "localization" ? "localization" : named?.kind;
        return { parent, kind: kind ?? "plugin" };
      }
    }
    return undefined;
  }

  if (named) {
    // Longest product name first: `firefox-esr-i18n-fr` belongs to
    // `firefox-esr`, `firefox-ublock-origin-extension` to `firefox`.
    for (let cut = named.before.length; cut >= 1; cut--) {
      const parent = index.byName(pkg.source, named.before.slice(0, cut).join("-"));
      if (parent) return { parent, kind: named.kind };
    }
  }

  if (!standalone) {
    for (const name of formal?.enhances ?? []) {
      const parent = index.byName(pkg.source, name);
      if (parent) return { parent, kind: named?.kind ?? "plugin" };
    }
  }

  return undefined;
}

/** A companion list row for a group or a loose package. */
export function toCompanion(
  name: string,
  kind: CompanionKind,
  description: string,
  packages: readonly SourcedPackage[],
): Companion {
  const short = description.trim();
  return {
    name,
    kind,
    description:
      short.length > DESCRIPTION_LENGTH ? `${short.slice(0, DESCRIPTION_LENGTH - 1)}…` : short,
    packages: packages.map((pkg) => ({ source: pkg.source, name: pkg.name })),
  };
}

// A product's page lists at most this many companions of each kind — the
// rest is only counted (`CatalogApp.companionCounts`). Measured 2026-10-08:
// a handful of products would otherwise carry hundreds (GNOME Extensions
// 1,909 shell extensions, AIMP 748 skins), far more than a page shows.
export const MAX_COMPANIONS_PER_KIND = 100;

/**
 * Merges rows for the same companion (`elpa-ace-window` from Debian and
 * from Ubuntu) and sorts them by kind then name, so a product's list reads
 * the same whichever order sources were read in. Pure.
 */
export function mergeCompanions(companions: readonly Companion[]): Companion[] {
  const byKey = new Map<string, Companion>();
  for (const companion of companions) {
    const key = `${companion.kind}:${companion.name.toLowerCase()}`;
    const existing = byKey.get(key);
    if (existing) existing.packages.push(...companion.packages);
    else byKey.set(key, { ...companion, packages: [...companion.packages] });
  }
  return [...byKey.values()].toSorted(
    (a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name),
  );
}

/**
 * Keeps at most `MAX_COMPANIONS_PER_KIND` of each kind — the ones shipped
 * by the most sources first, a rough notability signal — and counts every
 * kind in full. Pure.
 */
export function capCompanions(companions: readonly Companion[]): {
  companions: Companion[];
  counts: Partial<Record<CompanionKind, number>>;
} {
  const counts: Partial<Record<CompanionKind, number>> = {};
  for (const companion of companions) counts[companion.kind] = (counts[companion.kind] ?? 0) + 1;

  const kept = new Set(
    Object.keys(counts).flatMap((kind) =>
      companions
        .filter((companion) => companion.kind === kind)
        .toSorted((a, b) => b.packages.length - a.packages.length)
        .slice(0, MAX_COMPANIONS_PER_KIND),
    ),
  );
  return { companions: companions.filter((companion) => kept.has(companion)), counts };
}
