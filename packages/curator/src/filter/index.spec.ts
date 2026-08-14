import type { SourcedPackage } from "@tuxery/sources";
import { describe, expect, it } from "vitest";
import { filterPackages } from "./index";

function pkg(overrides: Partial<SourcedPackage>): SourcedPackage {
  return {
    source: "debian",
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
    const packages = [pkg({ source: "debian", name: "libfoo-dev" })];
    const overrides = {
      keep: new Set(["debian:libfoo-dev"]),
      exclude: new Set<string>(),
    };

    expect(filterPackages(packages, overrides)).toHaveLength(1);
  });

  it("exclude overrides win over a name that looks fine", () => {
    const packages = [pkg({ source: "debian", name: "actually-a-library" })];
    const overrides = {
      keep: new Set<string>(),
      exclude: new Set(["debian:actually-a-library"]),
    };

    expect(filterPackages(packages, overrides)).toHaveLength(0);
  });

  it("scopes overrides by source, not just name", () => {
    const packages = [pkg({ source: "debian", name: "libfoo-dev" })];
    const overrides = {
      // Same name, wrong source — shouldn't apply.
      keep: new Set(["fedora:libfoo-dev"]),
      exclude: new Set<string>(),
    };

    expect(filterPackages(packages, overrides)).toHaveLength(0);
  });
});
