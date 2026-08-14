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
    };

    expect(normalize([entry])).toEqual([
      {
        source: "fedora",
        name: "0ad",
        description: "Cross-Platform RTS Game of Ancient Warfare",
        version: "0.28.0",
        appId: "0ad",
        homepage: "http://play0ad.com",
      },
    ]);
  });
});
