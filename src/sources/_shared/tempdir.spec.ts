import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { withTempDir } from "./tempdir";

describe("withTempDir", () => {
  it("creates the directory before running fn and removes it after", async () => {
    let dirDuringRun: string | undefined;

    const result = await withTempDir("test", async (dir) => {
      dirDuringRun = dir;
      expect(existsSync(dir)).toBe(true);
      return "done";
    });

    expect(result).toBe("done");
    expect(dirDuringRun).toBeDefined();
    expect(existsSync(dirDuringRun as string)).toBe(false);
  });

  it("still removes the directory when fn throws", async () => {
    let dirDuringRun: string | undefined;

    await expect(
      withTempDir("test", async (dir) => {
        dirDuringRun = dir;
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(existsSync(dirDuringRun as string)).toBe(false);
  });
});
