import type { SourcedPackage } from "../types";
import type { GithubReleasesCacheEntry } from "./types";

export function normalize(entries: GithubReleasesCacheEntry[]): SourcedPackage[] {
  return entries.map((entry) => ({
    source: "github-releases",
    name: entry.name,
    description: entry.description,
    version: entry.version,
    appId: entry.repo,
    homepage: entry.releaseUrl,
  }));
}
