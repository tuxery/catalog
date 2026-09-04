import { describe, expect, it } from "vitest";
import { parseDeb822, parseDebtags } from "./deb822";

const FIXTURE = `Package: 0ad
Version: 0.27.0-2+b1
Architecture: amd64
Depends: 0ad-data (>= 0.27.0), libc6 (>= 2.39),
 libstdc++6 (>= 14)
Description: Real-time strategy game of ancient warfare
 A real-time strategy game set 500 years before the founding of Rome.
Homepage: https://play0ad.com/
Tag: game::strategy, interface::graphical, interface::x11, role::program,
 uitoolkit::sdl, uitoolkit::wxwidgets, use::gameplaying

Package: 0ad-data
Version: 0.27.0-1
Architecture: all
Description: Real-time strategy game of ancient warfare (data files)
`;

describe("parseDeb822", () => {
  const stanzas = parseDeb822(FIXTURE);

  it("splits into one stanza per package", () => {
    expect(stanzas.map((s) => s.Package)).toEqual(["0ad", "0ad-data"]);
  });

  it("drops continuation lines, keeping only the field's first line", () => {
    expect(stanzas[0]?.Description).toBe("Real-time strategy game of ancient warfare");
  });

  it("extracts simple fields", () => {
    expect(stanzas[0]?.Version).toBe("0.27.0-2+b1");
    expect(stanzas[0]?.Homepage).toBe("https://play0ad.com/");
  });

  it("returns an empty array for text with no stanzas", () => {
    expect(parseDeb822("")).toEqual([]);
  });
});

describe("parseDebtags", () => {
  it("reconstructs a Tag field that wraps across a continuation line", () => {
    const raw = `Package: 0ad
Tag: game::strategy, interface::graphical, interface::x11, role::program,
 uitoolkit::sdl, uitoolkit::wxwidgets, use::gameplaying`;

    expect(parseDebtags(raw)).toEqual([
      "game::strategy",
      "interface::graphical",
      "interface::x11",
      "role::program",
      "uitoolkit::sdl",
      "uitoolkit::wxwidgets",
      "use::gameplaying",
    ]);
  });

  it("handles a Tag field that fits on a single line", () => {
    const raw = "Package: bare\nTag: implemented-in::c, role::program";
    expect(parseDebtags(raw)).toEqual(["implemented-in::c", "role::program"]);
  });

  it("returns an empty array when there's no Tag field", () => {
    expect(parseDebtags("Package: bare\nVersion: 1")).toEqual([]);
  });
});
