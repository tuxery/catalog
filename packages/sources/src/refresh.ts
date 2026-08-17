import { fileURLToPath } from "node:url";
import { fetchAppImage } from "./appimage/fetch";
import { fetchArch } from "./arch/fetch";
import { fetchAur } from "./aur/fetch";
import { fetchDebian } from "./debian/fetch";
import { fetchFedora } from "./fedora/fetch";
import { fetchFlathub } from "./flathub/fetch";
import { fetchNixpkgs } from "./nixpkgs/fetch";
import { fetchSnapcraft } from "./snapcraft/fetch";
import { fetchUbuntu } from "./ubuntu/fetch";

const REFRESHERS: Record<string, (cachePath: string) => Promise<number>> = {
  flathub: fetchFlathub,
  snapcraft: fetchSnapcraft,
  appimage: fetchAppImage,
  aur: fetchAur,
  debian: fetchDebian,
  ubuntu: fetchUbuntu,
  fedora: fetchFedora,
  arch: fetchArch,
  nixpkgs: fetchNixpkgs,
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
