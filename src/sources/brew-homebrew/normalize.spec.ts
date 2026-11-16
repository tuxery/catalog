import { describe, expect, it } from "vitest";
import { caskLine, normalize, NOTHING_TO_RUN_SECTION } from "./normalize";
import type { HomebrewCacheEntry } from "./types";

const WGET: HomebrewCacheEntry = {
  kind: "formula",
  name: "wget",
  desc: "Internet file retriever",
  version: "1.25.0",
  homepage: "https://www.gnu.org/software/wget/",
  license: "GPL-3.0-or-later",
  tap: "homebrew/core",
  executables: 1,
  popularity: 0.98,
};

const HEROIC: HomebrewCacheEntry = {
  kind: "cask",
  name: "heroic",
  title: "Heroic Games Launcher",
  desc: "Game launcher",
  version: "2.22.4",
  homepage: "https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/",
  tap: "homebrew/cask",
};

const licenseOf = (license: string) => normalize([{ ...WGET, license }])[0]?.license;

const sectionOf = (entry: Partial<HomebrewCacheEntry>) =>
  normalize([{ ...WGET, ...entry }])[0]?.section;

const versionOf = (version: string) => normalize([{ ...HEROIC, version }])[0]?.version;

describe("homebrew normalize", () => {
  it("maps a formula to a SourcedPackage named as `brew install` takes it", () => {
    expect(normalize([WGET])).toEqual([
      {
        source: "brew-homebrew",
        name: "wget",
        description: "Internet file retriever",
        version: "1.25.0",
        appId: "wget",
        homepage: "https://www.gnu.org/software/wget/",
        license: "GPL-3.0-or-later",
        section: undefined,
        popularity: 0.98,
      },
    ]);
  });

  it("maps a cask under its display name, its token in a cask/ appId", () => {
    expect(normalize([HEROIC])).toEqual([
      {
        source: "brew-homebrew",
        name: "Heroic Games Launcher",
        description: "Game launcher",
        version: "2.22.4",
        appId: "cask/heroic",
        homepage: "https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/",
        provenance: "community-repack",
      },
    ]);
  });

  it("keeps a formula and the cask of the same name apart", () => {
    const [formula, cask] = normalize([
      { ...WGET, name: "docker" },
      { ...HEROIC, name: "docker", title: "Docker" },
    ]);
    expect(formula?.appId).toBe("docker");
    expect(cask?.appId).toBe("cask/docker");
  });

  it("reads a versioned formula's version as its track", () => {
    expect(normalize([{ ...WGET, name: "node@22" }])[0]).toMatchObject({
      name: "node@22",
      appId: "node@22",
      track: "22",
    });
    expect(normalize([WGET])[0]).not.toHaveProperty("track");
  });

  it("marks a formula with nothing to run, but not a service or an unknown list", () => {
    expect(sectionOf({ name: "abseil", executables: 0 })).toBe(NOTHING_TO_RUN_SECTION);
    expect(sectionOf({ name: "bitlbee", executables: 0, service: true })).toBeUndefined();
    expect(sectionOf({ name: "btrfs-progs", executables: undefined })).toBeUndefined();
  });

  it("drops Homebrew's placeholder for a license it can't express, and keeps its other identifiers", () => {
    expect(licenseOf("LicenseRef-Homebrew-cannot-represent")).toBeUndefined();
    expect(licenseOf("LicenseRef-Homebrew-public-domain")).toBe(
      "LicenseRef-Homebrew-public-domain",
    );
  });

  it("cuts a cask version at its build id", () => {
    expect(versionOf("0.4.28,2")).toBe("0.4.28");
    expect(versionOf("latest")).toBe("latest");
  });

  it("falls back to the token for a cask without a display name", () => {
    expect(normalize([{ ...HEROIC, title: undefined }])[0]?.name).toBe("heroic");
  });
});

describe("caskLine", () => {
  it("reads a release channel as a risk", () => {
    expect(caskLine("zed@preview")).toEqual({ risk: "beta" });
    expect(caskLine("1password-cli@beta")).toEqual({ risk: "beta" });
    expect(caskLine("ferdium@nightly")).toEqual({ risk: "nightly" });
  });

  it("reads anything else as a track", () => {
    expect(caskLine("audacity@3")).toEqual({ track: "3" });
    expect(caskLine("qbittorrent@lt20")).toEqual({ track: "lt20" });
    expect(caskLine("scribus@devel")).toEqual({ track: "devel" });
  });

  it("gives the plain token no line", () => {
    expect(caskLine("heroic")).toEqual({});
  });
});
