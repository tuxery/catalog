import type { FetchMetadata } from "../_shared/metadata";

/**
 * One package's `desc` file from Arch's official repo databases
 * (`core.db`/`extra.db`), the shape cached after parsing. Deliberately
 * close to the upstream fields rather than the normalized
 * `SourcedPackage` — see `normalize.ts`.
 */
export interface ArchCacheEntry {
  name: string;
  description: string;
  version: string;
  homepage?: string;
  /**
   * Which official repo this package belongs to — varies per package
   * (unlike `arch`, the same for every row in one fetch), so it lives
   * here rather than only in the fetch metadata. Doesn't change the
   * install command today (`pacman -S <name>` either way, no repo to
   * enable), but websites/tooling built on this data may still want to
   * know, and this is cheap to keep.
   */
  repo: "core" | "extra";
}

export interface ArchFetchMetadata extends FetchMetadata {
  /** Repos fetched and merged — "core" and "extra", not AUR (a separate source) or multilib. */
  repos: string[];
  arch: string;
}
