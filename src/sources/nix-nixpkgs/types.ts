import type { FetchMetadata } from "../_shared/metadata";

/**
 * One entry from nixpkgs' `packages.json.br` channel dump, the shape
 * cached after fetching. Deliberately close to the upstream fields
 * rather than the normalized `SourcedPackage` — see `normalize.ts`.
 */
export interface NixpkgsCacheEntry {
  /**
   * The full attribute path (e.g. `kdePackages.akregator`,
   * `python313Packages.absl-py`) — nixpkgs' closest thing to a stable
   * identifier. `pname` alone isn't unique: the same library commonly
   * exists under several attribute paths (different Python/Ruby/Lua
   * versions, ...).
   */
  attrPath: string;
  /** Upstream `pname` — the human-readable name, e.g. "akregator". */
  name: string;
  description: string;
  version: string;
  homepage?: string;
  /**
   * The attribute path's namespace prefix, when it has one (the part
   * before the first `.`) — e.g. `kdePackages` for
   * `kdePackages.akregator`. See `SourcedPackage.section`.
   */
  prefix?: string;
}

export type NixpkgsFetchMetadata = FetchMetadata;
