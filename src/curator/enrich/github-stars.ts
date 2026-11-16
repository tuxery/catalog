import type { SourcedPackage } from "../../sources";
import { packageGithubRepos, type GithubStarsCacheEntry } from "../../sources/github-stars";
import { percentileScores } from "../../sources/_shared/popularity";
import { aggregatePopularity } from "./index";
import type { CatalogApp } from "./types";

// Repositories that package an app for a store rather than develop it:
// Flathub's manifests (`flathub/org.example.App`), the community snap
// recipes, and any repository named for its packaging (`nodejs/snap`,
// `canonical/postgresql-snap`, `foo-flatpak`, `bar-appimage`, `baz-aur`).
// Their stars measure the packaging, never the app: they never count.
const PACKAGING_OWNERS = new Set(["flathub", "flathub-infra", "snapcrafters"]);
const PACKAGING_REPO_NAME =
  /(?:^|[-_.])(?:snap|snapcraft|flatpak|appimage|aur|pkgbuild|packaging)$/;

/** Whether `repo` (`owner/name`, lowercased) is a store packaging repository. Pure. */
export function isPackagingRepo(repo: string): boolean {
  const [owner = "", name = ""] = repo.split("/");
  return PACKAGING_OWNERS.has(owner) || PACKAGING_REPO_NAME.test(name);
}

/** Lowercase letters and digits only: "OBS Studio" and `obs-studio` compare equal. Pure. */
function squash(name: string): string {
  return name.toLowerCase().replace(/[^a-z\d]/g, "");
}

/** Whether the repository's name is the app's own name or one of its packages' names. Pure. */
export function repoNamesApp(repo: string, app: Pick<CatalogApp, "name" | "packages">): boolean {
  const repoName = squash(repo.split("/")[1] ?? "");
  if (!repoName) return false;
  return [app.name, ...app.packages.map((pkg) => pkg.name)].some(
    (name) => squash(name) === repoName,
  );
}

/** The canonical name of every GitHub repository `pkg` links to that the stars cache knows, packaging repositories left out. Pure. */
function linkedRepos(
  pkg: Pick<SourcedPackage, "homepage" | "links">,
  stars: ReadonlyMap<string, GithubStarsCacheEntry>,
): string[] {
  return packageGithubRepos(pkg).flatMap((key) => {
    const entry = stars.get(key);
    const repo = entry ? (entry.canonical ?? entry.repo) : undefined;
    return repo && !isPackagingRepo(repo) ? [repo] : [];
  });
}

/**
 * Whether `pkg` is a different project folded into the app as its `-git`
 * build: `ruby-git` (a Ruby library, github.com/ruby-git/ruby-git) read
 * as the git build of `ruby`, `go-git` as Go's. A real git build links to
 * the app's repository, not to one named like the package. Pure.
 */
function isMisreadGitBuild(
  pkg: Pick<SourcedPackage, "name">,
  repo: string,
  app: Pick<CatalogApp, "name">,
): boolean {
  const repoName = squash(repo.split("/")[1] ?? "");
  return (
    pkg.name.toLowerCase().endsWith("-git") &&
    squash(pkg.name) === repoName &&
    squash(app.name) !== repoName
  );
}

interface Candidate {
  repo: string;
  /** How many sources point to it: several sources agreeing beats one stray link. */
  sources: number;
  namesApp: boolean;
}

/** Orders candidates best first: more sources, then the one named for the app. */
function compareCandidates(a: Candidate, b: Candidate): number {
  return b.sources - a.sources || Number(b.namesApp) - Number(a.namesApp);
}

/**
 * The GitHub repository an app's packages point to (homepage, AppStream
 * project links, see `packageGithubRepos`), among those `stars` knows,
 * under GitHub's current name for it, never a store's packaging
 * repository (`isPackagingRepo`) nor one only a misread `-git` package
 * links (`isMisreadGitBuild`). When they point to several: the one
 * most sources name, then the one named like the app; a tie on both is
 * ambiguous and gives none. Pure.
 */
export function pickGithubRepo(
  app: Pick<CatalogApp, "name" | "packages">,
  stars: ReadonlyMap<string, GithubStarsCacheEntry>,
): string | undefined {
  const sourcesByRepo = new Map<string, Set<string>>();
  for (const pkg of app.packages) {
    for (const repo of linkedRepos(pkg, stars)) {
      if (isMisreadGitBuild(pkg, repo, app)) continue;
      const sources = sourcesByRepo.get(repo) ?? new Set<string>();
      sources.add(pkg.source);
      sourcesByRepo.set(repo, sources);
    }
  }

  const ranked = [...sourcesByRepo]
    .map(([repo, sources]): Candidate => ({
      repo,
      sources: sources.size,
      namesApp: repoNamesApp(repo, app),
    }))
    .toSorted(compareCandidates);
  const [best, second] = ranked;
  if (!best) return undefined;
  if (second && compareCandidates(best, second) === 0) return undefined;
  return best.repo;
}

/**
 * Gives each app its GitHub repository's stars (`CatalogApp.githubStars`)
 * and folds them into its popularity as one more source
 * (`aggregatePopularity`): a percentile of the stars among the apps that
 * get some, the same 0-1 scale as every source's own percentile.
 *
 * A repository something else also points to is a monorepo
 * (`golang/tools` for each Go tool, `rust-lang/rust` for its source
 * package), an organization's catch-all, or a project whose plugins,
 * libraries and wrappers link to it: its stars go only to the apps named
 * like it (`repoNamesApp`), none to the rest. That something else is
 * another of `apps`, or one of `otherPackages` (the packages of apps not
 * published, filtered out or attached as add-ons) under a name none of
 * the claiming apps' packages has. Mutates `apps`.
 */
export function applyGithubStars(
  apps: CatalogApp[],
  stars: ReadonlyMap<string, GithubStarsCacheEntry>,
  otherPackages: readonly SourcedPackage[] = [],
): void {
  const canonicalStars = new Map<string, number>();
  for (const entry of stars.values()) {
    canonicalStars.set(entry.canonical ?? entry.repo, entry.stars);
  }

  const claimants = new Map<string, CatalogApp[]>();
  for (const app of apps) {
    const repo = pickGithubRepo(app, stars);
    if (!repo) continue;
    claimants.set(repo, [...(claimants.get(repo) ?? []), app]);
  }

  const otherNames = new Map<string, Set<string>>();
  for (const pkg of otherPackages) {
    for (const repo of linkedRepos(pkg, stars)) {
      if (!claimants.has(repo)) continue;
      const names = otherNames.get(repo) ?? new Set<string>();
      names.add(squash(pkg.name));
      otherNames.set(repo, names);
    }
  }

  const awarded = new Map<CatalogApp, string>();
  for (const [repo, claiming] of claimants) {
    const ownNames = new Set(
      claiming.flatMap((app) => app.packages.map((pkg) => squash(pkg.name))),
    );
    const foreign = [...(otherNames.get(repo) ?? [])].some((name) => !ownNames.has(name));
    const shared = claiming.length > 1 || foreign;
    const winners = shared ? claiming.filter((app) => repoNamesApp(repo, app)) : claiming;
    for (const app of winners) awarded.set(app, repo);
  }

  const scores = percentileScores(
    new Map([...awarded].map(([app, repo]) => [app.id, canonicalStars.get(repo) ?? 0])),
  );
  for (const [app, repo] of awarded) {
    app.githubStars = { repo, stars: canonicalStars.get(repo) ?? 0 };
    app.popularity = aggregatePopularity(app.packages, scores.get(app.id));
  }
}
