import { describe, expect, it } from "vitest";
import { hasGameDebtag, parsePackages } from "./fetch";

const FIXTURE = `Package: 0ad
Source: 0ad (0.27.0-2)
Version: 0.27.0-2+b1
Installed-Size: 54427
Maintainer: Debian Games Team <pkg-games-devel@lists.alioth.debian.org>
Architecture: amd64
Depends: 0ad-data (>= 0.27.0), libc6 (>= 2.39),
 libstdc++6 (>= 14)
Description: Real-time strategy game of ancient warfare
 A real-time strategy game set 500 years before the founding of Rome.
 Long description continues here.
Homepage: https://play0ad.com/
Section: games
Priority: optional
Tag: game::strategy, interface::graphical, interface::x11, role::program,
 uitoolkit::sdl, uitoolkit::wxwidgets, use::gameplaying

Package: 0ad-data
Version: 0.27.0-1
Installed-Size: 3433612
Architecture: all
Description: Real-time strategy game of ancient warfare (data files)
Section: games
Priority: optional
`;

describe("parsePackages", () => {
  const entries = parsePackages(FIXTURE, "main");

  it("parses every stanza", () => {
    expect(entries.map((entry) => entry.name)).toEqual(["0ad", "0ad-data"]);
  });

  it("keeps only the short description, dropping continuation lines", () => {
    expect(entries[0]?.description).toBe("Real-time strategy game of ancient warfare");
  });

  it("extracts version and homepage", () => {
    expect(entries[0]?.version).toBe("0.27.0-2+b1");
    expect(entries[0]?.homepage).toBe("https://play0ad.com/");
  });

  it("leaves homepage undefined when the field is absent", () => {
    expect(entries[1]?.homepage).toBeUndefined();
  });

  it("stamps every row with the given component", () => {
    expect(entries.every((entry) => entry.component === "main")).toBe(true);
  });

  it("extracts the Section field", () => {
    expect(entries[0]?.section).toBe("games");
  });

  it("leaves section undefined when the field is absent", () => {
    const noSection = parsePackages("Package: bare\nVersion: 1\n", "main");
    expect(noSection[0]?.section).toBeUndefined();
  });

  it("returns an empty array for text with no stanzas", () => {
    expect(parsePackages("", "main")).toEqual([]);
  });

  it("sets hasGameCategory from a wrapped Tag field's game::/use::gameplaying facets", () => {
    expect(entries[0]?.hasGameCategory).toBe(true);
  });

  it("leaves hasGameCategory false when the stanza has no Tag field at all", () => {
    expect(entries[1]?.hasGameCategory).toBe(false);
  });
});

describe("hasGameDebtag", () => {
  it("is true for a game::* facet", () => {
    expect(hasGameDebtag(["game::strategy", "role::program"])).toBe(true);
  });

  it("is true for the cross-cutting use::gameplaying tag alone", () => {
    expect(hasGameDebtag(["use::gameplaying", "role::program"])).toBe(true);
  });

  it("is false for unrelated tags", () => {
    expect(hasGameDebtag(["role::program", "use::analysing"])).toBe(false);
  });

  it("is false for an empty tag list", () => {
    expect(hasGameDebtag([])).toBe(false);
  });
});
