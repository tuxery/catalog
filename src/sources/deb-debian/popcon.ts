import { gunzipSync } from "node:zlib";
import { fetchOrThrow } from "../_shared/http";
import { percentileScores } from "../_shared/popularity";

const POPCON_URL = "https://popcon.debian.org/all-popcon-results.txt.gz";

/**
 * Debian popularity-contest's `Package: <name> <vote> <old> <recent> <no-files>`
 * lines as installation counts (their sum is popcon's own `inst`). Other
 * lines (`Submissions:`, `Release:`, `Architecture:`) are skipped. Pure.
 */
export function parsePopcon(text: string): Map<string, number> {
  const installs = new Map<string, number>();
  for (const line of text.split("\n")) {
    const match = /^Package:\s+(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/.exec(line);
    if (match) {
      installs.set(
        match[1] as string,
        match.slice(2).reduce((sum, value) => sum + Number(value), 0),
      );
    }
  }
  return installs;
}

/** Every package's popcon percentile score (1 = most installed), see `percentileScores`. */
export async function fetchPopconScores(): Promise<Map<string, number>> {
  const response = await fetchOrThrow(POPCON_URL, "Debian popcon results");
  const text = gunzipSync(Buffer.from(await response.arrayBuffer())).toString("utf8");
  return percentileScores(parsePopcon(text));
}
