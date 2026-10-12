import type { FetchMetadata } from "../_shared/metadata";

/**
 * One `<Package>` entry from Solus's `eopkg-index.xml` repodata, the
 * shape cached after parsing. Deliberately close to the upstream fields
 * rather than the normalized `SourcedPackage` — see `normalize.ts`.
 */
export interface SolusCacheEntry {
  name: string;
  summary: string;
  version: string;
  homepage?: string;
  /** The `<License>` elements AND-joined (`GPL-2.0-or-later AND MIT`) — see `SourcedPackage.license`. */
  license?: string;
  /** The newest `<Update>`'s `<Date>` — when the package was last rebuilt, see `SourcedPackage.builtAt`. */
  builtAt?: string;
  /** `<InstalledSize>`, in bytes — see `SourcedPackage.installedSizeBytes`. */
  installedSizeBytes?: number;
  /** Solus's own hierarchical grouping (e.g. `games.strategy`, `programming.library`) — see `SourcedPackage.section`. */
  partOf?: string;
}

export type SolusFetchMetadata = FetchMetadata;
