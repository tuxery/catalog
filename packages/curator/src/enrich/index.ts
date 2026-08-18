import type { PackageSourceId, SourcedPackage } from "@tuxery/sources";
import { looksLikeGamePackage, looksLikeGuiPackage } from "../filter/rules";
import type { MatchedApp } from "../match/group";
import { pickCategory } from "./category";
import type { CatalogApp } from "./types";

/**
 * Preference order for picking the "representative" package a
 * `MatchedApp` group's display fields (name, description, homepage) are
 * drawn from — Flathub/Snapcraft tend to have the most human-readable
 * metadata (proper app names, real summaries), native distro packages the
 * least (terse descriptions, packager-style names). Sources not listed
 * here fall back to array order.
 */
const SOURCE_PRIORITY: PackageSourceId[] = ["flatpak-flathub", "snap-snapcraft", "appimage"];

function pickByPriority(packages: SourcedPackage[]): SourcedPackage {
  for (const source of SOURCE_PRIORITY) {
    const match = packages.find((pkg) => pkg.source === source);
    if (match) return match;
  }
  const [first] = packages;
  if (!first) throw new Error("enrichApps: a MatchedApp group had no packages");
  return first;
}

/**
 * Picks the description independently of the name/homepage
 * representative: a priority source with a blank description (e.g.
 * AppImage's feed frequently has none) shouldn't win over a lower-priority
 * source that actually has one, for the same app.
 */
function pickDescription(packages: SourcedPackage[]): string {
  const withDescription = packages.filter((pkg) => pkg.description);
  return pickByPriority(withDescription.length > 0 ? withDescription : packages).description;
}

/**
 * Positive-evidence-only GUI signal: Fedora/openSUSE's direct
 * `hasDesktopFile`, or Debian/Ubuntu's weaker Section-based heuristic
 * (`looksLikeGuiPackage`, scoped to those two sources only — see that
 * function's doc comment for why other sources' `section` values don't
 * apply). Never "cli" by default; see `CatalogApp.kind`'s doc comment.
 */
function hasGuiEvidence(pkg: SourcedPackage): boolean {
  if (pkg.hasDesktopFile) return true;
  if (pkg.source === "deb-debian" || pkg.source === "deb-ubuntu") {
    return looksLikeGuiPackage(pkg.name, pkg.section);
  }
  return false;
}

/**
 * Positive-evidence-only game signal: Flathub/AppCenter's direct
 * `hasGameCategory`, or `looksLikeGamePackage`'s Section-based heuristic
 * (see that function's doc comment for which sources it applies to).
 * Never assumed "app" by default; see `CatalogApp.contentType`'s doc
 * comment.
 */
function hasGameEvidence(pkg: SourcedPackage): boolean {
  if (pkg.hasGameCategory) return true;
  return looksLikeGamePackage(pkg.source, pkg.section);
}

/**
 * Picks a category label from whichever member package actually has
 * `categories` data (currently Flathub/AppCenter only), same
 * priority-with-fallback shape as `pickDescription` — a group's
 * representative package (by `SOURCE_PRIORITY`) might not be the one
 * carrying category data (e.g. AppCenter isn't in `SOURCE_PRIORITY` at
 * all, so a Snapcraft+AppCenter group's representative would never have
 * categories on its own). `undefined` when no member package has
 * category data, or none of it maps to a recognized Main Category — see
 * `CatalogApp.category`'s doc comment.
 */
function pickCategoryLabel(packages: SourcedPackage[]): string | undefined {
  const withCategories = packages.filter((pkg) => pkg.categories && pkg.categories.length > 0);
  if (withCategories.length === 0) return undefined;
  return pickCategory(pickByPriority(withCategories).categories ?? []);
}

/** Turns grouped packages into the display-ready `CatalogApp` records the website reads — see `types.ts` for what's populated today vs. tracked as roadmap. */
export function enrichApps(matched: MatchedApp[]): CatalogApp[] {
  return matched.map((app) => {
    const representative = pickByPriority(app.packages);

    return {
      id: app.id,
      name: representative.name,
      shortDescription: pickDescription(app.packages),
      homepage: representative.homepage,
      packages: app.packages,
      kind: app.packages.some(hasGuiEvidence) ? "gui" : undefined,
      contentType: app.packages.some(hasGameEvidence) ? "game" : undefined,
      category: pickCategoryLabel(app.packages),
    };
  });
}
