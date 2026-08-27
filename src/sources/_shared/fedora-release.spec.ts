import { describe, expect, it } from "vitest";
import { resolveCurrentFedoraRelease } from "./fedora-release";

describe("resolveCurrentFedoraRelease", () => {
  it("picks the higher of two current releases during the overlap window", () => {
    const releases = [
      { id_prefix: "FEDORA", version: "43", state: "current" },
      { id_prefix: "FEDORA", version: "44", state: "current" },
      { id_prefix: "FEDORA", version: "45", state: "pending" },
      { id_prefix: "FEDORA", version: "42", state: "archived" },
    ];

    expect(resolveCurrentFedoraRelease(releases)).toBe("44");
  });

  it("ignores EPEL/ELN entries sharing the same endpoint", () => {
    const releases = [
      { id_prefix: "FEDORA", version: "44", state: "current" },
      { id_prefix: "FEDORA-EPEL", version: "10.2", state: "current" },
      { id_prefix: "FEDORA", version: "46", state: "pending" },
    ];

    expect(resolveCurrentFedoraRelease(releases)).toBe("44");
  });

  it("throws when no release is current", () => {
    const releases = [{ id_prefix: "FEDORA", version: "44", state: "archived" }];

    expect(() => resolveCurrentFedoraRelease(releases)).toThrow(/no current Fedora release/);
  });
});
