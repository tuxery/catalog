import { describe, expect, it } from "vitest";
import { extractPrefix, mapPackages } from "./fetch";

describe("extractPrefix", () => {
  it("returns the part before the first dot", () => {
    expect(extractPrefix("kdePackages.akregator")).toBe("kdePackages");
  });

  it("returns undefined for a top-level attribute with no dot", () => {
    expect(extractPrefix("firefox")).toBeUndefined();
  });

  it("only splits on the first dot, keeping the rest together", () => {
    expect(extractPrefix("androidenv.androidPkgs.all.addons.v10.google_apis")).toBe("androidenv");
  });
});

describe("mapPackages", () => {
  it("maps a package to a cache entry, deriving the prefix from the attr path", () => {
    const packages = {
      "kdePackages.akregator": {
        pname: "akregator",
        version: "24.12.0",
        system: "x86_64-linux",
        meta: { description: "RSS Feed Reader", homepage: "https://apps.kde.org/akregator/" },
      },
    };

    expect(mapPackages(packages)).toEqual([
      {
        attrPath: "kdePackages.akregator",
        name: "akregator",
        description: "RSS Feed Reader",
        version: "24.12.0",
        homepage: "https://apps.kde.org/akregator/",
        prefix: "kdePackages",
      },
    ]);
  });

  it("leaves prefix undefined for a top-level attribute", () => {
    const packages = {
      firefox: { pname: "firefox", version: "140.0", system: "x86_64-linux", meta: {} },
    };

    expect(mapPackages(packages)[0]?.prefix).toBeUndefined();
  });

  it("drops entries for a different system", () => {
    const packages = {
      "foo.bar": { pname: "bar", version: "1", system: "i686-linux", meta: {} },
    };

    expect(mapPackages(packages)).toEqual([]);
  });

  it("drops broken packages", () => {
    const packages = {
      "foo.bar": { pname: "bar", version: "1", system: "x86_64-linux", meta: { broken: true } },
    };

    expect(mapPackages(packages)).toEqual([]);
  });

  it("drops unavailable packages", () => {
    const packages = {
      "foo.bar": {
        pname: "bar",
        version: "1",
        system: "x86_64-linux",
        meta: { available: false },
      },
    };

    expect(mapPackages(packages)).toEqual([]);
  });

  it("drops entries with no pname", () => {
    const packages = { "foo.bar": { version: "1", system: "x86_64-linux", meta: {} } };

    expect(mapPackages(packages)).toEqual([]);
  });

  it("takes the first homepage when it's an array (rare in the real data)", () => {
    const packages = {
      foo: {
        pname: "foo",
        version: "1",
        system: "x86_64-linux",
        meta: { homepage: ["https://a.example", "https://b.example"] },
      },
    };

    expect(mapPackages(packages)[0]?.homepage).toBe("https://a.example");
  });

  it("falls back gracefully when optional fields are missing", () => {
    const packages = { foo: { pname: "foo", system: "x86_64-linux" } };

    expect(mapPackages(packages)).toEqual([
      {
        attrPath: "foo",
        name: "foo",
        description: "",
        version: "unknown",
        homepage: undefined,
        prefix: undefined,
      },
    ]);
  });
});
