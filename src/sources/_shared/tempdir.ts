import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Creates a fresh temp directory under the OS tmp root, runs `fn` with its
 * path, and always removes it afterward — the `mkdtemp`/try/finally-`rm`
 * bracket every archive-downloading source (Alpine, Void, Arch, Gentoo) was
 * hand-rolling around its own tar/plist extraction.
 */
export async function withTempDir<T>(prefix: string, fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), `${prefix}-`));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
