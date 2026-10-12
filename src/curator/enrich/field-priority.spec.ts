import { describe, expect, it } from "vitest";
import type { SourcedPackage } from "../../sources";
import {
  FIELD_PRIORITY,
  pickAgeRating,
  pickLanguages,
  pickLastUpdated,
  pickLicense,
  pickReleases,
  pickRichField,
} from "./field-priority";

function pkg(overrides: Partial<SourcedPackage>): SourcedPackage {
  return {
    source: "flatpak-flathub",
    name: "Example",
    description: "An example package.",
    version: "1.0.0",
    ...overrides,
  };
}

describe("pickRichField", () => {
  it("follows the field's own order, not the representative's", () => {
    const packages = [
      pkg({ source: "snap-snapcraft", iconUrl: "https://snap/icon.png" }),
      pkg({ source: "deb-debian-appstream", iconUrl: "https://debian/icon.png" }),
    ];
    expect(pickRichField("iconUrl", packages, (p) => p.iconUrl)).toBe("https://debian/icon.png");
  });

  it("never takes a value from a source the field doesn't list", () => {
    const packages = [pkg({ source: "deb-debian", developer: "Debian Games Team" })];
    expect(pickRichField("developer", packages, (p) => p.developer)).toBeUndefined();
  });

  it("prefers any default build over a better-ranked source's variant", () => {
    const packages = [
      pkg({ source: "flatpak-flathub", track: "esr", longDescription: "The ESR line." }),
      pkg({ source: "rpm-fedora-appstream", longDescription: "The browser." }),
    ];
    expect(pickRichField("longDescription", packages, (p) => p.longDescription)).toBe(
      "The browser.",
    );
  });

  it("treats a snap's edge channel as a variant", () => {
    const packages = [
      pkg({ source: "snap-snapcraft", risk: "nightly", iconUrl: "https://snap/edge.png" }),
      pkg({ source: "lutris", iconUrl: "https://lutris/icon.png" }),
    ];
    expect(pickRichField("iconUrl", packages, (p) => p.iconUrl)).toBe("https://lutris/icon.png");
  });

  it("skips blank strings and empty arrays", () => {
    const packages = [
      pkg({ source: "flatpak-flathub", screenshots: [] }),
      pkg({ source: "gog", screenshots: ["https://gog/1.png"] }),
    ];
    expect(pickRichField("screenshots", packages, (p) => p.screenshots)).toEqual([
      "https://gog/1.png",
    ]);
  });

  it("takes a snap's publisher, ranked by GOG's", () => {
    const packages = [
      pkg({ source: "gog", publisher: "CD Projekt" }),
      pkg({ source: "snap-snapcraft", publisher: "VideoLAN" }),
    ];
    expect(pickRichField("publisher", packages, (p) => p.publisher)).toBe("VideoLAN");
  });

  it("lists every source once per field", () => {
    for (const order of Object.values(FIELD_PRIORITY)) {
      expect(new Set(order).size).toBe(order.length);
    }
  });
});

describe("pickLicense", () => {
  it("prefers upstream's declaration over a packager's", () => {
    const packages = [
      pkg({ source: "rpm-fedora", license: "MIT" }),
      pkg({ source: "flatpak-flathub", license: "GPL-3.0-or-later" }),
    ];
    expect(pickLicense(packages).license).toBe("GPL-3.0-or-later");
  });

  it("skips licenses that say nothing", () => {
    const packages = [
      pkg({ source: "snap-snapcraft", license: "Other" }),
      pkg({ source: "pacman-aur", license: "custom" }),
      pkg({ source: "pacman-arch", license: "MIT" }),
    ];
    expect(pickLicense(packages)).toEqual({
      license: "MIT",
      licenseSpdx: "MIT",
      licenseKind: "free",
    });
  });

  it("borrows the SPDX form from a lower-ranked source that agrees", () => {
    const packages = [
      pkg({ source: "flatpak-flathub", license: "GPL3" }),
      pkg({ source: "rpm-fedora", license: "GPL-3.0-or-later" }),
    ];
    expect(pickLicense(packages)).toEqual({
      license: "GPL3",
      licenseSpdx: "GPL-3.0-or-later",
      licenseKind: "free",
    });
  });

  it("doesn't borrow the SPDX form from a source that disagrees", () => {
    const packages = [
      pkg({ source: "flatpak-flathub", license: "GPL3" }),
      pkg({ source: "rpm-fedora", license: "MIT" }),
    ];
    expect(pickLicense(packages).licenseSpdx).toBeUndefined();
  });

  it("skips Snap's unset and Other Open Source licenses", () => {
    const packages = [
      pkg({ source: "snap-snapcraft", license: "unset" }),
      pkg({ source: "appimage", license: "Other Open Source" }),
    ];
    expect(pickLicense(packages)).toEqual({});
  });

  it("takes a snap's license when no AppStream or packager states one", () => {
    const packages = [
      pkg({ source: "snap-snapcraft", license: "GPL-2.0+" }),
      pkg({ source: "pacman-aur", license: "GPL" }),
    ];
    expect(pickLicense(packages).license).toBe("GPL-2.0+");
  });

  it("doesn't borrow a distro's own LicenseRef identifiers as the SPDX form", () => {
    const packages = [
      pkg({ source: "flatpak-flathub", license: "GPL-2.0+ and CC-BY-SA" }),
      pkg({
        source: "rpm-fedora",
        license: "GPL-2.0-or-later AND LicenseRef-Callaway-BSD AND CC-BY-SA-3.0",
      }),
    ];
    expect(pickLicense(packages).licenseSpdx).toBeUndefined();
  });

  it("keeps a custom or LicenseRef license: it says something", () => {
    const packages = [
      pkg({
        source: "flatpak-flathub",
        license: "LicenseRef-proprietary=https://example.org/eula",
      }),
      pkg({ source: "pacman-aur", license: "MIT" }),
    ];
    expect(pickLicense(packages).license).toBe("LicenseRef-proprietary=https://example.org/eula");
  });

  it("is empty when no package has a usable license", () => {
    expect(pickLicense([pkg({ license: "unknown" })])).toEqual({});
  });
});

describe("pickAgeRating", () => {
  it("takes the strictest minimum age among the sources", () => {
    const packages = [
      pkg({ source: "flatpak-flathub", ageRating: { system: "OARS", value: "mild", minAge: 3 } }),
      pkg({ source: "gog", ageRating: { system: "PEGI", value: "16", minAge: 16 } }),
      pkg({
        source: "deb-debian-appstream",
        ageRating: { system: "OARS", value: "mild", minAge: 9 },
      }),
    ];
    expect(pickAgeRating(packages)).toEqual({ system: "min-age", value: "16" });
  });

  it("keeps age 0 (all ages) and is undefined without any rating", () => {
    expect(
      pickAgeRating([
        pkg({ source: "flatpak-flathub", ageRating: { system: "OARS", value: "none", minAge: 0 } }),
      ]),
    ).toEqual({ system: "min-age", value: "0" });
    expect(pickAgeRating([pkg({})])).toBeUndefined();
  });

  it("ignores a source the field doesn't list", () => {
    expect(
      pickAgeRating([
        pkg({ source: "snap-snapcraft", ageRating: { system: "OARS", value: "x", minAge: 18 } }),
      ]),
    ).toBeUndefined();
  });
});

describe("pickLanguages", () => {
  it("takes the longest list, not the best-ranked one", () => {
    const packages = [
      pkg({ source: "flatpak-appcenter", languages: ["en_US"] }),
      pkg({ source: "deb-debian-appstream", languages: ["de", "fr", "ja"] }),
    ];
    expect(pickLanguages(packages)).toEqual(["de", "fr", "ja"]);
  });
});

describe("pickLastUpdated", () => {
  it("ignores nightlies and parallel lines when a default build has a date", () => {
    const packages = [
      pkg({ source: "flatpak-flathub", lastUpdated: "2026-05-01" }),
      pkg({ source: "flatpak-flathub", risk: "nightly", lastUpdated: "2026-10-11" }),
      pkg({ source: "rpm-fedora-appstream", track: "esr", lastUpdated: "2026-09-30" }),
    ];
    expect(pickLastUpdated(packages)).toBe("2026-05-01");
  });

  it("takes the newest date across default builds", () => {
    const packages = [
      pkg({ source: "flatpak-flathub", lastUpdated: "2026-05-01" }),
      pkg({ source: "deb-debian-appstream", lastUpdated: "2026-06-12" }),
    ];
    expect(pickLastUpdated(packages)).toBe("2026-06-12");
  });

  it("falls back to variants when only they have a date", () => {
    expect(pickLastUpdated([pkg({ risk: "beta", lastUpdated: "2026-10-01" })])).toBe("2026-10-01");
  });
});

describe("pickReleases", () => {
  it("keeps the changelog with the releases it describes", () => {
    const packages = [
      pkg({
        source: "flatpak-flathub",
        releases: [{ version: "2.0" }],
      }),
      pkg({
        source: "deb-debian-appstream",
        releases: [{ version: "1.4" }],
        changelog: "Notes for 1.4.",
      }),
    ];
    expect(pickReleases(packages)).toEqual({
      releases: [{ version: "2.0" }],
      changelog: undefined,
    });
  });

  it("takes another package's changelog for the same version", () => {
    const packages = [
      pkg({ source: "flatpak-flathub", releases: [{ version: "2.0" }] }),
      pkg({
        source: "rpm-fedora-appstream",
        releases: [{ version: "2.0" }],
        changelog: "Notes for 2.0.",
      }),
    ];
    expect(pickReleases(packages).changelog).toBe("Notes for 2.0.");
  });

  it("never lists a parallel line's releases", () => {
    const packages = [
      pkg({ source: "flatpak-flathub", track: "esr", releases: [{ version: "128.3esr" }] }),
      pkg({ source: "rpm-fedora-appstream", releases: [{ version: "131.0" }] }),
    ];
    expect(pickReleases(packages).releases).toEqual([{ version: "131.0" }]);
  });
});
