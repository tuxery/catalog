import { describe, expect, it } from "vitest";
import type { SourcedPackage } from "../../sources";
import {
  categoryFromAurKeywords,
  gameGenreFromAurKeywords,
  hasAurKeywordGameEvidence,
} from "./category-keywords";

function pkg(overrides: Partial<SourcedPackage>): SourcedPackage {
  return { source: "pacman-aur", name: "example", description: "", version: "1.0", ...overrides };
}

describe("categoryFromAurKeywords", () => {
  it("maps verified AUR keywords to their app-taxonomy category", () => {
    expect(categoryFromAurKeywords(pkg({ keywords: ["emulator"] }))).toBe("System Tools");
    expect(categoryFromAurKeywords(pkg({ keywords: ["backup"] }))).toBe("System Tools");
    expect(categoryFromAurKeywords(pkg({ keywords: ["minecraft"] }))).toBe("System Tools");
    expect(categoryFromAurKeywords(pkg({ keywords: ["docker"] }))).toBe("Developer Tools");
    expect(categoryFromAurKeywords(pkg({ keywords: ["vpn"] }))).toBe("Security");
    expect(categoryFromAurKeywords(pkg({ keywords: ["calculator"] }))).toBe("Utilities");
    expect(categoryFromAurKeywords(pkg({ keywords: ["wine"] }))).toBe("Utilities");
    expect(categoryFromAurKeywords(pkg({ keywords: ["dictionary"] }))).toBe("Books & Reference");
    expect(categoryFromAurKeywords(pkg({ keywords: ["science"] }))).toBe("Science");
    expect(categoryFromAurKeywords(pkg({ keywords: ["music"] }))).toBe("Music & Audio");
    expect(categoryFromAurKeywords(pkg({ keywords: ["ttf"] }))).toBe("Graphics & Design");
    expect(categoryFromAurKeywords(pkg({ keywords: ["icons"] }))).toBe("Graphics & Design");
    expect(categoryFromAurKeywords(pkg({ keywords: ["telegram"] }))).toBe(
      "Internet & Communication",
    );
  });

  it("maps the 2026-09-04 keyword additions (finance, radio, science, security, battery, todo)", () => {
    expect(categoryFromAurKeywords(pkg({ keywords: ["wallet"] }))).toBe("Finance");
    expect(categoryFromAurKeywords(pkg({ keywords: ["cryptocurrency"] }))).toBe("Finance");
    expect(categoryFromAurKeywords(pkg({ keywords: ["bitcoin"] }))).toBe("Finance");
    expect(categoryFromAurKeywords(pkg({ keywords: ["blockchain"] }))).toBe("Finance");
    expect(categoryFromAurKeywords(pkg({ keywords: ["accounting"] }))).toBe("Finance");
    expect(categoryFromAurKeywords(pkg({ keywords: ["ham"] }))).toBe("Internet & Communication");
    expect(categoryFromAurKeywords(pkg({ keywords: ["hamradio"] }))).toBe(
      "Internet & Communication",
    );
    expect(categoryFromAurKeywords(pkg({ keywords: ["sdr"] }))).toBe("Internet & Communication");
    expect(categoryFromAurKeywords(pkg({ keywords: ["astronomy"] }))).toBe("Science");
    expect(categoryFromAurKeywords(pkg({ keywords: ["encryption"] }))).toBe("Security");
    expect(categoryFromAurKeywords(pkg({ keywords: ["password"] }))).toBe("Security");
    expect(categoryFromAurKeywords(pkg({ keywords: ["battery"] }))).toBe("System Tools");
    expect(categoryFromAurKeywords(pkg({ keywords: ["todo"] }))).toBe("Productivity");
  });

  it("matches keywords case-insensitively", () => {
    expect(categoryFromAurKeywords(pkg({ keywords: ["Backup"] }))).toBe("System Tools");
  });

  it("returns undefined for a game-keyworded package — the game path owns those", () => {
    expect(categoryFromAurKeywords(pkg({ keywords: ["game"] }))).toBeUndefined();
    expect(categoryFromAurKeywords(pkg({ keywords: ["game", "backup"] }))).toBeUndefined();
  });

  it("returns undefined for rejected ambiguous keywords (terminal, network, editor, git)", () => {
    expect(categoryFromAurKeywords(pkg({ keywords: ["terminal"] }))).toBeUndefined();
    expect(categoryFromAurKeywords(pkg({ keywords: ["network"] }))).toBeUndefined();
    expect(categoryFromAurKeywords(pkg({ keywords: ["editor"] }))).toBeUndefined();
    expect(categoryFromAurKeywords(pkg({ keywords: ["git"] }))).toBeUndefined();
  });

  it("only applies to pacman-aur", () => {
    expect(
      categoryFromAurKeywords(pkg({ source: "deb-debian", keywords: ["backup"] })),
    ).toBeUndefined();
  });

  it("returns undefined without keywords", () => {
    expect(categoryFromAurKeywords(pkg({ keywords: [] }))).toBeUndefined();
    expect(categoryFromAurKeywords(pkg({ keywords: undefined }))).toBeUndefined();
  });
});

describe("gameGenreFromAurKeywords", () => {
  it("maps genre keywords to their categories-games.json genre", () => {
    expect(gameGenreFromAurKeywords(pkg({ keywords: ["rpg"] }))).toBe("Role-Playing");
    expect(gameGenreFromAurKeywords(pkg({ keywords: ["roguelike"] }))).toBe("Role-Playing");
    expect(gameGenreFromAurKeywords(pkg({ keywords: ["strategy"] }))).toBe("Strategy");
    expect(gameGenreFromAurKeywords(pkg({ keywords: ["puzzle"] }))).toBe("Puzzle");
    expect(gameGenreFromAurKeywords(pkg({ keywords: ["arcade"] }))).toBe("Arcade");
    expect(gameGenreFromAurKeywords(pkg({ keywords: ["fps"] }))).toBe("Action");
    expect(gameGenreFromAurKeywords(pkg({ keywords: ["simulation"] }))).toBe("Simulation");
    expect(gameGenreFromAurKeywords(pkg({ keywords: ["racing"] }))).toBe("Sports");
    expect(gameGenreFromAurKeywords(pkg({ keywords: ["adventure"] }))).toBe("Adventure");
    expect(gameGenreFromAurKeywords(pkg({ keywords: ["boardgame"] }))).toBe("Board & Cards");
  });

  it("returns undefined for non-genre keywords (indie, retro, platform)", () => {
    expect(gameGenreFromAurKeywords(pkg({ keywords: ["indie"] }))).toBeUndefined();
    expect(gameGenreFromAurKeywords(pkg({ keywords: ["retro"] }))).toBeUndefined();
    expect(gameGenreFromAurKeywords(pkg({ keywords: ["platform"] }))).toBeUndefined();
  });

  it("only applies to pacman-aur", () => {
    expect(
      gameGenreFromAurKeywords(pkg({ source: "deb-debian", keywords: ["rpg"] })),
    ).toBeUndefined();
  });
});

describe("hasAurKeywordGameEvidence", () => {
  it("is positive game evidence for the AUR's own game/games keyword", () => {
    expect(hasAurKeywordGameEvidence(pkg({ keywords: ["game"] }))).toBe(true);
    expect(hasAurKeywordGameEvidence(pkg({ keywords: ["games"] }))).toBe(true);
    expect(hasAurKeywordGameEvidence(pkg({ keywords: ["2048", "game", "python"] }))).toBe(true);
  });

  it("is stripped by a tool keyword riding alongside — mislabeled tools for games", () => {
    expect(hasAurKeywordGameEvidence(pkg({ keywords: ["game", "launcher", "patcher"] }))).toBe(
      false,
    );
    expect(hasAurKeywordGameEvidence(pkg({ keywords: ["games", "streaming", "vr"] }))).toBe(false);
    expect(hasAurKeywordGameEvidence(pkg({ keywords: ["game", "client"] }))).toBe(false);
  });

  it("only applies to pacman-aur", () => {
    expect(hasAurKeywordGameEvidence(pkg({ source: "deb-debian", keywords: ["game"] }))).toBe(
      false,
    );
  });

  it("returns false without keywords", () => {
    expect(hasAurKeywordGameEvidence(pkg({ keywords: undefined }))).toBe(false);
  });
});
