import { fileURLToPath } from "node:url";
import { REFRESHERS } from "./refreshers";

async function main() {
  const [sourceName] = process.argv.slice(2);

  // `--list`: every source id, space-separated — what the scheduled
  // workflow loops over, instead of keeping its own copy of the list.
  if (sourceName === "--list") {
    console.log(Object.keys(REFRESHERS).join(" "));
    return;
  }

  const refresh = sourceName ? REFRESHERS[sourceName] : undefined;

  if (!refresh) {
    console.error(`Usage: refresh <source>. Known sources: ${Object.keys(REFRESHERS).join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const cachePath = fileURLToPath(new URL(`./cache/${sourceName}.ndjson`, import.meta.url));
  const count = await refresh(cachePath);
  console.log(`${sourceName}: wrote ${count} entries to ${cachePath}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
