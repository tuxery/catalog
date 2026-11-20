import { describe, expect, it } from "vitest";
import { TO_CLASSIFY } from "./category";
import { applyDisplayNames } from "./display-name";
import type { CatalogApp } from "./types";

function app(id: string, name: string): CatalogApp {
  return {
    id,
    name,
    shortDescription: "",
    category: TO_CLASSIFY,
    packages: [],
    dataConfidence: { score: 0, signals: [] },
  };
}

describe("applyDisplayNames", () => {
  it("renames the listed app only", () => {
    const gimp = app("gimp", "GNU Image Manipulation Program");
    const eog = app("eog", "Eye of GNOME");

    applyDisplayNames([gimp, eog], [{ appId: "gimp", name: "GIMP", reason: "test" }]);

    expect(gimp.name).toBe("GIMP");
    expect(eog.name).toBe("Eye of GNOME");
  });

  it("skips an id that no longer resolves", () => {
    const gimp = app("gimp", "GNU Image Manipulation Program");
    applyDisplayNames([gimp], [{ appId: "gone", name: "Gone", reason: "test" }]);
    expect(gimp.name).toBe("GNU Image Manipulation Program");
  });
});
