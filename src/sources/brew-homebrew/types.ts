import type { FetchMetadata } from "../_shared/metadata";

/**
 * One Homebrew package installable on Linux: a formula of homebrew/core
 * (built by Homebrew, `brew install <name>`) or a cask of homebrew/cask
 * (the vendor's own download, `brew install --cask <name>`). The fields
 * are the ones `formula.json` and `cask.json` give for Linux, close to
 * upstream rather than the normalized `SourcedPackage` — see
 * `normalize.ts`.
 */
export interface HomebrewCacheEntry {
  kind: "formula" | "cask";
  /** What `brew install` takes: the formula's `name`, the cask's `token`. Unique per kind only: a formula and a cask may share one. */
  name: string;
  /** A cask's display name (`name[0]`: "Heroic Games Launcher" for the token `heroic`). Formulae have none. */
  title?: string;
  /** `desc`, Homebrew's one-line summary. */
  desc: string;
  /** A formula's `versions.stable`; a cask's `version`, which may carry a build id after a comma (`0.4.28,2`) or be `latest`. */
  version: string;
  homepage?: string;
  /** A formula's `license`, an SPDX expression. Casks state none. */
  license?: string;
  /** `homebrew/core` or `homebrew/cask`. */
  tap: string;
  /** Homebrew plans to remove it (`deprecated`); it still installs, with a warning. */
  deprecated?: true;
  /**
   * How many commands a formula puts on the PATH (the length of its
   * `executables` list), 0 for a library or a data package. Absent when
   * Homebrew doesn't list them (Linux-only formulae) and for casks.
   */
  executables?: number;
  /** The formula defines a `service`: `brew services` can run it in the background, as a daemon or a server. */
  service?: true;
  /** See `SourcedPackage.popularity`: the formula's 30-day install-on-request count as a percentile among the cached formulae. Casks have none. */
  popularity?: number;
}

export interface HomebrewFetchMetadata extends FetchMetadata {
  /** Formulae in `formula.json`, and those kept: installable on Linux and not disabled. */
  formulaeTotal: number;
  formulaeKept: number;
  /** Casks in `cask.json`, those supporting Linux, and those kept: neither fonts nor disabled. */
  casksTotal: number;
  casksOnLinux: number;
  casksKept: number;
  /** The analytics file popularity comes from, and the days it covers. */
  analyticsUrl: string;
  analyticsStart?: string;
  analyticsEnd?: string;
}
