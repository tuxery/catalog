import { agree as licensesAgree } from "helpers4/license";
import type { PackageSourceId, SourcedPackage } from "../../sources";
import { isBuildVariant } from "../match/group";
import { classifyLicense, toSpdxExpression } from "./license";
import type { CatalogApp } from "./types";

/**
 * Which sources may fill each of `CatalogApp`'s rich fields, and in what
 * order — docs/rich-fields.md has the reasoning per field. Unlike the
 * representative's `SOURCE_PRIORITY` (name, description, homepage), each
 * list is exhaustive: a source left out never fills that field, so a new
 * connector feeding a field has to be added here on purpose.
 */

/** Metainfo the developers write themselves, served by the store they publish to. */
const UPSTREAM_STORES: PackageSourceId[] = ["flatpak-flathub", "flatpak-appcenter"];

/** The same upstream metainfo as each distro ships it — often an older release's. */
const DISTRO_APPSTREAM: PackageSourceId[] = [
  "rpm-opensuse-appstream",
  "deb-debian-appstream",
  "deb-ubuntu-appstream",
  "rpm-fedora-appstream",
  "pacman-arch-appstream",
];

/** Packagers' license fields, most reviewed first: Fedora and openSUSE check SPDX expressions at package review. */
const DISTRO_LICENSES: PackageSourceId[] = [
  "rpm-fedora",
  "rpm-opensuse",
  "rpm-rpmfusion",
  "pacman-arch",
  "apk-alpine",
  "nix-nixpkgs",
  "ebuild-gentoo",
  "xbps-void",
  "eopkg-solus",
];

/** `CatalogApp` fields picked from one member package by `FIELD_PRIORITY`'s order. */
export type RichField =
  | "iconUrl"
  | "screenshots"
  | "videos"
  | "longDescription"
  | "license"
  | "developer"
  | "publisher"
  | "languages"
  | "links"
  | "releases"
  | "approxSizeBytes"
  | "ageRating"
  | "requirements"
  | "permissions";

export const FIELD_PRIORITY: Record<RichField, readonly PackageSourceId[]> = {
  iconUrl: [
    ...UPSTREAM_STORES,
    ...DISTRO_APPSTREAM,
    "snap-snapcraft",
    "appimage",
    "vendor-repos",
    "gog",
    "lutris",
  ],
  // One source's whole set, never a mix: screenshots from two sources
  // show two different releases' UIs side by side.
  screenshots: [...UPSTREAM_STORES, ...DISTRO_APPSTREAM, "snap-snapcraft", "appimage", "gog"],
  videos: [...UPSTREAM_STORES, ...DISTRO_APPSTREAM, "snap-snapcraft", "gog"],
  longDescription: [
    ...UPSTREAM_STORES,
    ...DISTRO_APPSTREAM,
    "snap-snapcraft",
    "gog",
    "lutris",
    "appimage",
    "nix-nixpkgs",
  ],
  // Upstream's own declaration first, then the packagers' — see `pickLicense`.
  license: [
    ...UPSTREAM_STORES,
    ...DISTRO_APPSTREAM,
    ...DISTRO_LICENSES,
    "vendor-repos",
    "github-releases",
    "snap-snapcraft",
    "appimage",
    "pacman-aur",
  ],
  // Who makes the app. Never a store account (that's `publisher`) nor a
  // distro's maintainer or packager.
  developer: [...UPSTREAM_STORES, ...DISTRO_APPSTREAM, "gog", "appimage"],
  // The account that publishes the listing in a store, which may not be
  // the developer (a community snap, a GOG publisher).
  publisher: ["snap-snapcraft", "gog"],
  // See `pickLanguages`: the longest list wins, not the first.
  languages: [...UPSTREAM_STORES, ...DISTRO_APPSTREAM],
  links: [...UPSTREAM_STORES, ...DISTRO_APPSTREAM, "snap-snapcraft", "appimage", "github-releases"],
  // AppStream `<releases>` only: distro rebuilds are not releases. The
  // newest one's notes (`changelog`) come along, see `pickReleases`.
  releases: [...UPSTREAM_STORES, ...DISTRO_APPSTREAM],
  // Flathub's download size. Distros' installed sizes measure something
  // else and stay on each package (`SourcedPackage.installedSizeBytes`).
  approxSizeBytes: ["flatpak-flathub"],
  ageRating: [...UPSTREAM_STORES, ...DISTRO_APPSTREAM],
  requirements: [...UPSTREAM_STORES, ...DISTRO_APPSTREAM],
  // The Flatpak's own sandbox: other formats' confinement is per package.
  permissions: ["flatpak-flathub"],
};

/** A product's default line at its stable risk: not ESR, not a nightly, not a snap's edge channel. */
export function isDefaultBuild(pkg: SourcedPackage): boolean {
  return !isBuildVariant(pkg) && pkg.risk === undefined;
}

function hasValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

/**
 * The member packages that may fill `field`, best first: default builds
 * ahead of variants (Firefox's page describes Firefox, not its ESR),
 * then by `FIELD_PRIORITY[field]`. Sources the field doesn't list are
 * left out.
 */
function rankedCandidates<T>(
  field: RichField,
  packages: SourcedPackage[],
  getField: (pkg: SourcedPackage) => T | undefined,
): SourcedPackage[] {
  const order = FIELD_PRIORITY[field];
  const rank = (pkg: SourcedPackage) =>
    (isDefaultBuild(pkg) ? 0 : order.length) + order.indexOf(pkg.source);
  return packages
    .filter((pkg) => order.includes(pkg.source) && hasValue(getField(pkg)))
    .toSorted((a, b) => rank(a) - rank(b));
}

/** `field` from its best-ranked member package — `undefined` when none has it, never guessed. */
export function pickRichField<T>(
  field: RichField,
  packages: SourcedPackage[],
  getField: (pkg: SourcedPackage) => T | undefined,
): T | undefined {
  const [best] = rankedCandidates(field, packages, getField);
  return best === undefined ? undefined : getField(best);
}

/** What sources put in a license field when they don't know it — a real license, even "custom" or a `LicenseRef-`, never matches. */
const LICENSE_PLACEHOLDER = /^(?:unknown|other|none|n\/?a|noassertion|unspecified)$/i;

function isUsableLicense(license: string | undefined): license is string {
  return license !== undefined && !LICENSE_PLACEHOLDER.test(license.trim());
}

/**
 * The best-ranked license that isn't a placeholder, with its SPDX form — taken from a
 * lower-ranked source that agrees with it when the winner's own text
 * isn't SPDX ("GPL3" upstream, "GPL-3.0-or-later" at Fedora).
 */
export function pickLicense(
  packages: SourcedPackage[],
): Pick<CatalogApp, "license" | "licenseSpdx" | "licenseKind"> {
  const candidates = rankedCandidates("license", packages, (pkg) =>
    isUsableLicense(pkg.license) ? pkg.license : undefined,
  ).map((pkg) => pkg.license as string);
  const [license] = candidates;
  if (license === undefined) return {};
  const kind = classifyLicense(license);
  const licenseSpdx =
    toSpdxExpression(license) ??
    candidates
      .filter((other) => licensesAgree(license, other))
      .map(toSpdxExpression)
      .find((spdx) => spdx !== undefined);
  return {
    license,
    licenseSpdx,
    licenseKind: kind === "unknown" ? undefined : kind,
  };
}

/**
 * The longest translation list among `FIELD_PRIORITY.languages`'s
 * sources, ties to the better-ranked: a build listing only `en_US` (seen
 * on AppCenter) didn't scan its locale files, it isn't untranslated.
 */
export function pickLanguages(packages: SourcedPackage[]): string[] | undefined {
  const ranked = rankedCandidates("languages", packages, (pkg) => pkg.languages);
  const [longest] = ranked.toSorted(
    (a, b) => (b.languages?.length ?? 0) - (a.languages?.length ?? 0),
  );
  return longest?.languages;
}

/**
 * The newest upstream release date among default builds: a nightly or a
 * snap's edge channel says nothing about the product's last release.
 * Falls back to every package when no default build has a date.
 */
export function pickLastUpdated(packages: SourcedPackage[]): string | undefined {
  const dates = (pool: SourcedPackage[]) =>
    pool.map((pkg) => pkg.lastUpdated).filter((date): date is string => hasValue(date));
  const defaults = dates(packages.filter(isDefaultBuild));
  const all = defaults.length > 0 ? defaults : dates(packages);
  if (all.length === 0) return undefined;
  return all.reduce((latest, date) => (date > latest ? date : latest));
}

/**
 * The releases and the newest one's changelog, from the same package so
 * the notes always describe the listed release. Another package's
 * changelog only fills in when it describes that same version.
 */
export function pickReleases(
  packages: SourcedPackage[],
): Pick<CatalogApp, "releases" | "changelog"> {
  const ranked = rankedCandidates("releases", packages, (pkg) =>
    isBuildVariant(pkg) ? undefined : pkg.releases,
  );
  const [best] = ranked;
  if (best === undefined) {
    return { changelog: pickRichField("releases", packages, (pkg) => pkg.changelog) };
  }
  const newest = best.releases?.[0]?.version;
  const changelog =
    best.changelog ??
    ranked.find((pkg) => pkg.changelog && pkg.releases?.[0]?.version === newest)?.changelog;
  return { releases: best.releases, changelog };
}
