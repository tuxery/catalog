import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readNdjson, writeNdjson } from "./ndjson";

interface Row {
  id: string;
  count: number;
}

describe("ndjson", () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ndjson-"));
    path = join(dir, "test.ndjson");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads a missing file as an empty array", () => {
    expect(readNdjson<Row>(path)).toEqual([]);
  });

  it("round-trips rows through write then read", () => {
    const rows: Row[] = [
      { id: "a", count: 1 },
      { id: "b", count: 2 },
    ];

    writeNdjson(path, rows);

    expect(readNdjson<Row>(path)).toEqual(rows);
  });

  it("writes zero rows as an empty file, still readable as an empty array", () => {
    writeNdjson(path, []);

    expect(readNdjson<Row>(path)).toEqual([]);
  });
});
