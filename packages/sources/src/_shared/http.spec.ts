import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchGunzippedText, fetchOrThrow } from "./http";

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
