import { describe, expect, it } from "vitest";
import { levenshteinDistance, levenshteinSimilarity } from "./levenshtein";

describe("levenshteinDistance", () => {
  it("is 0 for identical strings", () => {
    expect(levenshteinDistance("Discord", "Discord")).toBe(0);
  });

  it("is case-insensitive", () => {
    expect(levenshteinDistance("Discord", "discord")).toBe(0);
  });

  it("counts single-character edits", () => {
    expect(levenshteinDistance("kitten", "sitting")).toBe(3);
  });

  it("handles empty strings", () => {
    expect(levenshteinDistance("", "abc")).toBe(3);
    expect(levenshteinDistance("abc", "")).toBe(3);
  });
});

describe("levenshteinSimilarity", () => {
  it("is 1 for identical strings", () => {
    expect(levenshteinSimilarity("Spotify", "Spotify")).toBe(1);
  });

  it("is between 0 and 1 for similar strings", () => {
    const similarity = levenshteinSimilarity("Spotify", "Spotify (Flatpak)");
    expect(similarity).toBeGreaterThan(0);
    expect(similarity).toBeLessThan(1);
  });
});
