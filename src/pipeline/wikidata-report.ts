import {
  PROPERTY_MAPPINGS,
  type ApartSuggestion,
  type BridgeResult,
  type SplitSuggestion,
} from "./wikidata-bridge";
import { WIKIDATA_PACKAGE_PROPERTIES } from "../sources/wikidata";

export type SplitBucket =
  | "strong"
  | "likely"
  | "check"
  | "conflict"
  | "severalValues"
  | "onPurpose";

/**
 * Which list of the report a split suggestion belongs to: `strong` when
 * single-valued links from two or more repositories reach each of the
 * visible groups, whose homepages agree, nothing else in the way; `likely`
 * the same with one group reached by one repository's statement alone;
 * `onPurpose` when a relation, a companion or a curated deny/apart entry
 * already keeps them apart; `severalValues` when only an item's
 * multi-valued properties join them (a product's parts or versions).
 */
export function splitBucket(split: SplitSuggestion): SplitBucket {
  if (split.related || split.curatedApart) return "onPurpose";
  if (split.severalValuesOnly) return "severalValues";
  if (split.homepage === "conflict") return "conflict";
  const hidden = split.groups.some((group) => group.excluded || group.companionOf);
  if (split.homepage === "agree" && !split.baseOnly && !split.sharedLinks && !hidden) {
    return split.groups.every((group) => group.repositories >= 2) ? "strong" : "likely";
  }
  return "check";
}

/**
 * Which list an apart suggestion belongs to: `onPurpose` when a curated
 * force-merge or a track joins the sides, `sameWebsite` when the two items
 * share a website or repository (most often two Wikidata items for one
 * piece of software, or a version of it), else `check`.
 */
export function apartBucket(apart: ApartSuggestion): "check" | "sameWebsite" | "onPurpose" {
  if (apart.curatedMerge || apart.tracks) return "onPurpose";
  return apart.sameWebsite ? "sameWebsite" : "check";
}

const reach = (split: SplitSuggestion): number =>
  split.groups.reduce((sum, group) => sum + group.packageCount, 0);

function count(list: unknown[] | undefined): number {
  return list?.length ?? 0;
}

function itemLink(item: { qid: string; label?: string }): string {
  return `[${item.qid}](https://www.wikidata.org/wiki/${item.qid})${item.label ? ` ${item.label}` : ""}`;
}

function cell(text: string | undefined): string {
  return (text ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function renderSplit(split: SplitSuggestion): string {
  const flags = [
    `homepages: ${split.homepage}`,
    split.baseOnly ? "found through a source package" : "",
    split.sharedLinks ? "a package another item also links" : "",
    split.related ? "related or companion groups" : "",
    split.curatedApart ? "kept apart by match-deny/match-apart" : "",
  ].filter(Boolean);
  const rows = [...split.groups, ...split.alsoLinked].map((group) => {
    const links = [
      ...new Set(
        group.links.map(
          (link) =>
            `${link.property} \`${link.value}\` → \`${link.ref.source}:${link.ref.appId}\`${link.via === "base" ? " (source package)" : ""}${link.single ? "" : " (one of several values)"}`,
        ),
      ),
    ];
    const notes = [
      split.alsoLinked.includes(group) ? "not in the entry" : `${group.repositories} repositories`,
      group.excluded ? `hidden: ${group.excluded}` : "",
      group.companionOf ? `companion of ${group.companionOf}` : "",
    ].filter(Boolean);
    return `| \`${group.id}\` | ${cell(group.name)} | ${group.packageCount} | ${cell(group.homepage)} | ${links.join("<br>")} | ${notes.join(", ")} |`;
  });
  return [
    `### ${itemLink(split.item)}`,
    "",
    `${flags.join(" · ")}${split.item.websites.length ? ` · Wikidata: ${split.item.websites.join(", ")}` : ""}`,
    "",
    "| Group | Name | Packages | Homepage | Linked by | Note |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
    "```json",
    JSON.stringify(split.entry, null, 2),
    "```",
    "",
  ].join("\n");
}

function renderApart(apart: ApartSuggestion): string {
  const flags = [
    apart.curatedMerge ? "merged by match-force" : "",
    apart.tracks ? "sides differ by track" : "",
    apart.sameWebsite ? "items share a website" : "",
  ].filter(Boolean);
  return [
    `### \`${apart.group.id}\` ${cell(apart.group.name)} (${apart.group.packageCount} packages)`,
    "",
    flags.length ? `${flags.join(" · ")}\n` : "",
    "| Item | Website | Packages only it links |",
    "| --- | --- | --- |",
    ...apart.sides.map(
      (side) =>
        `| ${itemLink(side.item)} | ${cell(side.item.websites.join(", "))} | ${side.refs.map((ref) => `\`${ref.source}:${ref.appId}\``).join(", ")} |`,
    ),
    "",
    "```json",
    JSON.stringify(apart.entries, null, 2),
    "```",
    "",
  ].join("\n");
}

/**
 * The Markdown report of `pnpm wikidata-suggest`: the per-property counts,
 * then every suggestion with the entry to copy into `config/` once checked.
 */
export function renderWikidataReport(
  result: BridgeResult,
  { generatedAt, fetchedAt }: { generatedAt: string; fetchedAt?: string },
): string {
  const splits = Object.groupBy(
    result.splits.toSorted((a, b) => reach(b) - reach(a)),
    splitBucket,
  );
  const aparts = Object.groupBy(
    result.aparts.toSorted((a, b) => b.group.packageCount - a.group.packageCount),
    apartBucket,
  );
  const lines = [
    "# Wikidata identity bridge: suggestions",
    "",
    `Dataset built ${generatedAt}; Wikidata cache fetched ${fetchedAt ?? "(unknown)"}. Suggestions only: nothing here is applied. Check each one against the packages before copying its entry into \`config/\`.`,
    "",
    `${result.items} Wikidata items, ${result.itemsLinked} of them link at least one of our packages.`,
    "",
    "| Property | Sources | Statements | Found | Through a source package | How it maps |",
    "| --- | --- | --- | --- | --- | --- |",
    ...Object.entries(PROPERTY_MAPPINGS).map(([property, mapping]) => {
      const stats = result.properties[property as keyof typeof PROPERTY_MAPPINGS];
      return `| ${property} ${WIKIDATA_PACKAGE_PROPERTIES[property as keyof typeof WIKIDATA_PACKAGE_PROPERTIES]} | ${mapping.sources.join(", ")} | ${stats.statements} | ${stats.resolved} | ${stats.resolvedViaBase} | ${cell(mapping.note)} |`;
    }),
    "",
    "## Kept apart, one Wikidata item: candidate `match-force.json` entries",
    "",
    `${result.splits.length} items link two or more of our groups: ${count(splits.strong)} strong (single-valued links from two or more repositories on each visible group, homepages agree), ${count(splits.likely)} likely (the same, but one group rests on one repository's statement), ${count(splits.check)} to check, ${count(splits.conflict)} whose homepages conflict, ${count(splits.severalValues)} joined only by a property with several values (a product's parts or versions, listed without entries), ${count(splits.onPurpose)} kept apart on purpose (relations, companions, match-deny/match-apart).`,
    "",
    "### Strong",
    "",
    ...(splits.strong ?? []).map(renderSplit),
    "### Likely",
    "",
    ...(splits.likely ?? []).map(renderSplit),
    "### To check",
    "",
    ...(splits.check ?? []).map(renderSplit),
    "### Homepages conflict",
    "",
    ...(splits.conflict ?? []).map(renderSplit),
    "### Kept apart on purpose",
    "",
    ...(splits.onPurpose ?? []).map(renderSplit),
    "### Joined only by a property with several values",
    "",
    ...(splits.severalValues ?? []).map(
      (split) =>
        `- ${itemLink(split.item)}: ${split.groups.map((group) => `\`${group.id}\``).join(", ")}`,
    ),
    "",
    "## Merged, several Wikidata items: candidate `match-apart.json` entries",
    "",
    `${result.aparts.length} groups hold packages that different items link: ${count(aparts.check)} to check, ${count(aparts.sameWebsite)} whose items share a website (most often two Wikidata items for one piece of software), ${count(aparts.onPurpose)} merged on purpose (match-force, tracks).`,
    "",
    "### To check",
    "",
    ...(aparts.check ?? []).map(renderApart),
    "### Items sharing a website",
    "",
    ...(aparts.sameWebsite ?? []).map(renderApart),
    "### Merged on purpose",
    "",
    ...(aparts.onPurpose ?? []).map(renderApart),
    "## What P856 (website) and P154 (logo) could fill",
    "",
    `On the ${result.gaps.linkedGroups} groups exactly one item links (and that item no other group): ${result.gaps.withoutHomepage} have no homepage, ${result.gaps.withoutHomepageItemHasWebsite} of which Wikidata has a website for; ${result.gaps.homepageDiffers} have a homepage whose project differs from Wikidata's website; ${result.gaps.withoutIcon} have no icon, ${result.gaps.withoutIconItemHasLogo} of which Wikidata has a logo for.`,
    "",
  ];
  return lines.join("\n");
}
