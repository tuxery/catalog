import { describe, expect, it } from "vitest";
import {
  CategoriesAppsSchema,
  CategoriesGamesSchema,
  isGameAdjacentToolCategory,
  pickCategory,
  TO_CLASSIFY,
} from "./category";

describe("pickCategory — apps", () => {
  it("maps a single recognized category to its display label", () => {
    expect(pickCategory(["Development"], false)).toBe("Developer Tools");
    expect(pickCategory(["Office"], false)).toBe("Productivity");
    expect(pickCategory(["Network"], false)).toBe("Internet & Communication");
  });

  it("routes specific Audio/Video/Photography tags to Music & Audio or Photo & Video, not the generic AudioVideo catch-all", () => {
    expect(pickCategory(["Audio"], false)).toBe("Music & Audio");
    expect(pickCategory(["Music"], false)).toBe("Music & Audio");
    expect(pickCategory(["Video"], false)).toBe("Photo & Video");
    expect(pickCategory(["Photography"], false)).toBe("Photo & Video");
  });

  it("falls back the generic AudioVideo tag to Music & Audio only when nothing more specific is present", () => {
    expect(pickCategory(["AudioVideo"], false)).toBe("Music & Audio");
    expect(pickCategory(["AudioVideo", "Video"], false)).toBe("Photo & Video");
  });

  it("prefers the more specific category over Utility when both are present", () => {
    expect(pickCategory(["Office", "Utility"], false)).toBe("Productivity");
    expect(pickCategory(["Development", "Utility"], false)).toBe("Developer Tools");
    expect(pickCategory(["Utility", "Graphics"], false)).toBe("Graphics & Design");
  });

  it("falls back to Utilities when it's the only recognized category", () => {
    expect(pickCategory(["Utility"], false)).toBe("Utilities");
  });

  it("falls back to To Classify when nothing is recognized, including Game-only or empty input", () => {
    expect(pickCategory(["Game", "ArcadeGame"], false)).toBe(TO_CLASSIFY);
    expect(pickCategory([], false)).toBe(TO_CLASSIFY);
  });

  it("picks a real category alongside an unrecognized Additional Category", () => {
    expect(pickCategory(["Office", "SomeUnknownTag"], false)).toBe("Productivity");
  });

  it("resolves consistently regardless of input order", () => {
    expect(pickCategory(["Utility", "Development"], false)).toBe(
      pickCategory(["Development", "Utility"], false),
    );
  });
});

describe("pickCategory — games", () => {
  it("maps real freedesktop genre tags to their display label", () => {
    expect(pickCategory(["Game", "ArcadeGame"], true)).toBe("Arcade");
    expect(pickCategory(["Game", "StrategyGame"], true)).toBe("Strategy");
    expect(pickCategory(["Game", "RolePlaying"], true)).toBe("Role-Playing");
  });

  it("folds Shooter into Action, same real-store genre family Steam itself uses", () => {
    expect(pickCategory(["Game", "Shooter"], true)).toBe("Action");
    expect(pickCategory(["Game", "ActionGame"], true)).toBe("Action");
  });

  it("folds BlocksGame/LogicGame into Puzzle", () => {
    expect(pickCategory(["Game", "BlocksGame"], true)).toBe("Puzzle");
    expect(pickCategory(["Game", "LogicGame"], true)).toBe("Puzzle");
  });

  it("folds KidsGame and a co-occurring Education tag into Educational", () => {
    expect(pickCategory(["Game", "KidsGame"], true)).toBe("Educational");
    expect(pickCategory(["Game", "Education"], true)).toBe("Educational");
  });

  it("falls back to To Classify for the bare Game tag with no recognized genre", () => {
    expect(pickCategory(["Game"], true)).toBe(TO_CLASSIFY);
  });

  it("does not apply the app taxonomy's Office/Development mappings to games", () => {
    // "Office"/"Development" are real app-taxonomy keys but carry no
    // meaning in the game taxonomy — a game that (unusually) also carries
    // one shouldn't resolve through the wrong map.
    expect(pickCategory(["Game", "Office"], true)).toBe(TO_CLASSIFY);
  });
});

describe("isGameAdjacentToolCategory", () => {
  it("flags a package tagged Game plus a strong tool-category signal", () => {
    expect(isGameAdjacentToolCategory(["Game", "Emulator"])).toBe(true);
    expect(isGameAdjacentToolCategory(["Game", "PackageManager"])).toBe(true);
    expect(isGameAdjacentToolCategory(["Network", "Game", "Utility"])).toBe(true);
    expect(isGameAdjacentToolCategory(["Game", "GameTool"])).toBe(true);
  });

  it("does not flag a real game that also carries a genuine game-genre category", () => {
    expect(isGameAdjacentToolCategory(["Game", "Simulation", "Utility"])).toBe(false);
  });

  it("does not flag a bare Game tag with no secondary category at all", () => {
    expect(isGameAdjacentToolCategory(["Game"])).toBe(false);
  });

  it("does not flag a category not on the tool allowlist (e.g. Graphics/Music/Video can genuinely describe a real game)", () => {
    expect(isGameAdjacentToolCategory(["Game", "Music"])).toBe(false);
    expect(isGameAdjacentToolCategory(["Game", "Graphics"])).toBe(false);
  });
});

describe("CategoriesAppsSchema/CategoriesGamesSchema", () => {
  it("accepts a real, already-known display label", () => {
    expect(() => CategoriesAppsSchema.parse({ Development: "Developer Tools" })).not.toThrow();
    expect(() => CategoriesGamesSchema.parse({ ActionGame: "Action" })).not.toThrow();
  });

  it("rejects a value that isn't one of the closed set of known labels — catches a respelling like 'Photos & Video' before it becomes a silent orphan category", () => {
    expect(() => CategoriesAppsSchema.parse({ Development: "Dev Tools" })).toThrow(
      "Invalid option",
    );
    expect(() => CategoriesGamesSchema.parse({ ActionGame: "Action Games" })).toThrow(
      "Invalid option",
    );
  });

  it("allows any key at all — freedesktop tag vocabulary is open-ended, only the label side is locked", () => {
    expect(() =>
      CategoriesAppsSchema.parse({ SomeBrandNewFreedesktopKey: "Utilities" }),
    ).not.toThrow();
  });
});
