import { describe, expect, it } from "vitest";
import { TO_CLASSIFY } from "./category";
import { applySuites, type SuiteOverrideEntry } from "./suite";
import type { CatalogApp } from "./types";

function app(overrides: Partial<CatalogApp>): CatalogApp {
  return {
    id: "flatpak-flathub:org.example.App",
    name: "App",
    shortDescription: "",
    category: TO_CLASSIFY,
    packages: [],
    ...overrides,
  };
}

describe("applySuites", () => {
  it("sets suite on both the main app and its components", () => {
    const main = app({ id: "flatpak-flathub:org.example.Suite", name: "Suite" });
    const writer = app({ id: "deb-debian:suite-writer", name: "suite-writer" });
    const calc = app({ id: "deb-debian:suite-calc", name: "suite-calc" });
    const unrelated = app({ id: "flatpak-flathub:org.example.Other", name: "Other" });

    const suites: SuiteOverrideEntry[] = [
      {
        suiteId: "example-suite",
        suiteName: "Example Suite",
        mainAppId: main.id,
        components: [
          { appId: writer.id, name: "Example Writer" },
          { appId: calc.id, name: "Example Calc" },
        ],
        reason: "test",
      },
    ];

    applySuites([main, writer, calc, unrelated], suites);

    expect(main.suite).toEqual({
      id: "example-suite",
      name: "Example Suite",
      role: "main",
      components: [
        { id: writer.id, name: "Example Writer" },
        { id: calc.id, name: "Example Calc" },
      ],
    });
    expect(writer.suite).toEqual({
      id: "example-suite",
      name: "Example Suite",
      role: "component",
      mainApp: { id: main.id, name: "Suite" },
    });
    expect(calc.suite).toEqual({
      id: "example-suite",
      name: "Example Suite",
      role: "component",
      mainApp: { id: main.id, name: "Suite" },
    });
    expect(unrelated.suite).toBeUndefined();
  });

  it("skips a suite entirely when the main app id doesn't resolve", () => {
    const writer = app({ id: "deb-debian:suite-writer", name: "suite-writer" });
    const suites: SuiteOverrideEntry[] = [
      {
        suiteId: "example-suite",
        suiteName: "Example Suite",
        mainAppId: "flatpak-flathub:org.example.DoesNotExist",
        components: [{ appId: writer.id, name: "Example Writer" }],
        reason: "test",
      },
    ];

    applySuites([writer], suites);

    expect(writer.suite).toBeUndefined();
  });

  it("skips a suite when none of its component ids resolve", () => {
    const main = app({ id: "flatpak-flathub:org.example.Suite", name: "Suite" });
    const suites: SuiteOverrideEntry[] = [
      {
        suiteId: "example-suite",
        suiteName: "Example Suite",
        mainAppId: main.id,
        components: [{ appId: "deb-debian:does-not-exist", name: "Ghost" }],
        reason: "test",
      },
    ];

    applySuites([main], suites);

    expect(main.suite).toBeUndefined();
  });

  it("still applies the suite when only some components resolve", () => {
    const main = app({ id: "flatpak-flathub:org.example.Suite", name: "Suite" });
    const writer = app({ id: "deb-debian:suite-writer", name: "suite-writer" });
    const suites: SuiteOverrideEntry[] = [
      {
        suiteId: "example-suite",
        suiteName: "Example Suite",
        mainAppId: main.id,
        components: [
          { appId: writer.id, name: "Example Writer" },
          { appId: "deb-debian:does-not-exist", name: "Ghost" },
        ],
        reason: "test",
      },
    ];

    applySuites([main, writer], suites);

    expect(main.suite?.components).toEqual([{ id: writer.id, name: "Example Writer" }]);
    expect(writer.suite?.role).toBe("component");
  });
});
