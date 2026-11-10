import { HttpError } from "helpers4/promise";
import { describe, expect, it, vi } from "vitest";
import { isNotFound, isTransient } from "./_shared/http";
import { refreshWithRetries } from "./refresh-retry";

const http = (status: number) =>
  new Error("Failed to fetch x", {
    cause: new HttpError(new Response(null, { status }), "https://x"),
  });

const reset = () => Object.assign(new Error("fetch failed"), { cause: { code: "ECONNRESET" } });

const noWait = () => vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined);

describe("isTransient / isNotFound", () => {
  it("retries resets, timeouts and 5xx, never 4xx or certificate errors", () => {
    expect(isTransient(reset())).toBe(true);
    expect(isTransient(http(503))).toBe(true);
    expect(isTransient(http(404))).toBe(false);
    expect(isNotFound(http(404))).toBe(true);
    expect(
      isTransient(
        Object.assign(new Error("fetch failed"), { cause: { code: "CERT_HAS_EXPIRED" } }),
      ),
    ).toBe(false);
    expect(isTransient(new RangeError("Maximum call stack size exceeded"))).toBe(false);
  });
});

describe("refreshWithRetries", () => {
  it("retries a transient failure, then succeeds", async () => {
    const refresh = vi
      .fn<() => Promise<number>>()
      .mockRejectedValueOnce(reset())
      .mockResolvedValueOnce(42);
    const wait = noWait();
    await expect(refreshWithRetries("pacman-arch", refresh, [10, 20], wait)).resolves.toBe(42);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(10);
  });

  it("gives up after the last retry", async () => {
    const always = vi.fn<() => Promise<number>>().mockRejectedValue(reset());
    await expect(refreshWithRetries("pacman-arch", always, [10, 20], noWait())).rejects.toThrow(
      "fetch failed",
    );
    expect(always).toHaveBeenCalledTimes(3);
  });

  it("never retries other errors, nor AppImageHub's paced sweep", async () => {
    const parse = vi.fn<() => Promise<number>>().mockRejectedValue(new SyntaxError("bad json"));
    await expect(refreshWithRetries("deb-debian", parse, [10], noWait())).rejects.toThrow(
      "bad json",
    );
    expect(parse).toHaveBeenCalledTimes(1);

    const hub = vi.fn<() => Promise<number>>().mockRejectedValue(reset());
    await expect(refreshWithRetries("appimagehub", hub, [10], noWait())).rejects.toThrow(
      "fetch failed",
    );
    expect(hub).toHaveBeenCalledTimes(1);
  });
});
