import { describe, expect, it } from "vitest";
import { loadCategoryRules, matchCategoryRule, type CategoryRuleEntry } from "./category-rules";

describe("matchCategoryRule", () => {
  const rules: CategoryRuleEntry[] = [
    { pattern: "proton*", category: "Utilities", reason: "test" },
    { pattern: "exact-name", category: "Science", reason: "test" },
  ];

  it("matches a glob pattern's wildcard against a package name", () => {
    expect(matchCategoryRule(["proton-cachyos-native"], rules)).toBe("Utilities");
  });

  it("matches the pattern's own bare word too — * means zero or more characters", () => {
    expect(matchCategoryRule(["proton"], rules)).toBe("Utilities");
  });

  it("matches case-insensitively", () => {
    expect(matchCategoryRule(["ProtonUp-Qt"], rules)).toBe("Utilities");
  });

  it("matches an exact pattern with no wildcard only in full, not as a substring", () => {
    expect(matchCategoryRule(["exact-name"], rules)).toBe("Science");
    expect(matchCategoryRule(["exact-name-extra"], rules)).toBeUndefined();
  });

  it("matches if any one of an app's member package names matches, not just the first", () => {
    expect(matchCategoryRule(["unrelated", "proton-ge"], rules)).toBe("Utilities");
  });

  it("returns the first matching rule, earlier entries winning over later ones", () => {
    const ordered: CategoryRuleEntry[] = [
      { pattern: "proton-ge*", category: "Games", reason: "test" },
      { pattern: "proton*", category: "Utilities", reason: "test" },
    ];
    expect(matchCategoryRule(["proton-ge-custom"], ordered)).toBe("Games");
  });

  it("returns undefined when no rule matches", () => {
    expect(matchCategoryRule(["firefox"], rules)).toBeUndefined();
  });

  it("returns undefined for an empty rule list", () => {
    expect(matchCategoryRule(["proton"], [])).toBeUndefined();
  });

  it("escapes regex metacharacters in the pattern, only * is special", () => {
    const dotted: CategoryRuleEntry[] = [
      { pattern: "foo.bar", category: "Utilities", reason: "t" },
    ];
    expect(matchCategoryRule(["fooXbar"], dotted)).toBeUndefined();
    expect(matchCategoryRule(["foo.bar"], dotted)).toBe("Utilities");
  });
});

describe("loadCategoryRules", () => {
  it("reads the real config file and includes the verified real Wine/Proton family rules", () => {
    const rules = loadCategoryRules();

    expect(rules.some((r) => r.pattern === "wine*")).toBe(true);
    expect(rules.some((r) => r.pattern === "proton*")).toBe(true);
  });
});
