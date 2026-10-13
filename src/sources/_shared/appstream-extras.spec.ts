import { describe, expect, it } from "vitest";
import {
  pickPlayableVideo,
  summarizeBrandColors,
  summarizeContentRating,
  summarizeKudos,
  summarizeRelations,
} from "./appstream-extras";

describe("summarizeBrandColors", () => {
  it("takes the primary color of each scheme, lowercased", () => {
    expect(
      summarizeBrandColors([
        { type: "primary", scheme: "dark", value: "#1E3A8A" },
        { type: "primary", scheme: "light", value: "#BFDBFE" },
      ]),
    ).toEqual({ light: "#bfdbfe", dark: "#1e3a8a" });
  });

  it("lets a color without a scheme fill the schemes the app doesn't declare", () => {
    expect(summarizeBrandColors([{ type: "primary", value: "#336699" }])).toEqual({
      light: "#336699",
      dark: "#336699",
    });
    expect(
      summarizeBrandColors([
        { type: "primary", value: "#336699" },
        { type: "primary", scheme: "dark", value: "#112233" },
      ]),
    ).toEqual({ light: "#336699", dark: "#112233" });
  });

  it("drops anything but a plain #rrggbb: the value ends up in CSS", () => {
    expect(
      summarizeBrandColors([
        { type: "primary", scheme: "light", value: "red" },
        { type: "primary", scheme: "dark", value: "#abc" },
        { type: "primary", value: "#123456;background:url(//evil)" },
        { type: "primary", value: "url(javascript:alert(1))" },
      ]),
    ).toBeUndefined();
  });

  it("ignores a color of another type", () => {
    expect(
      summarizeBrandColors([{ type: "secondary", scheme: "light", value: "#336699" }]),
    ).toBeUndefined();
  });
});

describe("summarizeKudos", () => {
  it("trims, deduplicates and keeps the order", () => {
    expect(summarizeKudos([" HiDpiIcon", "HighContrast", "HiDpiIcon", ""])).toEqual([
      "HiDpiIcon",
      "HighContrast",
    ]);
    expect(summarizeKudos([])).toBeUndefined();
  });
});

describe("summarizeContentRating", () => {
  it("takes the highest age among the attributes and the strongest intensity", () => {
    expect(
      summarizeContentRating([
        { id: "violence-cartoon", value: "mild" },
        { id: "social-chat", value: "moderate" },
        { id: "money-gambling", value: "intense" },
        { id: "language-humor", value: "none" },
      ]),
    ).toEqual({ system: "OARS", value: "intense", minAge: 18 });
  });

  it("is age 0, none, without any attribute", () => {
    expect(summarizeContentRating([])).toEqual({ system: "OARS", value: "none", minAge: 0 });
  });

  it("ignores an intensity or an attribute it doesn't know", () => {
    expect(
      summarizeContentRating([
        { id: "violence-cartoon", value: "mild" },
        { id: "violence-cartoon", value: "extreme" },
        { id: "made-up", value: "intense" },
      ]),
    ).toEqual({ system: "OARS", value: "intense", minAge: 3 });
  });
});

describe("summarizeRelations", () => {
  it("reads DEP-11's shape (Debian: display_length 360 + side)", () => {
    expect(
      summarizeRelations({
        requires: [
          { kind: "display_length", value: "300" },
          { kind: "display_length", value: "360", side: "longest" },
        ],
        supports: [{ kind: "control", value: "keyboard" }],
      }),
    ).toBe(
      "Requires: a screen with its shortest side at least 300 px, a screen with its longest side at least 360 px. Supports: keyboard.",
    );
  });

  it("names a component dependency with its version and a size class", () => {
    expect(
      summarizeRelations({
        requires: [
          { kind: "id", value: "net.sf.cdemu.libmirage", version: ">= 3.2.0" },
          { kind: "display_length", value: "small", compare: "ge" },
        ],
      }),
    ).toBe("Requires: net.sf.cdemu.libmirage >= 3.2.0, a display size at least small.");
  });

  it("drops relations a reader can't act on, and is undefined when nothing is left", () => {
    expect(summarizeRelations({ requires: [{ kind: "kernel", value: "Linux" }] })).toBeUndefined();
    expect(summarizeRelations({})).toBeUndefined();
  });
});

describe("pickPlayableVideo", () => {
  it("prefers MP4, then WebM, then any listed file", () => {
    expect(
      pickPlayableVideo([
        { url: "https://x.example/v.webm", container: "webm" },
        { url: "https://x.example/v.mp4", container: "mp4" },
      ]),
    ).toBe("https://x.example/v.mp4");
    expect(pickPlayableVideo([{ url: "https://x.example/v.webm" }])).toBe(
      "https://x.example/v.webm",
    );
    expect(pickPlayableVideo([{ url: "https://x.example/v.mkv" }])).toBe("https://x.example/v.mkv");
  });

  it("ignores a page that is not a file", () => {
    expect(pickPlayableVideo([{ url: "https://www.youtube.com/watch?v=abc" }])).toBeUndefined();
  });
});
