import { PROJECT_LINK_TYPES, type ProjectLinkType, type SourcedPackage } from "../types";

// First path segments of github.com that are GitHub's own pages, never a
// user or organization: `github.com/sponsors/x` or `github.com/orgs/x/...`
// name no repository.
const RESERVED_OWNERS = new Set([
  "about",
  "account",
  "apps",
  "blog",
  "codespaces",
  "collections",
  "contact",
  "customer-stories",
  "downloads",
  "enterprise",
  "events",
  "explore",
  "features",
  "issues",
  "join",
  "login",
  "marketplace",
  "new",
  "notifications",
  "organizations",
  "orgs",
  "pricing",
  "pulls",
  "readme",
  "search",
  "security",
  "settings",
  "site",
  "sponsors",
  "team",
  "topics",
  "trending",
  "users",
]);

// GitHub's own rules: an owner is 1-39 alphanumerics or single inner
// hyphens; a repository name is letters, digits, `.`, `-` and `_`.
const OWNER = /^[a-z\d](?:[a-z\d-]{0,38})$/i;
const REPO = /^[\w.-]+$/;

// `https://`, `http://`, `git://`, `git+https://`, `ssh://git@`, with or
// without `www.`; and scp-like `git@github.com:owner/repo.git`.
const URL_FORM = /^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?(?:www\.)?github\.com[:/]+([^/?#]+)\/([^/?#]+)/i;

/**
 * The `owner/repo` a URL points to on github.com, lowercased (GitHub
 * itself is case-insensitive there), or `undefined` when it names no
 * repository: another host (`*.github.io` pages, `gist.github.com`,
 * `raw.githubusercontent.com`), a user or organization alone, or one of
 * GitHub's own pages (`/sponsors/x`, `/orgs/x`). Anything after the
 * repository (`/issues`, `/releases/latest`, `/tree/main/docs`) still
 * names that repository. Pure.
 */
export function githubRepoFromUrl(url: string | undefined): string | undefined {
  const match = url?.trim().match(URL_FORM);
  if (!match) return undefined;
  const owner = match[1] ?? "";
  const repo = (match[2] ?? "").replace(/\.git$/i, "");
  if (!OWNER.test(owner) || RESERVED_OWNERS.has(owner.toLowerCase())) return undefined;
  if (!REPO.test(repo) || repo === "." || repo === "..") return undefined;
  return `${owner}/${repo}`.toLowerCase();
}

// Link types that name the project's own repository when they point to
// GitHub. `donation` is a GitHub Sponsors page at best, never a repository.
const REPO_LINK_TYPES: readonly ProjectLinkType[] = PROJECT_LINK_TYPES.filter(
  (type) => type !== "donation",
);

/** Every GitHub repository a package's homepage or project links point to, deduplicated. Pure. */
export function packageGithubRepos(pkg: Pick<SourcedPackage, "homepage" | "links">): string[] {
  const urls = [pkg.homepage, ...REPO_LINK_TYPES.map((type) => pkg.links?.[type])];
  const repos = new Set<string>();
  for (const url of urls) {
    const repo = githubRepoFromUrl(url);
    if (repo) repos.add(repo);
  }
  return [...repos];
}
