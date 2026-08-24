import { describe, expect, it } from "vitest";
import type { SourcedPackage } from "@tuxery/sources";
import {
  getCompatWarnings,
  loadCompatWarnings,
  type CompatWarningEntry,
} from "./compat-warnings";

function pkg(overrides: Partial<SourcedPackage>): SourcedPackage {
  return { source: "deb-debian", name: "example", description: "", version: "1.0", ...overrides };
}

describe("getCompatWarnings", () => {
  const entries: CompatWarningEntry[] = [
    {
      // Snapcraft's own normalize.ts uses the display *title* ("GNOME
      // Boxes"), not the raw snap name ("gnome-boxes"), as
      // SourcedPackage.name — real bug, found live: the override
      // originally used the raw snap name and silently never matched
      // anything, since `getCompatWarnings` matches on `pkg.name`.
      source: "snap-snapcraft",
      name: "GNOME Boxes",
      severity: "warning",
      issue: "Snap confinement blocks KVM access.",
      fix: "sudo snap connect gnome-boxes:kvm",
      reason: "test",
    },
    {
      source: "flatpak-flathub",
      name: "Boxes",
      severity: "info",
      issue: "May show a No KVM error.",
      fix: "flatpak override --user --env=LIBVIRT_DEFAULT_URI=qemu:///session org.gnome.Boxes",
      reason: "test",
    },
  ];

  it("returns a warning for a matching {source, name} pair", () => {
    const warnings = getCompatWarnings(
      [pkg({ source: "snap-snapcraft", name: "GNOME Boxes" })],
      entries,
    );

    expect(warnings).toEqual([
      {
        source: "snap-snapcraft",
        severity: "warning",
        issue: "Snap confinement blocks KVM access.",
        fix: "sudo snap connect gnome-boxes:kvm",
      },
    ]);
  });

  it("returns one warning per affected source when an app has more than one — the merged-app case", () => {
    const packages = [
      pkg({ source: "snap-snapcraft", name: "GNOME Boxes" }),
      pkg({ source: "flatpak-flathub", name: "Boxes" }),
      pkg({ source: "deb-debian", name: "gnome-boxes" }),
    ];

    const warnings = getCompatWarnings(packages, entries);
    expect(warnings).toHaveLength(2);
    const sources = warnings.map((w) => w.source);
    // oxlint-disable-next-line unicorn/no-array-sort -- `sources` is a fresh array; toSorted needs ES2023 lib
    expect(sources.sort()).toEqual(["flatpak-flathub", "snap-snapcraft"]);
  });

  it("requires both source and name to match, not name alone", () => {
    // "GNOME Boxes" is on the list, but only for snap-snapcraft.
    expect(
      getCompatWarnings([pkg({ source: "deb-debian", name: "GNOME Boxes" })], entries),
    ).toEqual([]);
  });

  it("returns an empty array for an app with no known issue", () => {
    expect(getCompatWarnings([pkg({ name: "firefox" })], entries)).toEqual([]);
  });
});

describe("loadCompatWarnings", () => {
  it("reads the real override file and includes the verified real GNOME Boxes entries", () => {
    const entries = loadCompatWarnings();

    expect(
      entries.some((e) => e.source === "snap-snapcraft" && e.name === "GNOME Boxes"),
    ).toBe(true);
    expect(entries.some((e) => e.source === "flatpak-flathub" && e.name === "Boxes")).toBe(true);
  });
});
