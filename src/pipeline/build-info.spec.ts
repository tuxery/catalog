import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readBuildInfo, readCatalogCommit, readSourcesRange } from "./build-info";

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "build-info-"));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("readSourcesRange", () => {
  it("returns the oldest and newest fetchedAt, skipping files without one", () => {
    const dir = tempDir();
    writeFileSync(
      join(dir, "a.meta.json"),
      JSON.stringify({ fetchedAt: "2026-10-12T21:20:11.071Z" }),
    );
    writeFileSync(
      join(dir, "b.meta.json"),
      JSON.stringify({ fetchedAt: "2026-10-10T04:00:00.000Z" }),
    );
    writeFileSync(join(dir, "c.meta.json"), JSON.stringify({ entryCount: 3 }));
    writeFileSync(join(dir, "d.ndjson"), "{}");
    expect(readSourcesRange(dir)).toEqual({
      oldest: "2026-10-10T04:00:00.000Z",
      newest: "2026-10-12T21:20:11.071Z",
    });
  });

  it("is undefined when no source has a date", () => {
    expect(readSourcesRange(tempDir())).toBeUndefined();
  });
});

describe("readCatalogCommit", () => {
  it("reads HEAD's short SHA and commit date as UTC", () => {
    const dir = tempDir();
    const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "ignore" });
    git("init", "-q");
    writeFileSync(join(dir, "f"), "x");
    git("add", "f");
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "m"], {
      cwd: dir,
      stdio: "ignore",
      env: { ...process.env, GIT_COMMITTER_DATE: "2026-10-12T23:30:00+02:00" },
    });
    const info = readCatalogCommit(dir);
    expect(info?.commit).toMatch(/^[0-9a-f]{7,}$/);
    expect(info?.date).toBe("2026-10-12T21:30:00.000Z");
  });

  it("is undefined outside a git checkout", () => {
    const dir = tempDir();
    mkdirSync(join(dir, "x"));
    expect(readCatalogCommit(join(dir, "x"))).toBeUndefined();
  });
});

describe("readBuildInfo", () => {
  it("reads this repo's own commit and caches", () => {
    const info = readBuildInfo();
    expect(info.sources?.oldest).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(info.catalog?.commit).toMatch(/^[0-9a-f]{7,}$/);
  });
});
