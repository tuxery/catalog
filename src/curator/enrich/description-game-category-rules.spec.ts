import { describe, expect, it } from "vitest";
import {
  loadDescriptionGameCategoryRules,
  matchDescriptionGameCategoryRule,
  type DescriptionGameCategoryRuleEntry,
} from "./description-game-category-rules";

describe("matchDescriptionGameCategoryRule", () => {
  const rules: DescriptionGameCategoryRuleEntry[] = [
    { pattern: "\\bturn-based strategy\\b", category: "Strategy", reason: "test" },
    { pattern: "\\bpoint-and-click adventure\\b", category: "Adventure", reason: "test" },
  ];

  it("matches a phrase against the description, case-insensitively", () => {
    expect(matchDescriptionGameCategoryRule("A TURN-BASED STRATEGY game", rules)).toBe("Strategy");
  });

  it("respects word boundaries — does not match a substring inside another word", () => {
    expect(matchDescriptionGameCategoryRule("A non-strategy title", rules)).toBeUndefined();
  });

  it("returns the first matching rule, earlier entries winning over later ones", () => {
    const ordered: DescriptionGameCategoryRuleEntry[] = [
      { pattern: "\\bpuzzle\\b.*\\bplatformer\\b", category: "Puzzle", reason: "test" },
      { pattern: "\\bplatformer\\b", category: "Arcade", reason: "test" },
    ];
    expect(matchDescriptionGameCategoryRule("A puzzle platformer", ordered)).toBe("Puzzle");
  });

  it("returns undefined when no rule matches", () => {
    expect(matchDescriptionGameCategoryRule("A simple desktop widget", rules)).toBeUndefined();
  });

  it("returns undefined for an empty rule list", () => {
    expect(matchDescriptionGameCategoryRule("A turn-based strategy game", [])).toBeUndefined();
  });

  it("returns undefined for an empty description", () => {
    expect(matchDescriptionGameCategoryRule("", rules)).toBeUndefined();
  });
});

describe("loadDescriptionGameCategoryRules", () => {
  it("reads the real config file (empty list is valid)", () => {
    const rules = loadDescriptionGameCategoryRules();

    expect(rules.every((r) => r.pattern && r.category && r.reason)).toBe(true);
  });
});
