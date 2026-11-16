import { describe, expect, it } from "vitest";
import {
  mapCask,
  mapFormula,
  onLinux,
  parseInstallCounts,
  withPopularity,
  type RawCask,
  type RawFormula,
} from "./fetch";

// Rows of formula.json and cask.json (2026-11-15), cut down to the fields read.
const MACOS_BOTTLES = { arm64_tahoe: {}, arm64_sequoia: {}, sonoma: {} };
const LINUX_BOTTLES = { ...MACOS_BOTTLES, arm64_linux: {}, x86_64_linux: {} };

const WGET: RawFormula = {
  name: "wget",
  desc: "Internet file retriever",
  homepage: "https://www.gnu.org/software/wget/",
  license: "GPL-3.0-or-later",
  tap: "homebrew/core",
  versions: { stable: "1.25.0" },
  bottle: { stable: { files: LINUX_BOTTLES } },
  requirements: [],
  executables: ["wget"],
  service: null,
  deprecated: false,
  disabled: false,
  variations: {},
};

const MACOS_PLATFORMS = ["tahoe", "arm64_tahoe", "sequoia", "arm64_sequoia"];

const HEROIC: RawCask = {
  token: "heroic",
  name: ["Heroic Games Launcher"],
  desc: "Game launcher",
  homepage: "https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/",
  version: "2.22.4",
  tap: "homebrew/cask",
  supported_platforms: [...MACOS_PLATFORMS, "x86_64_linux"],
  deprecated: false,
  disabled: false,
  variations: {},
};

describe("mapFormula", () => {
  it("maps a formula with a Linux bottle", () => {
    expect(mapFormula(WGET)).toEqual({
      kind: "formula",
      name: "wget",
      desc: "Internet file retriever",
      version: "1.25.0",
      homepage: "https://www.gnu.org/software/wget/",
      license: "GPL-3.0-or-later",
      tap: "homebrew/core",
      deprecated: undefined,
      executables: 1,
      service: undefined,
    });
  });

  it("drops a formula built for macOS only", () => {
    const afsctool: RawFormula = {
      ...WGET,
      name: "afsctool",
      bottle: { stable: { files: MACOS_BOTTLES } },
      requirements: [{ name: "macos", version: null, specs: ["stable", "head"] }],
    };
    expect(mapFormula(afsctool)).toBeUndefined();
  });

  it("drops a formula with no bottle at all", () => {
    expect(mapFormula({ ...WGET, name: "portable-zlib", bottle: {} })).toBeUndefined();
  });

  it("keeps a formula whose one bottle serves every platform, unless it depends on macOS", () => {
    const anyPlatform = { stable: { files: { all: {} } } };
    expect(mapFormula({ ...WGET, name: "antigen", bottle: anyPlatform })?.name).toBe("antigen");
    const fileicon: RawFormula = {
      ...WGET,
      name: "fileicon",
      bottle: anyPlatform,
      requirements: [{ name: "macos", version: null, specs: ["stable"] }],
    };
    expect(mapFormula(fileicon)).toBeUndefined();
  });

  it("reads a versioned macOS requirement as a minimum for macOS users, not as macOS only", () => {
    const script: RawFormula = {
      ...WGET,
      bottle: { stable: { files: { all: {} } } },
      requirements: [{ name: "macos", version: "13", specs: ["stable", "head"] }],
    };
    expect(mapFormula(script)).toBeDefined();
  });

  it("ignores a macOS requirement that only applies to the HEAD build", () => {
    const script: RawFormula = {
      ...WGET,
      bottle: { stable: { files: { all: {} } } },
      requirements: [{ name: "macos", version: null, specs: ["head"] }],
    };
    expect(mapFormula(script)).toBeDefined();
  });

  it("drops a disabled formula and flags a deprecated one", () => {
    expect(mapFormula({ ...WGET, deprecated: true, disabled: true })).toBeUndefined();
    expect(mapFormula({ ...WGET, name: "aamath", deprecated: true })?.deprecated).toBe(true);
  });

  it("reads what Linux changes from the formula's variations", () => {
    const linuxOnlyDeprecation: RawFormula = {
      ...WGET,
      name: "arturo",
      variations: { x86_64_linux: { deprecated: true }, arm64_linux: { deprecated: true } },
    };
    expect(mapFormula(linuxOnlyDeprecation)?.deprecated).toBe(true);
  });

  it("counts the commands, tells none from an unknown list, and notes a service", () => {
    expect(mapFormula({ ...WGET, name: "abseil", executables: [] })?.executables).toBe(0);
    expect(mapFormula({ ...WGET, name: "btrfs-progs", executables: undefined })).not.toHaveProperty(
      "executables",
      expect.anything(),
    );
    const bitlbee = mapFormula({ ...WGET, name: "bitlbee", executables: [], service: { run: [] } });
    expect(bitlbee).toMatchObject({ executables: 0, service: true });
  });
});

describe("mapCask", () => {
  it("maps a cask that supports Linux, with its display name", () => {
    expect(mapCask(HEROIC)).toEqual({
      kind: "cask",
      name: "heroic",
      title: "Heroic Games Launcher",
      desc: "Game launcher",
      version: "2.22.4",
      homepage: "https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/",
      tap: "homebrew/cask",
      deprecated: undefined,
    });
  });

  it("drops a macOS-only cask, even though it has Linux variations", () => {
    const zeroAd: RawCask = {
      ...HEROIC,
      token: "0-ad",
      supported_platforms: MACOS_PLATFORMS,
      variations: { x86_64_linux: {}, arm64_linux: {} },
    };
    expect(mapCask(zeroAd)).toBeUndefined();
  });

  it("drops font casks", () => {
    const font: RawCask = {
      ...HEROIC,
      token: "font-0xproto",
      name: ["0xProto"],
      desc: null,
      supported_platforms: [...MACOS_PLATFORMS, "x86_64_linux", "arm64_linux"],
    };
    expect(mapCask(font)).toBeUndefined();
  });

  it("drops a disabled cask, unless it is only disabled on macOS", () => {
    expect(mapCask({ ...HEROIC, token: "codexia", disabled: true })).toBeUndefined();
    const stillOnLinux: RawCask = {
      ...HEROIC,
      disabled: true,
      variations: { x86_64_linux: { disabled: false } },
    };
    expect(mapCask(stillOnLinux)).toBeDefined();
  });

  it("takes the version Linux gets", () => {
    const zoom: RawCask = {
      ...HEROIC,
      token: "zoom",
      version: "7.2.5.90525",
      variations: { x86_64_linux: { version: "7.2.5.6661" } },
    };
    expect(mapCask(zoom)?.version).toBe("7.2.5.6661");
  });
});

describe("onLinux", () => {
  it("applies the ARM variation when Linux is only supported there", () => {
    const raw: RawCask = {
      token: "example",
      version: "1",
      variations: { x86_64_linux: { version: "2" }, arm64_linux: { version: "3" } },
    };
    expect(onLinux(raw, ["arm64_linux"]).version).toBe("3");
    expect(onLinux(raw, ["x86_64_linux", "arm64_linux"]).version).toBe("2");
    expect(onLinux(raw, ["all"]).version).toBe("2");
    expect(onLinux<RawCask>({ token: "example", version: "1" }, ["x86_64_linux"]).version).toBe(
      "1",
    );
  });
});

describe("parseInstallCounts", () => {
  it("reads the plain variant's count, thousands separators removed", () => {
    const counts = parseInstallCounts({
      formulae: {
        wget: [
          { formula: "wget", count: "30,536" },
          { formula: "wget --HEAD", count: "50" },
        ],
        bitlbee: [{ formula: "bitlbee", count: "16" }],
        "head-only": [{ formula: "head-only --HEAD", count: "3" }],
      },
    });
    expect([...counts]).toEqual([
      ["wget", 30536],
      ["bitlbee", 16],
    ]);
  });

  it("is empty for a file without formulae", () => {
    expect(parseInstallCounts({}).size).toBe(0);
  });
});

describe("withPopularity", () => {
  it("ranks the formulae given among themselves and leaves the uncounted ones unscored", () => {
    const formulae = ["wget", "abseil", "bitlbee", "unused"].flatMap(
      (name) => mapFormula({ ...WGET, name }) ?? [],
    );
    const installs = new Map([
      ["wget", 30536],
      ["abseil", 431],
      ["bitlbee", 16],
      ["macos-only", 99999],
    ]);
    expect(withPopularity(formulae, installs).map((entry) => entry.popularity)).toEqual([
      1,
      0.5,
      0,
      undefined,
    ]);
  });
});
