import { spawnSync } from "node:child_process";
import { REFRESHERS } from "../src/sources/refreshers";

const ALL_SOURCE_IDS = Object.keys(REFRESHERS);

/** Re-fetches the given sources (default: all) via the `refresh` script, one at a time. */
export function refreshSources(sourceIds: string[] = ALL_SOURCE_IDS): void {
  for (const sourceId of sourceIds) {
    console.log(`Refreshing ${sourceId}...`);
    const result = spawnSync("pnpm", ["run", "refresh", sourceId], {
      stdio: "inherit",
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
