import { setTimeout as sleep } from "node:timers/promises";
import { isTransient } from "./_shared/http";

/**
 * Sources never retried: AppImageHub's sweep is paced as agreed with
 * opendesktop.org (one slow sweep a week), and a failed sweep wrote no
 * metadata, so a retry would sweep again.
 */
export const NO_RETRY: ReadonlySet<string> = new Set(["appimagehub"]);

/** Waits before each retry: 30 s, then 2 min. */
export const RETRY_DELAYS_MS = [30_000, 120_000];

/**
 * Runs `refresh`, and runs it again after a pause when it fails with a
 * transient error (`isTransient`: a reset connection, a timeout, a 5xx),
 * up to `delays.length` more times. Any other error, or the last attempt's,
 * is thrown as is. Weekly refreshes lost a source to one ECONNRESET
 * (pacman-arch, 2026-11-07).
 */
export async function refreshWithRetries<T>(
  source: string,
  refresh: () => Promise<T>,
  delays: readonly number[] = RETRY_DELAYS_MS,
  wait: (ms: number) => Promise<unknown> = sleep,
): Promise<T> {
  const attempts = NO_RETRY.has(source) ? 1 : delays.length + 1;
  for (let attempt = 1; ; attempt++) {
    try {
      // Sequential on purpose: a retry only follows a failure.
      // eslint-disable-next-line no-await-in-loop
      return await refresh();
    } catch (error) {
      if (attempt >= attempts || !isTransient(error)) throw error;
      const delay = delays[attempt - 1] ?? 0;
      console.warn(
        `${source}: transient failure (${String((error as Error).message ?? error)}), retrying in ${delay / 1000} s.`,
      );
      // eslint-disable-next-line no-await-in-loop
      await wait(delay);
    }
  }
}
