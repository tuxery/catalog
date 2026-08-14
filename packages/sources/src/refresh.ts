import { fileURLToPath } from "node:url";
import { fetchFlathub } from "./flathub/fetch";
import { fetchSnapcraft } from "./snapcraft/fetch";

// One entry per source with a real fetch.ts — appimage stays cache-only
// (empty) until its own connector card lands.
const REFRESHERS: Record<string, (cachePath: string) => Promise<number>> = {
  flathub: fetchFlathub,
  snapcraft: fetchSnapcraft,
};

async function main() {
  const [sourceName] = process.argv.slice(2);
  const refresh = sourceName ? REFRESHERS[sourceName] : undefined;

  if (!refresh) {
    console.error(`Usage: refresh <source>. Known sources: ${Object.keys(REFRESHERS).join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const cachePath = fileURLToPath(new URL(`../cache/${sourceName}.ndjson`, import.meta.url));
  const count = await refresh(cachePath);
  console.log(`${sourceName}: wrote ${count} entries to ${cachePath}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
