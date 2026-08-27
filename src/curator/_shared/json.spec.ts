import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { readJson } from "./json";

const RowSchema = z.array(z.object({ id: z.string() }));

describe("readJson", () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "curator-json-"));
    path = join(dir, "test.json");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads a missing file as an empty array", () => {
    expect(readJson(path, RowSchema)).toEqual([]);
  });

  it("parses a JSON array", () => {
    writeFileSync(path, '[{"id":"a"},{"id":"b"}]');

    expect(readJson(path, RowSchema)).toEqual([{ id: "a" }, { id: "b" }]);
  });

  it("throws on a malformed entry instead of silently returning bad data", () => {
    writeFileSync(path, '[{"id":"a"},{"id":123}]');

    expect(() => readJson(path, RowSchema)).toThrow("expected string");
  });
});
