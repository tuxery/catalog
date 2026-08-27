import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FetchMetadata } from "./metadata";
import { metadataPathFor, readMetadata, writeMetadata } from "./metadata";

describe("metadata", () => {
  let dir: string;
  let cachePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "metadata-"));
    cachePath = join(dir, "example.ndjson");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("derives the sidecar path from the cache path", () => {
    expect(metadataPathFor(cachePath)).toBe(join(dir, "example.meta.json"));
  });

  it("returns undefined when no metadata has been written yet", () => {
    expect(readMetadata(cachePath)).toBeUndefined();
  });

  it("round-trips metadata, including source-specific extra fields", () => {
    interface ExampleMetadata extends FetchMetadata {
      arch: string;
    }

    const metadata: ExampleMetadata = {
      source: "example",
      fetchedAt: "2026-08-14T00:00:00.000Z",
      url: "https://example.com/data.xml.gz",
      entryCount: 42,
      arch: "x86_64",
    };

    writeMetadata(cachePath, metadata);

    expect(readMetadata<ExampleMetadata>(cachePath)).toEqual(metadata);
  });
});
