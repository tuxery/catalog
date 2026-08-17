import type { SourcedPackage } from "../types";
import type { NixpkgsCacheEntry } from "./types";

export function normalize(entries: NixpkgsCacheEntry[]): SourcedPackage[] {
  return entries.map((entry) => ({
    source: "nixpkgs",
    name: entry.name,
    description: entry.description,
    version: entry.version,
    // pname alone isn't unique across the dump (the same library exists
    // under several attribute paths — different language-version
    // package sets, mainly) — the full attribute path is.
    appId: entry.attrPath,
    homepage: entry.homepage,
    section: entry.prefix,
  }));
}
