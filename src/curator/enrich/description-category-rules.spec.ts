import { describe, expect, it } from "vitest";
import {
  loadDescriptionCategoryRules,
  matchDescriptionCategoryRule,
  type DescriptionCategoryRuleEntry,
} from "./description-category-rules";

describe("matchDescriptionCategoryRule", () => {
  const rules: DescriptionCategoryRuleEntry[] = [
    { pattern: "\\btext editor\\b", category: "Utilities", reason: "test" },
    { pattern: "\\bcode editor\\b", category: "Developer Tools", reason: "test" },
  ];

  it("matches a phrase against the description, case-insensitively", () => {
    expect(matchDescriptionCategoryRule("A simple TEXT EDITOR for notes", rules)).toBe("Utilities");
  });

  it("respects word boundaries — does not match a substring inside another word", () => {
    expect(matchDescriptionCategoryRule("A pretextual editorial tool", rules)).toBeUndefined();
  });

  it("returns the first matching rule, earlier entries winning over later ones", () => {
    const ordered: DescriptionCategoryRuleEntry[] = [
      {
        pattern: "\\bmusic player\\b.*\\bstreaming\\b",
        category: "Internet & Communication",
        reason: "test",
      },
      { pattern: "\\bmusic player\\b", category: "Music & Audio", reason: "test" },
    ];
    expect(matchDescriptionCategoryRule("A music player with streaming support", ordered)).toBe(
      "Internet & Communication",
    );
  });

  it("returns undefined when no rule matches", () => {
    expect(matchDescriptionCategoryRule("A simple calculator", rules)).toBeUndefined();
  });

  it("returns undefined for an empty rule list", () => {
    expect(matchDescriptionCategoryRule("A text editor", [])).toBeUndefined();
  });

  it("returns undefined for an empty description", () => {
    expect(matchDescriptionCategoryRule("", rules)).toBeUndefined();
  });
});

describe("loadDescriptionCategoryRules", () => {
  it("reads the real config file and includes a verified real entry", () => {
    const rules = loadDescriptionCategoryRules();

    expect(rules.some((r) => r.pattern === "\\bpassword manager\\b")).toBe(true);
    expect(rules.every((r) => r.pattern && r.category && r.reason)).toBe(true);
  });

  it("orders the task-manager disambiguation before the generic task-manager rule", () => {
    const rules = loadDescriptionCategoryRules();
    const systemToolsOverrideIndex = rules.findIndex(
      (r) => r.category === "System Tools" && r.pattern.includes("task manager"),
    );
    const productivityIndex = rules.findIndex(
      (r) => r.category === "Productivity" && r.pattern === "\\btask manager\\b",
    );

    expect(systemToolsOverrideIndex).toBeGreaterThanOrEqual(0);
    expect(productivityIndex).toBeGreaterThanOrEqual(0);
    expect(systemToolsOverrideIndex).toBeLessThan(productivityIndex);
  });
});
