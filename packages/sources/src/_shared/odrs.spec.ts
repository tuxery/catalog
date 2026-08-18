import { describe, expect, it } from "vitest";
import { averageRating, pickOdrsRating } from "./odrs";

describe("averageRating", () => {
  it("computes a vote-weighted mean across the five star buckets", () => {
    // 2 one-star, 18 five-star -- verified shape against a real ODRS entry.
    expect(averageRating({ star1: 2, star5: 18, total: 20 })).toBeCloseTo(4.6, 5);
  });

  it("ignores the deprecated star0 bucket", () => {
    expect(averageRating({ star0: 100, star5: 1, total: 1 })).toBe(5);
  });
});

describe("pickOdrsRating", () => {
  it("matches the bare AppStream id — the dominant real-data convention", () => {
    const ratings = new Map([["org.mozilla.firefox", { average: 4.1, count: 2590 }]]);

    expect(pickOdrsRating(ratings, "org.mozilla.Firefox")).toEqual({ average: 4.1, count: 2590 });
  });

  it("matches the older .desktop-suffixed id when only that form is present", () => {
    const ratings = new Map([["org.mozilla.firefox.desktop", { average: 3.9, count: 778 }]]);

    expect(pickOdrsRating(ratings, "org.mozilla.firefox")).toEqual({ average: 3.9, count: 778 });
  });

  it("combines both forms into one count-weighted average when both exist — real, separate vote pools, neither dropped", () => {
    const ratings = new Map([
      ["org.mozilla.firefox", { average: 4, count: 100 }],
      ["org.mozilla.firefox.desktop", { average: 2, count: 50 }],
    ]);

    // (4*100 + 2*50) / 150 = 3.333...
    expect(pickOdrsRating(ratings, "org.mozilla.Firefox")).toEqual({
      average: 500 / 150,
      count: 150,
    });
  });

  it("returns undefined for an id with no ODRS entry", () => {
    const ratings = new Map([["org.mozilla.firefox", { average: 3.9, count: 778 }]]);

    expect(pickOdrsRating(ratings, "org.unknown.App")).toBeUndefined();
  });
});
