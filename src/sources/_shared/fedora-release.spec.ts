import { HttpError } from "helpers4/promise";
import { describe, expect, it, vi } from "vitest";
import {
  resolveCurrentFedoraRelease,
  resolveCurrentFedoraReleases,
  withCurrentFedoraRelease,
} from "./fedora-release";

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

const notFound = () =>
  new Error("Failed to fetch Fedora repomd.xml: 404 Not Found", {
    cause: new HttpError(new Response(null, { status: 404 }), "https://x"),
  });

describe("withCurrentFedoraRelease", () => {
  it("lists the current releases newest first", () => {
    expect(
      resolveCurrentFedoraReleases([
        { id_prefix: "FEDORA", version: "44", state: "current" },
        { id_prefix: "FEDORA", version: "45", state: "current" },
        { id_prefix: "FEDORA-EPEL", version: "10", state: "current" },
      ]),
    ).toEqual(["45", "44"]);
  });

  it("falls back to the previous release when the newest isn't published yet (real case: 45 on 2026-10-31)", async () => {
    const fetchFor = vi.fn<(release: string) => Promise<string>>(async (release) => {
      if (release === "45") throw notFound();
      return `repodata for ${release}`;
    });
    await expect(withCurrentFedoraRelease(fetchFor, ["45", "44"])).resolves.toEqual({
      release: "44",
      result: "repodata for 44",
    });
  });

  it("throws any other error, and a 404 on the last release", async () => {
    await expect(
      withCurrentFedoraRelease(() => Promise.reject(new Error("boom")), ["45", "44"]),
    ).rejects.toThrow("boom");
    await expect(
      withCurrentFedoraRelease(() => Promise.reject(notFound()), ["45", "44"]),
    ).rejects.toThrow("404");
  });
});
