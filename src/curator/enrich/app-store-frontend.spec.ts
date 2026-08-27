import { describe, expect, it } from "vitest";
import type { SourcedPackage } from "../../sources";
import {
  isAppStoreFrontend,
  loadAppStoreFrontends,
  type AppStoreFrontendEntry,
} from "./app-store-frontend";

function pkg(overrides: Partial<SourcedPackage>): SourcedPackage {
  return { source: "deb-debian", name: "example", description: "", version: "1.0", ...overrides };
}

describe("isAppStoreFrontend", () => {
  const frontends: AppStoreFrontendEntry[] = [
    { source: "deb-debian", name: "gnome-software", reason: "test" },
    { source: "pacman-aur", name: "octopi", reason: "test" },
  ];

  it("matches a package on the list", () => {
    expect(isAppStoreFrontend([pkg({ name: "gnome-software" })], frontends)).toBe(true);
  });

  it("matches when any member package (not just the first) is on the list", () => {
    const packages = [pkg({ name: "firefox" }), pkg({ source: "pacman-aur", name: "octopi" })];
    expect(isAppStoreFrontend(packages, frontends)).toBe(true);
  });

  it("requires both source and name to match, not name alone", () => {
    // "gnome-software" exists on the list, but only for deb-debian.
    expect(
      isAppStoreFrontend([pkg({ source: "pacman-aur", name: "gnome-software" })], frontends),
    ).toBe(false);
  });

  it("does not match an unrelated package", () => {
    expect(isAppStoreFrontend([pkg({ name: "firefox" })], frontends)).toBe(false);
  });
});

describe("loadAppStoreFrontends", () => {
  it("reads the real override file and includes the verified real entries", () => {
    const frontends = loadAppStoreFrontends();

    expect(frontends.some((f) => f.source === "deb-debian" && f.name === "gnome-software")).toBe(
      true,
    );
    expect(frontends.some((f) => f.source === "pacman-aur" && f.name === "octopi")).toBe(true);
    expect(frontends.some((f) => f.source === "deb-ubuntu" && f.name === "synaptic")).toBe(true);
  });
});
