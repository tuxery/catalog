import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";
import type { FedoraCacheEntry } from "./types";

describe("fedora normalize", () => {
  it("maps a cache entry to a SourcedPackage, using the name as appId", () => {
    const entry: FedoraCacheEntry = {
      name: "0ad",
      summary: "Cross-Platform RTS Game of Ancient Warfare",
      version: "0.28.0",
      homepage: "http://play0ad.com",
      hasDesktopFile: true,
      license: "GPL-2.0-or-later AND MIT",
      builtAt: "2026-10-07T08:58:09.000Z",
      installedSizeBytes: 26731912,
    };

    expect(normalize([entry])).toEqual([
      {
        source: "rpm-fedora",
        name: "0ad",
        description: "Cross-Platform RTS Game of Ancient Warfare",
        version: "0.28.0",
        appId: "0ad",
        homepage: "http://play0ad.com",
        hasDesktopFile: true,
        license: "GPL-2.0-or-later AND MIT",
        builtAt: "2026-10-07T08:58:09.000Z",
        installedSizeBytes: 26731912,
      },
    ]);
  });
});
