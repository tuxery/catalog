import { nameAxes } from "../_shared/name-axes";
import type { SourcedPackage } from "../types";
import type { HomebrewCacheEntry } from "./types";

/**
 * `SourcedPackage.section` of a formula with nothing to run: no command on
 * the PATH and no service. Homebrew has no category field, and this is its
 * one upstream fact telling a library or a data package from a tool. See
 * `HOMEBREW_NOISE_SECTIONS` in the curator's filter/rules.ts.
 */
export const NOTHING_TO_RUN_SECTION = "brew/nothing-to-run";

/** What Homebrew writes when a formula's license has no SPDX form: no statement at all. */
const NO_LICENSE = "LicenseRef-Homebrew-cannot-represent";

function fromFormula(entry: HomebrewCacheEntry): SourcedPackage {
  // `node@22`: an older line of `node`, kept installable next to it — a
  // track (docs/product-families.md), folded into `node` by the matcher.
  const track = entry.name.split("@")[1];
  return {
    source: "brew-homebrew",
    name: entry.name,
    description: entry.desc,
    version: entry.version,
    // Formula names are unique in homebrew/core, and what `brew install` takes.
    appId: entry.name,
    ...(track ? { track } : {}),
    homepage: entry.homepage,
    license: entry.license === NO_LICENSE ? undefined : entry.license,
    section: entry.executables === 0 && !entry.service ? NOTHING_TO_RUN_SECTION : undefined,
    popularity: entry.popularity,
  };
}

/**
 * The parallel line a cask token's `@<line>` names next to the plain
 * token: a release channel (`zed@preview`, `ferdium@nightly`) or an older
 * major kept installable (`audacity@3`). Often under the same display name
 * as the plain cask, so the two end up in one group. Pure.
 */
export function caskLine(token: string): Pick<SourcedPackage, "track" | "risk"> {
  const [base, line] = token.split("@");
  if (!base || !line) return {};
  const { risk } = nameAxes(`${base}-${line}`);
  return risk ? { risk } : { track: line };
}

function fromCask(entry: HomebrewCacheEntry): SourcedPackage {
  return {
    source: "brew-homebrew",
    // The display name ("Heroic Games Launcher"), which is what other
    // stores list the app under; the token is in `appId`.
    name: entry.title ?? entry.name,
    description: entry.desc,
    // `0.4.28,2`: what follows the comma is a build id for the download
    // URL, not part of the version a user knows.
    version: entry.version.split(",")[0] ?? entry.version,
    // `cask/` keeps a cask apart from the formula of the same name (the two
    // lists are separate namespaces) and says which `brew install` to run:
    // `brew install --cask <token>`.
    appId: `cask/${entry.name}`,
    ...caskLine(entry.name),
    homepage: entry.homepage,
    // A cask installs the vendor's own download as it is.
    provenance: "community-repack",
  };
}

export function normalize(entries: HomebrewCacheEntry[]): SourcedPackage[] {
  return entries.map((entry) => (entry.kind === "cask" ? fromCask(entry) : fromFormula(entry)));
}
