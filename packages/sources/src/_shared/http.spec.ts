import { gzipSync, zstdCompressSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchGunzippedText, fetchOrThrow, fetchText, fetchZstdText } from "./http";

describe("fetchOrThrow", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the response on a 2xx status", async () => {
    const response = new Response("ok", { status: 200 });
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => Promise.resolve(response)),
    );

    await expect(fetchOrThrow("https://example.com", "Example")).resolves.toBe(response);
  });

  it("throws a consistently-shaped error on a non-2xx status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        Promise.resolve(new Response("nope", { status: 404, statusText: "Not Found" })),
      ),
    );

    await expect(fetchOrThrow("https://example.com", "Example")).rejects.toThrow(
      "Failed to fetch Example: 404 Not Found",
    );
  });

  it("passes init through to fetch (headers, etc.)", async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response("ok", { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchOrThrow("https://example.com", "Example", { headers: { "X-Test": "1" } });

    expect(fetchMock).toHaveBeenCalledWith("https://example.com", { headers: { "X-Test": "1" } });
  });
});

describe("fetchText", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the response body as text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => Promise.resolve(new Response("plain text body", { status: 200 }))),
    );

    await expect(fetchText("https://example.com", "Example")).resolves.toBe("plain text body");
  });

  it("throws the same labeled error as fetchOrThrow on a non-2xx status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        Promise.resolve(new Response("nope", { status: 503, statusText: "Service Unavailable" })),
      ),
    );

    await expect(fetchText("https://example.com", "Example")).rejects.toThrow(
      "Failed to fetch Example: 503 Service Unavailable",
    );
  });
});

describe("fetchGunzippedText", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("decompresses a real gzip response body into text", async () => {
    const compressed = gzipSync(Buffer.from("hello world", "utf8"));
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => Promise.resolve(new Response(compressed, { status: 200 }))),
    );

    await expect(fetchGunzippedText("https://example.com", "Example")).resolves.toBe("hello world");
  });

  it("throws the same labeled error as fetchOrThrow on a non-2xx status, without attempting to decompress", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        Promise.resolve(new Response("nope", { status: 500, statusText: "Server Error" })),
      ),
    );

    await expect(fetchGunzippedText("https://example.com", "Example")).rejects.toThrow(
      "Failed to fetch Example: 500 Server Error",
    );
  });
});

describe("fetchZstdText", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("decompresses a real Zstandard response body into text", async () => {
    const compressed = zstdCompressSync(Buffer.from("hello world", "utf8"));
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => Promise.resolve(new Response(compressed, { status: 200 }))),
    );

    await expect(fetchZstdText("https://example.com", "Example")).resolves.toBe("hello world");
  });

  it("throws the same labeled error as fetchOrThrow on a non-2xx status, without attempting to decompress", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        Promise.resolve(new Response("nope", { status: 404, statusText: "Not Found" })),
      ),
    );

    await expect(fetchZstdText("https://example.com", "Example")).rejects.toThrow(
      "Failed to fetch Example: 404 Not Found",
    );
  });
});
