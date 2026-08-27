import type { SourcedPackage } from "../types";
import type { AurCacheEntry } from "./types";

// AUR's own submission guidelines reserve these suffixes for an alternate
// build of the exact same software as the unsuffixed package — not a
// different project. Two conventions: `-git`/`-svn`/`-hg`/`-bzr`/`-cvs`
// mark a rolling-release snapshot build (e.g. `0xtools-git` tracks
// `0xtools`'s upstream repo directly); `-bin` marks a prebuilt-binary
// build instead of building from source (e.g. `zen-browser-bin`). Also
// used by the curator module's match tier to merge each variant into its
// base package's app; see `match/group.ts`'s `AUR_VARIANT_SUFFIX`.
const VARIANT_SUFFIX = /-(git|svn|hg|bzr|cvs|bin)$/;

// A release-channel word, optionally followed by one of the build-variant
// suffixes above (e.g. `-beta-bin`) — same "alternate build" shape as
// `VARIANT_SUFFIX`, just a different axis (which release channel, not
// which build method). Checked first below since it's the more specific/
// meaningful label when both are present (`brave-origin-beta-bin`'s
// channel is "beta", not "bin"). See `match/group.ts`'s
// `AUR_CHANNEL_WORD` for the live verification behind this list, and why
// `-dev` is deliberately excluded.
const CHANNEL_WORD =
  /-(beta|nightly|alpha|canary|unstable|preview)(?:-(?:git|svn|hg|bzr|cvs|bin))?$/;

export function normalize(entries: AurCacheEntry[]): SourcedPackage[] {
  return entries.map((entry) => {
    const channelMatch = CHANNEL_WORD.exec(entry.name);
    const variantMatch = VARIANT_SUFFIX.exec(entry.name);

    return {
      source: "pacman-aur",
      name: entry.name,
      description: entry.description,
      version: entry.version,
      // AUR package names are unique in the repo — the closest thing it has
      // to an app id.
      appId: entry.name,
      homepage: entry.homepage,
      popularity: entry.popularity,
      channel: channelMatch ? channelMatch[1] : variantMatch ? variantMatch[1] : undefined,
    };
  });
}
