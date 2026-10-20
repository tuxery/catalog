import { cachePathFor, hasCacheDir } from "./_shared/cache-path";
import { REFRESHERS } from "./refreshers";

async function main() {
  const [sourceName] = process.argv.slice(2);

  // `--list`: every source id, space-separated — what the scheduled
  // workflow loops over, instead of keeping its own copy of the list. A
  // restricted source is listed only where its private cache is checked out.
  if (sourceName === "--list") {
    console.log(
      Object.keys(REFRESHERS)
        .filter((source) => hasCacheDir(source))
        .join(" "),
    );
    return;
  }

  const refresh = sourceName ? REFRESHERS[sourceName] : undefined;

  if (!sourceName || !refresh) {
    console.error(`Usage: refresh <source>. Known sources: ${Object.keys(REFRESHERS).join(", ")}`);
    process.exitCode = 1;
    return;
  }

  if (!hasCacheDir(sourceName)) {
    console.error(
      `${sourceName}: its cache is private (tuxery/source-cache) and no checkout was found; see src/sources/_shared/cache-path.ts.`,
    );
    process.exitCode = 1;
    return;
  }
  const cachePath = cachePathFor(sourceName);
  const count = await refresh(cachePath);
  console.log(`${sourceName}: wrote ${count} entries to ${cachePath}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
