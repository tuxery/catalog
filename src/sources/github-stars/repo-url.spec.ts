import { describe, expect, it } from "vitest";
import { githubRepoFromUrl, packageGithubRepos } from "./repo-url";

describe("githubRepoFromUrl", () => {
  it.each([
    ["https://github.com/neovim/neovim", "neovim/neovim"],
    ["https://github.com/OBSProject/OBS-Studio", "obsproject/obs-studio"],
    ["http://www.github.com/foo/bar/", "foo/bar"],
    ["https://github.com/foo/bar.git", "foo/bar"],
    ["git+https://github.com/foo/bar.git", "foo/bar"],
    ["git://github.com/foo/bar", "foo/bar"],
    ["git@github.com:foo/bar.git", "foo/bar"],
    ["https://github.com/foo/bar/issues", "foo/bar"],
    ["https://github.com/foo/bar/releases/tag/v1.0", "foo/bar"],
    ["https://github.com/foo/bar#readme", "foo/bar"],
    ["https://github.com/foo/bar?tab=readme", "foo/bar"],
    ["  https://github.com/foo/bar.js  ", "foo/bar.js"],
  ])("reads %s as %s", (url, repo) => {
    expect(githubRepoFromUrl(url)).toBe(repo);
  });

  it.each([
    ["a user or an organization alone", "https://github.com/neovim"],
    ["a GitHub Pages site", "https://foo.github.io/bar"],
    ["a gist", "https://gist.github.com/foo/0123abcd"],
    ["raw file hosting", "https://raw.githubusercontent.com/foo/bar/main/README.md"],
    ["a Sponsors page", "https://github.com/sponsors/foo"],
    ["an organization page", "https://github.com/orgs/foo/repositories"],
    ["a topic", "https://github.com/topics/linux"],
    ["another host", "https://gitlab.com/foo/bar"],
    ["a look-alike host", "https://notgithub.com/foo/bar"],
    ["an invalid owner", "https://github.com/-foo/bar"],
    ["nothing", undefined],
  ])("ignores %s", (_label, url) => {
    expect(githubRepoFromUrl(url)).toBeUndefined();
  });
});

describe("packageGithubRepos", () => {
  it("collects the homepage and project links, deduplicated, but not the donation link", () => {
    expect(
      packageGithubRepos({
        homepage: "https://github.com/foo/bar",
        links: {
          "vcs-browser": "https://github.com/Foo/Bar.git",
          bugtracker: "https://github.com/foo/bar-issues/issues",
          donation: "https://github.com/foo/sponsor-me",
        },
      }),
    ).toEqual(["foo/bar", "foo/bar-issues"]);
  });

  it("gives nothing for a package with no GitHub link", () => {
    expect(packageGithubRepos({ homepage: "https://example.org" })).toEqual([]);
  });
});
