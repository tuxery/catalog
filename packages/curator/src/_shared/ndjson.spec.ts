import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readNdjson } from "./ndjson";

interface Row {
  id: string;
}

describe("readNdjson", () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "curator-ndjson-"));
    path = join(dir, "test.ndjson");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads a missing file as an empty array", () => {
    expect(readNdjson<Row>(path)).toEqual([]);
  });

  it("parses one JSON object per line", () => {
    writeFileSync(path, '{"id":"a"}\n{"id":"b"}\n');

    expect(readNdjson<Row>(path)).toEqual([{ id: "a" }, { id: "b" }]);
  });

  it("skips blank lines", () => {
    writeFileSync(path, '{"id":"a"}\n\n{"id":"b"}\n');

    expect(readNdjson<Row>(path)).toEqual([{ id: "a" }, { id: "b" }]);
  });
});
