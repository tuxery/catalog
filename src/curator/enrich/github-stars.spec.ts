import { describe, expect, it } from "vitest";
import type { SourcedPackage } from "../../sources";
import type { GithubStarsCacheEntry } from "../../sources/github-stars";
import { TO_CLASSIFY } from "./category";
import { applyGithubStars, isPackagingRepo, pickGithubRepo, repoNamesApp } from "./github-stars";
import type { CatalogApp } from "./types";

function pkg(overrides: Partial<SourcedPackage>): SourcedPackage {
  return { source: "pacman-aur", name: "example", description: "", version: "1", ...overrides };
}

function app(id: string, name: string, packages: SourcedPackage[]): CatalogApp {
  return {
    id,
    name,
    shortDescription: "",
    category: TO_CLASSIFY,
    packages,
    dataConfidence: { score: 0, signals: [] },
  };
}

function starsOf(entries: GithubStarsCacheEntry[]): Map<string, GithubStarsCacheEntry> {
  return new Map(entries.map((entry) => [entry.repo, entry]));
}

const gh = (repo: string) => `https://github.com/${repo}`;

describe("repoNamesApp", () => {
  it("compares the repository's name with the app's and its packages' names, letters and digits only", () => {
    expect(repoNamesApp("obsproject/obs-studio", app("a", "OBS Studio", []))).toBe(true);
    expect(repoNamesApp("foo/bar", app("a", "Baz", [pkg({ name: "bar" })]))).toBe(true);
    expect(repoNamesApp("microsoft/vscode", app("a", "vscode-icons", []))).toBe(false);
  });
});

describe("isPackagingRepo", () => {
  it.each([
    "flathub/org.example.app",
    "snapcrafters/foo",
    "nodejs/snap",
    "canonical/postgresql-snap",
    "x/foo-flatpak",
    "x/foo.appimage",
    "x/foo-aur",
  ])("calls %s packaging", (repo) => expect(isPackagingRepo(repo)).toBe(true));

  it.each(["neovim/neovim", "snapcore/snapd", "flatpak/flatpak-builder", "appimage/appimagekit"])(
    "calls %s a project",
    (repo) => expect(isPackagingRepo(repo)).toBe(false),
  );
});

describe("pickGithubRepo", () => {
  const stars = starsOf([
    { repo: "dev/app", stars: 100 },
    { repo: "packager/app-snap", stars: 5 },
    { repo: "flathub/org.example.app", stars: 3 },
    { repo: "old/name", stars: 7, canonical: "dev/app" },
    { repo: "other/thing", stars: 9 },
  ]);

  it("prefers the development repository over a store's packaging one, even when more sources name the latter", () => {
    const candidate = app("a", "App", [
      pkg({ source: "snap-snapcraft", homepage: gh("packager/app-snap") }),
      pkg({ source: "pacman-aur", homepage: gh("packager/app-snap") }),
      pkg({ source: "flatpak-flathub", links: { "vcs-browser": gh("flathub/org.example.app") } }),
      pkg({ source: "deb-debian", homepage: gh("dev/app") }),
    ]);
    expect(pickGithubRepo(candidate, stars)).toBe("dev/app");
  });

  it("never picks a packaging repository, even alone", () => {
    const candidate = app("a", "App", [
      pkg({ source: "flatpak-flathub", links: { "vcs-browser": gh("flathub/org.example.app") } }),
      pkg({ source: "snap-snapcraft", homepage: gh("packager/app-snap") }),
    ]);
    expect(pickGithubRepo(candidate, stars)).toBeUndefined();
  });

  it("follows a rename, so the old and new names count as one repository", () => {
    const candidate = app("a", "Thing", [
      pkg({ source: "deb-debian", homepage: gh("old/name") }),
      pkg({ source: "rpm-fedora", homepage: gh("dev/app") }),
      pkg({ source: "pacman-aur", homepage: gh("other/thing") }),
    ]);
    expect(pickGithubRepo(candidate, stars)).toBe("dev/app");
  });

  it("gives none when two repositories tie on every count", () => {
    const candidate = app("a", "Neither", [
      pkg({ source: "deb-debian", homepage: gh("dev/app") }),
      pkg({ source: "rpm-fedora", homepage: gh("other/thing") }),
    ]);
    expect(pickGithubRepo(candidate, stars)).toBeUndefined();
  });

  it("breaks a tie with the repository named like the app", () => {
    const candidate = app("a", "Thing", [
      pkg({ source: "deb-debian", homepage: gh("dev/app") }),
      pkg({ source: "rpm-fedora", homepage: gh("other/thing") }),
    ]);
    expect(pickGithubRepo(candidate, stars)).toBe("other/thing");
  });

  it("ignores a library folded in as the app's git build", () => {
    const ruby = app("ruby", "ruby", [
      pkg({ name: "ruby", homepage: "https://www.ruby-lang.org" }),
      pkg({ source: "deb-debian", name: "ruby-git", homepage: gh("ruby-git/ruby-git") }),
    ]);
    const gitBuild = app("neovim", "Neovim", [
      pkg({ name: "neovim-git", homepage: gh("dev/app") }),
    ]);
    const misread = starsOf([
      { repo: "ruby-git/ruby-git", stars: 1800 },
      { repo: "dev/app", stars: 100 },
    ]);
    expect(pickGithubRepo(ruby, misread)).toBeUndefined();
    expect(pickGithubRepo(gitBuild, misread)).toBe("dev/app");
  });

  it("ignores a repository the stars cache doesn't know", () => {
    const candidate = app("a", "Gone", [pkg({ homepage: gh("deleted/repo") })]);
    expect(pickGithubRepo(candidate, stars)).toBeUndefined();
  });
});

describe("applyGithubStars", () => {
  it("gives the stars, as a percentile, to the app pointing to the repository", () => {
    const big = app("big", "Big", [pkg({ homepage: gh("o/big") })]);
    const small = app("small", "Small", [pkg({ homepage: gh("o/small") })]);
    applyGithubStars(
      [big, small],
      starsOf([
        { repo: "o/big", stars: 5000 },
        { repo: "o/small", stars: 3 },
      ]),
    );
    expect(big.githubStars).toEqual({ repo: "o/big", stars: 5000 });
    expect(big.popularity).toBeCloseTo((1 + 0.5 + 0.5) / 3);
    expect(small.popularity).toBeCloseTo((0 + 0.5 + 0.5) / 3);
  });

  it("counts as one source among the package scores: the best three still win", () => {
    const strong = app("strong", "Strong", [
      pkg({ source: "pacman-aur", popularity: 0.9, homepage: gh("o/strong") }),
      pkg({ source: "pacman-arch", popularity: 0.8 }),
      pkg({ source: "deb-debian", popularity: 0.7 }),
    ]);
    const weak = app("weak", "Weak", [pkg({ homepage: gh("o/weak") })]);
    applyGithubStars(
      [strong, weak],
      starsOf([
        { repo: "o/strong", stars: 10 },
        { repo: "o/weak", stars: 20 },
      ]),
    );
    // Strong's GitHub score (0) is worse than its three package scores.
    expect(strong.popularity).toBeCloseTo((0.9 + 0.8 + 0.7) / 3);
  });

  it("gives a repository many apps point to only to the apps named like it", () => {
    const editor = app("code", "vscode", [pkg({ homepage: gh("microsoft/vscode") })]);
    const extension = app("ext", "vscode-icons", [pkg({ homepage: gh("microsoft/vscode") })]);
    const tool = app("tool", "gopls", [pkg({ homepage: gh("golang/tools") })]);
    const otherTool = app("tool2", "goimports", [pkg({ homepage: gh("golang/tools") })]);
    applyGithubStars(
      [editor, extension, tool, otherTool],
      starsOf([
        { repo: "microsoft/vscode", stars: 190_000 },
        { repo: "golang/tools", stars: 7000 },
      ]),
    );
    expect(editor.githubStars?.stars).toBe(190_000);
    expect(extension.githubStars).toBeUndefined();
    expect(tool.githubStars).toBeUndefined();
    expect(otherTool.githubStars).toBeUndefined();
  });

  it("gives none to an app whose repository a library or an add-on also links, unless it's named like it", () => {
    const sourcePackage = app("rust-src", "chromium-rust-src", [
      pkg({ homepage: gh("rust-lang/rust") }),
    ]);
    const tool = app("tool", "Tool Studio", [pkg({ name: "tool-studio", homepage: gh("o/tool") })]);
    const named = app("named", "Named", [pkg({ name: "named", homepage: gh("o/named") })]);
    applyGithubStars(
      [sourcePackage, tool, named],
      starsOf([
        { repo: "rust-lang/rust", stars: 120_000 },
        { repo: "o/tool", stars: 50 },
        { repo: "o/named", stars: 60 },
      ]),
      [
        pkg({ name: "rust-std", homepage: gh("rust-lang/rust") }),
        pkg({ name: "tool-plugins", homepage: gh("o/tool") }),
        pkg({ name: "named-data", homepage: gh("o/named") }),
      ],
    );
    expect(sourcePackage.githubStars).toBeUndefined();
    expect(tool.githubStars).toBeUndefined();
    expect(named.githubStars?.stars).toBe(60);
  });

  it("doesn't count another source's package of the same app as a second claimant", () => {
    const tool = app("tool", "Tool Studio", [pkg({ name: "tool-studio", homepage: gh("o/tool") })]);
    applyGithubStars([tool], starsOf([{ repo: "o/tool", stars: 50 }]), [
      pkg({ source: "deb-debian", name: "tool-studio", homepage: gh("o/tool") }),
    ]);
    expect(tool.githubStars?.stars).toBe(50);
  });

  it("leaves an app without a GitHub repository as it was", () => {
    const plain = app("plain", "Plain", [pkg({ homepage: "https://example.org" })]);
    plain.popularity = 0.6;
    applyGithubStars([plain], starsOf([{ repo: "o/x", stars: 1 }]));
    expect(plain.githubStars).toBeUndefined();
    expect(plain.popularity).toBe(0.6);
  });
});
