import { describe, expect, it } from "vitest";
import { percentileScores } from "./popularity";

describe("percentileScores", () => {
  it("scores 1 for the most used and 0 for the least", () => {
    const scores = percentileScores(
      new Map([
        ["a", 10],
        ["b", 30],
        ["c", 20],
      ]),
    );
    expect([scores.get("b"), scores.get("c"), scores.get("a")]).toEqual([1, 0.5, 0]);
  });

  it("gives equal counts the better rank", () => {
    const scores = percentileScores(
      new Map([
        ["a", 5],
        ["b", 5],
        ["c", 1],
      ]),
    );
    expect(scores.get("a")).toBe(1);
    expect(scores.get("b")).toBe(1);
    expect(scores.get("c")).toBe(0);
  });

  it("leaves out counts of zero and scores a lone package 1", () => {
    const scores = percentileScores(
      new Map([
        ["zero", 0],
        ["only", 4],
      ]),
    );
    expect(scores.has("zero")).toBe(false);
    expect(scores.get("only")).toBe(1);
  });
});
