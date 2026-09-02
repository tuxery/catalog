import { describe, expect, it } from "vitest";
import {
  loadGameCategoryRules,
  matchGameCategoryRule,
  type GameCategoryRuleEntry,
} from "./game-category-rules";

describe("matchGameCategoryRule", () => {
  const rules: GameCategoryRuleEntry[] = [
    { pattern: "Blurble*", category: "Puzzle", reason: "test" },
    { pattern: "exact-name", category: "Strategy", reason: "test" },
  ];

  it("matches a glob pattern's wildcard against a package name", () => {
    expect(matchGameCategoryRule(["Blurble-git"], rules)).toBe("Puzzle");
  });

  it("matches case-insensitively", () => {
    expect(matchGameCategoryRule(["blurble"], rules)).toBe("Puzzle");
  });

  it("matches an exact pattern with no wildcard only in full, not as a substring", () => {
    expect(matchGameCategoryRule(["exact-name"], rules)).toBe("Strategy");
    expect(matchGameCategoryRule(["exact-name-extra"], rules)).toBeUndefined();
  });

  it("matches if any one of an app's member package names matches, not just the first", () => {
    expect(matchGameCategoryRule(["unrelated", "exact-name"], rules)).toBe("Strategy");
  });

  it("returns the first matching rule, earlier entries winning over later ones", () => {
    const ordered: GameCategoryRuleEntry[] = [
      { pattern: "vice*", category: "Simulation", reason: "test" },
      { pattern: "vice-svn", category: "Strategy", reason: "test" },
    ];
    expect(matchGameCategoryRule(["vice-svn"], ordered)).toBe("Simulation");
  });

  it("returns undefined when no rule matches", () => {
    expect(matchGameCategoryRule(["firefox"], rules)).toBeUndefined();
  });

  it("returns undefined for an empty rule list", () => {
    expect(matchGameCategoryRule(["Blurble"], [])).toBeUndefined();
  });
});

describe("loadGameCategoryRules", () => {
  it("reads the real config file and includes a verified real entry", () => {
    const rules = loadGameCategoryRules();

    expect(rules.some((r) => r.pattern === "Blurble")).toBe(true);
    expect(rules.every((r) => r.pattern && r.category && r.reason)).toBe(true);
  });
});
