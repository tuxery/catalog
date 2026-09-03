import { describe, expect, it } from "vitest";
import { TO_CLASSIFY } from "./category";
import { applyCompanionInheritance } from "./index";
import type { CatalogApp } from "./types";

function app(overrides: Partial<CatalogApp>): CatalogApp {
  return {
    id: "pacman-aur:example",
    name: "example",
    shortDescription: "",
    category: TO_CLASSIFY,
    packages: [],
    ...overrides,
  };
}

describe("applyCompanionInheritance", () => {
  it("inherits the base app's category for a companion-name package", () => {
    const base = app({ name: "Audacity", category: "Music & Audio" });
    const companion = app({ name: "audacity-plugins" });
    applyCompanionInheritance([base, companion]);
    expect(companion.category).toBe("Music & Audio");
  });

  it("inherits a game base's contentType and genre for a build-variant name", () => {
    const base = app({ name: "DEADBOLT", category: "Action", contentType: "game" });
    const variant = app({ name: "deadbolt-bin" });
    applyCompanionInheritance([base, variant]);
    expect(variant.category).toBe("Action");
    expect(variant.contentType).toBe("game");
  });

  it("matches base names case-insensitively and strips exactly one suffix", () => {
    const base = app({ name: "code", category: "Developer Tools" });
    const variant = app({ name: "code-server" });
    applyCompanionInheritance([base, variant]);
    expect(variant.category).toBe("Developer Tools");
  });

  it("leaves an app alone when no classified base exists, or the name is too short", () => {
    const lonely = app({ name: "nwchem-data" });
    const tooShort = app({ name: "ab-bin" });
    applyCompanionInheritance([lonely, tooShort]);
    expect(lonely.category).toBe(TO_CLASSIFY);
    expect(tooShort.category).toBe(TO_CLASSIFY);
  });

  it("never overwrites an already-resolved category", () => {
    const base = app({ name: "example", category: "Utilities" });
    const resolved = app({ name: "example-bin", category: "Security" });
    applyCompanionInheritance([base, resolved]);
    expect(resolved.category).toBe("Security");
  });
});
