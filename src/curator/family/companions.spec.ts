import { describe, expect, it } from "vitest";
import type { CompanionKind } from "./types";
import { capCompanions, MAX_COMPANIONS_PER_KIND, mergeCompanions, toCompanion } from "./companions";
import type { SourcedPackage } from "../../sources";

const pkg = (source: string, name: string) =>
  ({ source, name, description: "", version: "1" }) as SourcedPackage;

describe("mergeCompanions", () => {
  it("merges the same companion from several sources and sorts by kind then name", () => {
    const merged = mergeCompanions([
      toCompanion("elpa-b", "plugin", "", [pkg("deb-debian", "elpa-b")]),
      toCompanion("elpa-a", "plugin", "", [pkg("deb-debian", "elpa-a")]),
      toCompanion("elpa-a", "plugin", "", [pkg("deb-ubuntu", "elpa-a")]),
      toCompanion("dark", "extension", "", [pkg("pacman-aur", "dark")]),
    ]);

    expect(merged.map((c) => `${c.kind}:${c.name}:${c.packages.length}`)).toEqual([
      "extension:dark:1",
      "plugin:elpa-a:2",
      "plugin:elpa-b:1",
    ]);
  });
});

describe("toCompanion", () => {
  it("shortens a long description", () => {
    expect(toCompanion("x", "theme", "a".repeat(200), []).description).toHaveLength(120);
  });
});

describe("capCompanions", () => {
  it("keeps the most widely shipped companions of each kind and counts them all", () => {
    const many = Array.from({ length: MAX_COMPANIONS_PER_KIND + 5 }, (_, index) =>
      toCompanion(`theme-${index}`, "theme" as CompanionKind, "", [pkg("pacman-aur", `t${index}`)]),
    );
    const popular = toCompanion("popular", "theme", "", [
      pkg("deb-debian", "p"),
      pkg("deb-ubuntu", "p"),
    ]);

    const { companions, counts } = capCompanions([...many, popular]);

    expect(counts).toEqual({ theme: MAX_COMPANIONS_PER_KIND + 6 });
    expect(companions).toHaveLength(MAX_COMPANIONS_PER_KIND);
    expect(companions).toContain(popular);
  });
});
