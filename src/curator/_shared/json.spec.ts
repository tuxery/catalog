import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readJson } from "./json";

interface Row {
  id: string;
}

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
    expect(readJson<Row>(path)).toEqual([]);
  });

  it("parses a JSON array", () => {
    writeFileSync(path, '[{"id":"a"},{"id":"b"}]');

    expect(readJson<Row>(path)).toEqual([{ id: "a" }, { id: "b" }]);
  });
});
