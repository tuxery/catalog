import { fileURLToPath } from "node:url";
import { fetchFlathub } from "./flathub/fetch";

// One entry per source with a real fetch.ts — snapcraft/appimage stay
// cache-only (empty) until their own connector cards land.
const REFRESHERS: Record<string, (cachePath: string) => Promise<number>> = {
  flathub: fetchFlathub,
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
