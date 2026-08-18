import { describe, expect, it } from "vitest";
import { pickCategory } from "./category";

describe("pickCategory", () => {
  it("maps a single recognized Main Category to its display label", () => {
    expect(pickCategory(["Development"])).toBe("Developer tools");
    expect(pickCategory(["Office"])).toBe("Productivity");
    expect(pickCategory(["Network"])).toBe("Internet & Communication");
  });

  it("collapses Audio/Video/AudioVideo into the same Multimedia label", () => {
    expect(pickCategory(["Audio"])).toBe("Multimedia");
    expect(pickCategory(["Video"])).toBe("Multimedia");
    expect(pickCategory(["AudioVideo"])).toBe("Multimedia");
  });

  it("prefers the more specific category over Utility when both are present", () => {
    expect(pickCategory(["Office", "Utility"])).toBe("Productivity");
    expect(pickCategory(["Development", "Utility"])).toBe("Developer tools");
    expect(pickCategory(["Utility", "Graphics"])).toBe("Graphics & Creativity");
  });

  it("falls back to Utilities when it's the only recognized category", () => {
    expect(pickCategory(["Utility"])).toBe("Utilities");
  });

  it("ignores Game and Additional Categories not in the taxonomy — CatalogApp.contentType covers Game separately", () => {
    expect(pickCategory(["Game", "ArcadeGame"])).toBeUndefined();
  });

  it("returns undefined for an empty category list", () => {
    expect(pickCategory([])).toBeUndefined();
  });

  it("picks a real Main Category alongside an unrecognized Additional Category", () => {
    expect(pickCategory(["Office", "TextEditor"])).toBe("Productivity");
  });

  it("resolves consistently regardless of input order", () => {
    expect(pickCategory(["Utility", "Development"])).toBe(pickCategory(["Development", "Utility"]));
  });
});
