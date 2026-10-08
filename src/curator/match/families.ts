import type { SourcedPackage } from "../../sources";
import type { MatchTrackEntry } from "./types";
import { axesFromRest, isVariantRest, onlyTrackOrRisk, restAfter, storeIdRest } from "./variants";

// Sources whose package names follow the `<project>-<difference>`
// convention for builds of the same project (AUR's submission guidelines,
// Arch's own `-fresh`/`-still`). Debian's `libreoffice-writer` or Fedora's
// `firefox-langpacks` are other packages entirely, so their names are never
// read this way.
const VARIANT_NAMING_SOURCES = new Set(["pacman-aur", "pacman-arch"]);

// Stores whose ids are unique and chosen by the publisher: a second listing
// of the same product there is a separate release line, named after the
// first one (`discord-canary`, `com.discordapp.DiscordCanary`).
const STORE_ID_SOURCES = new Set(["snap-snapcraft", "flatpak-flathub", "flatpak-appcenter"]);

/**
 * A Snap/Flatpak listing that extends another listing's id on the same
 * store, by words that only name a track or a risk (`-canary`,
 * `-insiders`, `Beta`, `-lts`), takes that track/risk. Anything else
 * (`picguard-pro`, `space-cadet-pinball`) is left as it is. Pure.
 */
function annotateStoreId(pkg: SourcedPackage, members: readonly SourcedPackage[]): SourcedPackage {
  const id = pkg.appId ?? pkg.name;
  for (const other of members) {
    if (other === pkg || other.source !== pkg.source) continue;
    const rest = storeIdRest(id, other.appId ?? other.name);
    if (!rest || !onlyTrackOrRisk(rest)) continue;
    const axes = axesFromRest(rest);
    return {
      ...pkg,
      ...(!pkg.track && axes.track ? { track: axes.track } : {}),
      ...(!pkg.risk && axes.risk ? { risk: axes.risk } : {}),
    };
  }
  return pkg;
}

/** A curated track lookup: build-suffix-stripped package name -> track. */
export function trackNames(tracks: readonly MatchTrackEntry[]): Map<string, string> {
  const byName = new Map<string, string>();
  for (const entry of tracks) {
    for (const name of entry.names) byName.set(name.toLowerCase(), entry.track);
  }
  return byName;
}

/**
 * Labels each member of one matched group with the track, risk and
 * flavors its name declares relative to the group's other members
 * (docs/product-families.md): a curated track name (`firefox-esr`, on any
 * source), then — for AUR/Arch only — whatever follows the longest other
 * member's name (`firefox-vaapi` -> flavor `vaapi`, `firefox-esr-zh` ->
 * track `esr` + `locale:zh`). Values the source already set win. An AUR
 * build with a patch flavor and no known provenance is
 * `community-patched`. Pure — returns new package objects, the input is
 * left untouched.
 */
export function annotateMembers(
  members: readonly SourcedPackage[],
  strippedName: (pkg: SourcedPackage) => string,
  tracks: ReadonlyMap<string, string>,
): SourcedPackage[] {
  const bases = new Set(members.map((pkg) => strippedName(pkg).toLowerCase()));
  for (const name of tracks.keys()) bases.add(name);

  return members.map((pkg) => {
    const own = strippedName(pkg).toLowerCase();
    const curatedTrack = tracks.get(own);
    if (curatedTrack) return pkg.track ? pkg : { ...pkg, track: curatedTrack };
    if (STORE_ID_SOURCES.has(pkg.source)) return annotateStoreId(pkg, members);
    if (!VARIANT_NAMING_SOURCES.has(pkg.source)) return pkg;

    let best: { base: string; rest: string[] } | undefined;
    for (const base of bases) {
      const rest = restAfter(own, base);
      if (rest && isVariantRest(rest) && (!best || base.length > best.base.length)) {
        best = { base, rest };
      }
    }
    if (!best) return pkg;

    const axes = axesFromRest(best.rest);
    const track = pkg.track ?? tracks.get(best.base) ?? axes.track;
    const risk = pkg.risk ?? axes.risk;
    const flavors = [...(pkg.flavors ?? []), ...(axes.flavors ?? [])];
    const patched = axes.flavors?.some((flavor) => !flavor.startsWith("locale:")) ?? false;
    const provenance =
      pkg.provenance ?? (pkg.source === "pacman-aur" && patched ? "community-patched" : undefined);

    return {
      ...pkg,
      ...(track ? { track } : {}),
      ...(risk ? { risk } : {}),
      ...(flavors.length > 0 ? { flavors } : {}),
      ...(provenance ? { provenance } : {}),
    };
  });
}

/**
 * Package names a drop-in build declares itself a replacement for:
 * `provides` and `conflicts` both naming X, and its own name `X-<rest>`
 * with a rest that describes a build, not a fork or shim (see
 * `isVariantRest`). `provides`+`conflicts` alone isn't enough — forks
 * (`ungoogled-chromium` -> `chromium`, `goldendict-ng` -> `goldendict`)
 * and shims (`neovim-symlinks` -> `vim`) declare it too. Pure.
 */
export function dropInTargets(pkg: SourcedPackage, strippedName: string): string[] {
  const { provides, conflicts } = pkg.formal ?? {};
  if (!provides || !conflicts) return [];
  const own = strippedName.toLowerCase();
  return provides.filter((target) => {
    if (!conflicts.includes(target)) return false;
    const rest = restAfter(own, target.toLowerCase());
    return rest !== undefined && isVariantRest(rest);
  });
}
