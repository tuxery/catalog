import { unorderedPairKey } from "helpers4/string";
import { homepageKey } from "../curator/match/homepage";
import { packageKey, refKey } from "../curator/match/keys";
import type { ForceMatchEntry, MatchApartEntry, MatchPackageRef } from "../curator/match/types";
import type { PackageSourceId, SourcedPackage } from "../sources";
import type { WikidataCacheEntry, WikidataPackageProperty } from "../sources/wikidata";

/**
 * Wikidata as an identity bridge: an item that links package ids on
 * several repositories says those packages are one piece of software. Where
 * they sit in two of our groups, that is a candidate `match-force.json`
 * entry; where one of our groups holds packages two items link, a candidate
 * `match-apart.json` entry. Suggestions only, for a person to check: the
 * links are community-edited and thin (about 10,000 items), so nothing here
 * changes the dataset. `scripts/wikidata-suggest.ts` runs it.
 */

/** How one Wikidata package property maps to our sources. */
export interface PropertyMapping {
  /** The sources whose `appId` the property's value names. */
  sources: PackageSourceId[];
  /**
   * Also match the value against the package's source package
   * (`formal.base`) when no package of that source has it as `appId` — a
   * Fedora package property names the source rpm, editors sometimes give
   * Debian's or Arch's source name. Only kept when every package found
   * that way sits in one group: a source package's binaries
   * (`libreoffice-writer`, `-calc`...) are often separate products to us.
   */
  base?: true;
  /** How the value compares with our ids, and where it can't. */
  note: string;
}

export const PROPERTY_MAPPINGS: Record<WikidataPackageProperty, PropertyMapping> = {
  P4655: {
    sources: ["flatpak-flathub"],
    note: "The Flathub app id. Our id keeps AppStream's `.desktop` suffix when the component has one (`org.gnome.Boxes.desktop`), so both are compared without it, case-insensitively.",
  },
  P4435: { sources: ["snap-snapcraft"], note: "The snap name, our `appId` as is." },
  P4162: {
    sources: ["pacman-aur"],
    base: true,
    note: "The AUR package name; pkgbase as a fallback.",
  },
  P3454: {
    sources: ["pacman-arch", "pacman-arch-appstream"],
    base: true,
    note: "The Arch package name; pkgbase as a fallback.",
  },
  P3442: {
    sources: ["deb-debian", "deb-debian-appstream"],
    base: true,
    note: "The Debian stable binary package; the source package as a fallback.",
  },
  P3473: {
    sources: ["deb-ubuntu", "deb-ubuntu-appstream"],
    base: true,
    note: "The Ubuntu binary package; the source package as a fallback.",
  },
  P3463: {
    sources: ["rpm-fedora", "rpm-fedora-appstream"],
    base: true,
    note: "Fedora's source package (its formatter URL is packages.fedoraproject.org/pkgs/<source>); a binary of the same name first, else the binaries built from it.",
  },
  P7788: {
    sources: ["rpm-opensuse", "rpm-opensuse-appstream"],
    base: true,
    note: "The openSUSE package name; the source rpm as a fallback.",
  },
  P3499: { sources: ["ebuild-gentoo"], note: "`category/name`, our `appId` as is." },
  P9045: { sources: ["apk-alpine"], note: "The Alpine package name, our `appId` as is." },
  P12433: {
    sources: ["nix-nixpkgs"],
    note: "The attribute path (`emacsPackages.ledger-mode`), our `appId` as is.",
  },
  P8443: {
    sources: ["brew-homebrew"],
    note: "A formula name only: Wikidata has no cask property, and our casks are `cask/<token>`.",
  },
};

/** The fields of a `CatalogApp` the bridge reads. */
export interface BridgeApp {
  id: string;
  name: string;
  homepage?: string;
  iconUrl?: string;
  excluded?: string;
  companionOf?: string;
  relations?: { app: { id: string } }[];
  packages: (Pick<SourcedPackage, "source" | "name" | "appId" | "homepage" | "track"> & {
    formal?: { base?: string };
  })[];
}

/** What the bridge needs of the curated match lists. */
export interface BridgeOverrides {
  force: ForceMatchEntry[];
  denyPairs: Set<string>;
  apart: MatchApartEntry[];
}

/** One package an item's statement resolved to. */
export interface BridgeLink {
  property: WikidataPackageProperty;
  value: string;
  ref: MatchPackageRef;
  /** The id of the group holding the package. */
  group: string;
  /** `base` when found through the source package name. */
  via: "appId" | "base";
  /**
   * The item gives this property one value. An item listing several
   * packages of one repository (Git's `git`, `git-gui`, `git-svn`; Lua's
   * `lua5.1` to `lua5.4`) names a product's parts or versions, which we
   * keep apart on purpose: such links alone never make a strong suggestion.
   */
  single: boolean;
}

export interface BridgeItem {
  qid: string;
  label?: string;
  websites: string[];
}

export interface SplitGroup {
  id: string;
  name: string;
  homepage?: string;
  packageCount: number;
  excluded?: string;
  companionOf?: string;
  links: BridgeLink[];
  /**
   * How many independent repositories vouch for this group through the
   * links `entry` uses: distinct properties, Debian's and Ubuntu's counted
   * as one (Ubuntu inherits most of Debian's packages and their Wikidata
   * statements were often added together). One means a single statement,
   * the case where an editor's slip shows: openSUSE's `gphotofs` on
   * gphoto2, `transfig` on Xfig.
   */
  repositories: number;
}

/**
 * How far the groups' own homepages back the item: `agree` when they all
 * share a project key (`homepageKey`) with each other or with the item's
 * website or repository, `conflict` when two of them have homepages that
 * share none, `unknown` otherwise.
 */
export type HomepageSignal = "agree" | "conflict" | "unknown";

/** Groups Wikidata says are one piece of software and we keep apart. */
export interface SplitSuggestion {
  item: BridgeItem;
  /** The groups to merge: those a single-valued property links, when there are two or more; else every linked group. */
  groups: SplitGroup[];
  /** Groups only a property with several values links, left out of `entry`. */
  alsoLinked: SplitGroup[];
  /** Fewer than two groups have a single-valued link: `groups` holds them all, and the suggestion is weak. */
  severalValuesOnly: boolean;
  homepage: HomepageSignal;
  /** Two of the groups are linked as relations or companions: kept apart on purpose. */
  related: boolean;
  /** A `match-deny.json` pair or `match-apart.json` entry already keeps two of them apart. */
  curatedApart: boolean;
  /** Some group is reached only through a source package name. */
  baseOnly: boolean;
  /** A linked package is also linked by another item. */
  sharedLinks: boolean;
  entry: ForceMatchEntry;
}

export interface ApartSide {
  item: BridgeItem;
  /** The group's packages only this item links. */
  refs: MatchPackageRef[];
}

/** One of our groups holding packages that different Wikidata items link. */
export interface ApartSuggestion {
  group: { id: string; name: string; homepage?: string; packageCount: number };
  sides: ApartSide[];
  /** A `match-force.json` entry joins packages of two sides: merged on purpose. */
  curatedMerge: boolean;
  /** The sides differ by track (`firefox` and `firefox-esr`): one product to us. */
  tracks: boolean;
  /** Two sides' items share a website or repository project key. */
  sameWebsite: boolean;
  entries: MatchApartEntry[];
}

export interface PropertyStats {
  statements: number;
  /** Values that found at least one of our packages. */
  resolved: number;
  /** ...of which only through a source package name. */
  resolvedViaBase: number;
}

/** What P856 (official website) and P154 (logo) could add, on groups exactly one item links. */
export interface GapStats {
  /** Groups linked by exactly one item, which links no other group. */
  linkedGroups: number;
  withoutHomepage: number;
  withoutHomepageItemHasWebsite: number;
  /** Both have one, and their project keys differ. */
  homepageDiffers: number;
  withoutIcon: number;
  withoutIconItemHasLogo: number;
}

export interface BridgeResult {
  items: number;
  /** Items whose statements found at least one of our packages. */
  itemsLinked: number;
  properties: Record<WikidataPackageProperty, PropertyStats>;
  splits: SplitSuggestion[];
  aparts: ApartSuggestion[];
  gaps: GapStats;
}

function comparableId(source: string, id: string): string {
  return source === "flatpak-flathub" ? id.replace(/\.desktop$/i, "").toLowerCase() : id;
}

function lookupKey(source: string, id: string): string {
  return `${source}\u0000${comparableId(source, id)}`;
}

function projectKeys(urls: Iterable<string | undefined>): Set<string> {
  const keys = new Set<string>();
  for (const url of urls) {
    const key = homepageKey(url);
    if (key) keys.add(key);
  }
  return keys;
}

function intersects(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  for (const value of a) if (b.has(value)) return true;
  return false;
}

function appKeys(app: BridgeApp): Set<string> {
  return projectKeys([app.homepage, ...app.packages.map((pkg) => pkg.homepage)]);
}

function homepageSignal(groupKeys: Set<string>[], itemKeys: Set<string>): HomepageSignal {
  const known = groupKeys.filter((keys) => keys.size > 0);
  if (known.length < groupKeys.length) {
    // Some group has no homepage: only a conflict between the others counts.
    return known.some((a, i) => known.some((b, j) => j > i && !intersects(a, b)))
      ? "conflict"
      : "unknown";
  }
  const backed = known.every(
    (keys) =>
      intersects(keys, itemKeys) ||
      known.some((other) => other !== keys && intersects(keys, other)),
  );
  if (backed) return "agree";
  return known.some((a, i) =>
    known.some((b, j) => j > i && !intersects(a, b) && !intersects(a, itemKeys)),
  )
    ? "conflict"
    : "unknown";
}

function linkRank(link: BridgeLink): number {
  return (link.via === "base" ? 2 : 0) + (link.ref.source === "pacman-aur" ? 1 : 0);
}

function refOf(pkg: BridgeApp["packages"][number]): MatchPackageRef {
  return { source: pkg.source, appId: pkg.appId ?? pkg.name };
}

/** Labels each package of a `match-apart.json` entry `"<index>:a"`/`"<index>:b"`. */
function apartSides(apart: readonly MatchApartEntry[]): Map<string, string[]> {
  const sides = new Map<string, string[]>();
  apart.forEach((entry, index) => {
    for (const [side, refs] of [
      ["a", entry.a],
      ["b", entry.b],
    ] as const) {
      for (const ref of refs) {
        const key = refKey(ref);
        sides.set(key, [...(sides.get(key) ?? []), `${index}:${side}`]);
      }
    }
  });
  return sides;
}

function opposite(label: string): string {
  return label.endsWith(":a") ? `${label.slice(0, -1)}b` : `${label.slice(0, -1)}a`;
}

function itemInfo(item: WikidataCacheEntry): BridgeItem {
  return {
    qid: item.qid,
    ...(item.label ? { label: item.label } : {}),
    websites: [...(item.websites ?? []), ...(item.repositories ?? [])],
  };
}

/**
 * Compares the Wikidata items with our groups. `apps` should be every group,
 * hidden ones included (`buildDataset({ includeExcluded: true })`), so a
 * link to a hidden library or a companion is seen for what it is. Pure.
 */
export function bridgeWikidata(
  apps: readonly BridgeApp[],
  items: readonly WikidataCacheEntry[],
  overrides: BridgeOverrides,
): BridgeResult {
  const byId = new Map(apps.map((app) => [app.id, app]));
  const byAppId = new Map<string, { pkg: BridgeApp["packages"][number]; group: string }[]>();
  const byBase = new Map<string, { pkg: BridgeApp["packages"][number]; group: string }[]>();
  for (const app of apps) {
    for (const pkg of app.packages) {
      const appKey = lookupKey(pkg.source, pkg.appId ?? pkg.name);
      byAppId.set(appKey, [...(byAppId.get(appKey) ?? []), { pkg, group: app.id }]);
      const base = pkg.formal?.base;
      if (base) {
        const baseKey = lookupKey(pkg.source, base);
        byBase.set(baseKey, [...(byBase.get(baseKey) ?? []), { pkg, group: app.id }]);
      }
    }
  }

  const properties = Object.fromEntries(
    Object.keys(PROPERTY_MAPPINGS).map((property) => [
      property,
      { statements: 0, resolved: 0, resolvedViaBase: 0 },
    ]),
  ) as Record<WikidataPackageProperty, PropertyStats>;

  // Every item's links, and how many items link each package.
  const linksByItem = new Map<string, BridgeLink[]>();
  const itemsByPackage = new Map<string, Set<string>>();
  for (const item of items) {
    const links: BridgeLink[] = [];
    for (const [property, values] of Object.entries(item.packages) as [
      WikidataPackageProperty,
      string[],
    ][]) {
      const mapping = PROPERTY_MAPPINGS[property];
      if (!mapping) continue;
      const single = values.length === 1;
      for (const value of values) {
        properties[property].statements++;
        let found = false;
        let foundViaBase = false;
        for (const source of mapping.sources) {
          const direct = byAppId.get(lookupKey(source, value)) ?? [];
          if (direct.length > 0) {
            found = true;
            for (const { pkg, group } of direct) {
              links.push({ property, value, ref: refOf(pkg), group, via: "appId", single });
            }
            continue;
          }
          if (!mapping.base) continue;
          const built = byBase.get(lookupKey(source, value)) ?? [];
          if (built.length === 0 || new Set(built.map(({ group }) => group)).size > 1) continue;
          found = true;
          foundViaBase = true;
          for (const { pkg, group } of built) {
            links.push({ property, value, ref: refOf(pkg), group, via: "base", single });
          }
        }
        if (found) properties[property].resolved++;
        if (found && foundViaBase) properties[property].resolvedViaBase++;
      }
    }
    if (links.length === 0) continue;
    linksByItem.set(item.qid, links);
    for (const link of links) {
      const key = refKey(link.ref);
      const linking = itemsByPackage.get(key) ?? new Set<string>();
      itemsByPackage.set(key, linking);
      linking.add(item.qid);
    }
  }

  const apartLabels = apartSides(overrides.apart);

  const splits: SplitSuggestion[] = [];
  for (const item of items) {
    const links = linksByItem.get(item.qid);
    if (!links) continue;
    const groupIds = [...new Set(links.map((link) => link.group))];
    if (groupIds.length < 2) continue;

    const linked = groupIds.map((id) => {
      const app = byId.get(id)!;
      const group: SplitGroup = {
        id,
        name: app.name,
        packageCount: app.packages.length,
        links: links.filter((link) => link.group === id),
        repositories: 0,
      };
      if (app.homepage) group.homepage = app.homepage;
      if (app.excluded) group.excluded = app.excluded;
      if (app.companionOf) group.companionOf = app.companionOf;
      return group;
    });
    const primary = linked.filter((group) => group.links.some((link) => link.single));
    const severalValuesOnly = primary.length < 2;
    const groups = severalValuesOnly ? linked : primary;
    const alsoLinked = severalValuesOnly ? [] : linked.filter((group) => !primary.includes(group));
    // The destination group: the one with a Flathub package, else the largest.
    groups.sort(
      (a, b) =>
        Number(b.links.some((link) => link.ref.source === "flatpak-flathub")) -
          Number(a.links.some((link) => link.ref.source === "flatpak-flathub")) ||
        b.packageCount - a.packageCount ||
        a.id.localeCompare(b.id),
    );

    const considered = groups.map((group) => group.id);
    const groupSet = new Set(considered);
    const related = considered.some((id) => {
      const app = byId.get(id)!;
      return (
        (app.companionOf !== undefined && groupSet.has(app.companionOf)) ||
        (app.relations ?? []).some((relation) => groupSet.has(relation.app.id))
      );
    });

    const keysByGroup = considered.map((id) => byId.get(id)!).map(appKeys);
    const itemKeys = projectKeys([...(item.websites ?? []), ...(item.repositories ?? [])]);

    // Curated decisions that keep two of these groups apart.
    const memberKeys = considered.map((id) => byId.get(id)!.packages.map((pkg) => packageKey(pkg)));
    let curatedApart = false;
    for (let i = 0; i < memberKeys.length && !curatedApart; i++) {
      const labels = new Set(memberKeys[i]!.flatMap((key) => apartLabels.get(key) ?? []));
      for (let j = i + 1; j < memberKeys.length && !curatedApart; j++) {
        for (const key of memberKeys[j]!) {
          if ((apartLabels.get(key) ?? []).some((label) => labels.has(opposite(label)))) {
            curatedApart = true;
            break;
          }
          if (
            memberKeys[i]!.some((other) => overrides.denyPairs.has(unorderedPairKey(other, key)))
          ) {
            curatedApart = true;
            break;
          }
        }
      }
    }

    const used = groups.flatMap((group) =>
      severalValuesOnly ? group.links : group.links.filter((link) => link.single),
    );
    for (const group of groups) {
      group.repositories = new Set(
        used
          .filter((link) => link.group === group.id)
          .map((link) => (link.property === "P3473" ? "P3442" : link.property)),
      ).size;
    }
    // A group's package for the entry: one named by its own id rather than
    // its source package, and an official repository's over the AUR's
    // (`xorg-twm` rather than `xorg-twm-git`), which comes and goes.
    const pick = (group: SplitGroup): MatchPackageRef =>
      used
        .filter((link) => link.group === group.id)
        .toSorted((a, b) => linkRank(a) - linkRank(b))[0]!.ref;
    const [first, ...rest] = groups;
    const destination =
      used.find((link) => link.group === first!.id && link.ref.source === "flatpak-flathub")?.ref ??
      pick(first!);
    const statements = [
      ...new Set(used.map((link) => `${link.property} ${JSON.stringify(link.value)}`)),
    ];
    splits.push({
      item: itemInfo(item),
      groups,
      alsoLinked,
      severalValuesOnly,
      homepage: homepageSignal(keysByGroup, itemKeys),
      related,
      curatedApart,
      baseOnly: groups.some((group) =>
        used.filter((link) => link.group === group.id).every((link) => link.via === "base"),
      ),
      sharedLinks: used.some((link) => (itemsByPackage.get(refKey(link.ref))?.size ?? 0) > 1),
      entry: {
        destination,
        sources: rest.map(pick),
        reason: `Same software per Wikidata ${item.qid}${item.label ? ` (${item.label})` : ""}, which links ${statements.join(", ")}.`,
      },
    });
  }

  // Groups holding packages of more than one item.
  const forcedPairs = new Set<string>();
  for (const entry of overrides.force) {
    const keys = [entry.destination, ...entry.sources].map(refKey);
    for (const a of keys) for (const b of keys) if (a < b) forcedPairs.add(unorderedPairKey(a, b));
  }
  const itemsByQid = new Map(items.map((item) => [item.qid, item]));
  // The items linking each group.
  const itemsByGroup = new Map<string, Set<string>>();
  for (const [qid, links] of linksByItem) {
    for (const link of links) {
      const qids = itemsByGroup.get(link.group) ?? new Set<string>();
      itemsByGroup.set(link.group, qids);
      qids.add(qid);
    }
  }
  const aparts: ApartSuggestion[] = [];
  for (const [groupId, qids] of itemsByGroup) {
    if (qids.size < 2) continue;
    // Packages only one item links, by item.
    const exclusive = new Map<string, Map<string, MatchPackageRef>>();
    for (const qid of qids) {
      for (const link of linksByItem.get(qid)!) {
        if (link.group !== groupId) continue;
        const key = refKey(link.ref);
        if ((itemsByPackage.get(key)?.size ?? 0) > 1) continue;
        const refs = exclusive.get(qid) ?? new Map<string, MatchPackageRef>();
        exclusive.set(qid, refs);
        refs.set(key, link.ref);
      }
    }
    if (exclusive.size < 2) continue;
    const app = byId.get(groupId)!;
    const sides: ApartSide[] = [...exclusive.entries()]
      .map(([qid, refs]) => ({ item: itemInfo(itemsByQid.get(qid)!), refs: [...refs.values()] }))
      .toSorted((a, b) => b.refs.length - a.refs.length || a.item.qid.localeCompare(b.item.qid));
    const sideKeys = sides.map((side) => side.refs.map(refKey));
    const curatedMerge = sideKeys.some((a, i) =>
      sideKeys.some(
        (b, j) => j > i && a.some((x) => b.some((y) => forcedPairs.has(unorderedPairKey(x, y)))),
      ),
    );
    // AppStream entries carry no track, so a side's tracks are those its
    // other packages name: Firefox's side has none, Firefox ESR's `esr`.
    const trackOf = new Map(app.packages.map((pkg) => [packageKey(pkg), pkg.track]));
    const sideTracks = sideKeys.map((keys) =>
      [...new Set(keys.map((key) => trackOf.get(key)).filter(Boolean))].toSorted().join(),
    );
    const tracks = new Set(sideTracks).size > 1;
    const websiteKeys = sides.map((side) => projectKeys(side.item.websites));
    const sameWebsite = websiteKeys.some((a, i) =>
      websiteKeys.some((b, j) => j > i && intersects(a, b)),
    );
    const [main, ...others] = sides;
    aparts.push({
      group: {
        id: app.id,
        name: app.name,
        ...(app.homepage ? { homepage: app.homepage } : {}),
        packageCount: app.packages.length,
      },
      sides,
      curatedMerge,
      tracks,
      sameWebsite,
      entries: others.map((other) => ({
        a: main!.refs,
        b: other.refs,
        reason: `Different software per Wikidata: ${main!.item.qid}${main!.item.label ? ` (${main!.item.label})` : ""} and ${other.item.qid}${other.item.label ? ` (${other.item.label})` : ""}.`,
      })),
    });
  }

  // What P856/P154 could fill, on groups exactly one item links alone.
  const groupsByItem = new Map(
    [...linksByItem].map(([qid, links]) => [qid, new Set(links.map((link) => link.group))]),
  );
  const gaps: GapStats = {
    linkedGroups: 0,
    withoutHomepage: 0,
    withoutHomepageItemHasWebsite: 0,
    homepageDiffers: 0,
    withoutIcon: 0,
    withoutIconItemHasLogo: 0,
  };
  for (const [groupId, qids] of itemsByGroup) {
    if (qids.size !== 1) continue;
    const [qid] = qids;
    if (groupsByItem.get(qid!)?.size !== 1) continue;
    const app = byId.get(groupId)!;
    const item = itemsByQid.get(qid!)!;
    gaps.linkedGroups++;
    if (!app.homepage) {
      gaps.withoutHomepage++;
      if (item.websites?.length) gaps.withoutHomepageItemHasWebsite++;
    } else if (item.websites?.length) {
      const appKey = homepageKey(app.homepage);
      const itemKeys = projectKeys(item.websites);
      if (appKey && itemKeys.size > 0 && !itemKeys.has(appKey)) gaps.homepageDiffers++;
    }
    if (!app.iconUrl) {
      gaps.withoutIcon++;
      if (item.logos?.length) gaps.withoutIconItemHasLogo++;
    }
  }

  return {
    items: items.length,
    itemsLinked: linksByItem.size,
    properties,
    splits,
    aparts,
    gaps,
  };
}
