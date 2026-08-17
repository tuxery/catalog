import type { SourcedPackage } from "@tuxery/sources";
import { describe, expect, it } from "vitest";
import { filterPackages } from "./index";

function pkg(overrides: Partial<SourcedPackage>): SourcedPackage {
  return {
    source: "deb-debian",
    name: "example",
    description: "",
    version: "1.0.0",
    ...overrides,
  };
}

describe("filterPackages", () => {
  it("drops packages that look like support packages", () => {
    const packages = [pkg({ name: "firefox" }), pkg({ name: "libfoo-dev" })];

    expect(filterPackages(packages).map((p) => p.name)).toEqual(["firefox"]);
  });

  it("keep overrides win over the auto rules", () => {
    const packages = [pkg({ source: "deb-debian", name: "libfoo-dev" })];
    const overrides = {
      keep: new Set(["deb-debian:libfoo-dev"]),
      exclude: new Set<string>(),
    };

    expect(filterPackages(packages, overrides)).toHaveLength(1);
  });

  it("exclude overrides win over a name that looks fine", () => {
    const packages = [pkg({ source: "deb-debian", name: "actually-a-library" })];
    const overrides = {
      keep: new Set<string>(),
      exclude: new Set(["deb-debian:actually-a-library"]),
    };

    expect(filterPackages(packages, overrides)).toHaveLength(0);
  });

  it("scopes overrides by source, not just name", () => {
    const packages = [pkg({ source: "deb-debian", name: "libfoo-dev" })];
    const overrides = {
      // Same name, wrong source — shouldn't apply.
      keep: new Set(["rpm-fedora:libfoo-dev"]),
      exclude: new Set<string>(),
    };

    expect(filterPackages(packages, overrides)).toHaveLength(0);
  });

  it("drops a package via Section even when its name looks fine", () => {
    // The exact kind of gap the Section signal exists for — a name-pattern
    // check alone would never catch this.
    const packages = [pkg({ name: "r-cran-abind", section: "gnu-r" }), pkg({ name: "firefox" })];

    expect(filterPackages(packages).map((p) => p.name)).toEqual(["firefox"]);
  });

  it("keep overrides win over the Section signal too", () => {
    const packages = [pkg({ source: "deb-debian", name: "r-base", section: "gnu-r" })];
    const overrides = {
      keep: new Set(["deb-debian:r-base"]),
      exclude: new Set<string>(),
    };

    expect(filterPackages(packages, overrides)).toHaveLength(1);
  });
});
