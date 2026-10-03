import { describe, expect, it } from "vitest";
import { LlmClassificationsListSchema, llmClassificationMap } from "./llm-classifications";

const base = { confidence: "high", reason: "test", model: "test" } as const;

describe("LlmClassificationsListSchema", () => {
  it("accepts a category from the entry's own type", () => {
    const parsed = LlmClassificationsListSchema.safeParse([
      { id: "a:1", type: "app", category: "Utilities", ...base },
      { id: "g:1", type: "game", category: "Puzzle", ...base },
    ]);
    expect(parsed.success).toBe(true);
  });

  it("rejects a game genre on an app and an app category on a game", () => {
    expect(
      LlmClassificationsListSchema.safeParse([
        { id: "a:1", type: "app", category: "Puzzle", ...base },
      ]).success,
    ).toBe(false);
    expect(
      LlmClassificationsListSchema.safeParse([
        { id: "g:1", type: "game", category: "Utilities", ...base },
      ]).success,
    ).toBe(false);
  });

  it("rejects an entry without a type", () => {
    expect(
      LlmClassificationsListSchema.safeParse([{ id: "a:1", category: "Utilities", ...base }])
        .success,
    ).toBe(false);
  });
});

describe("llmClassificationMap", () => {
  it("maps ids to type + category and skips low-confidence entries", () => {
    const map = llmClassificationMap([
      { id: "a:1", type: "app", category: "Utilities", ...base },
      { id: "g:1", type: "game", category: "Puzzle", ...base, confidence: "medium" },
      { id: "a:2", type: "app", category: "Utilities", ...base, confidence: "low" },
    ]);
    expect(map.get("a:1")).toEqual({ type: "app", category: "Utilities" });
    expect(map.get("g:1")).toEqual({ type: "game", category: "Puzzle" });
    expect(map.has("a:2")).toBe(false);
  });
});
