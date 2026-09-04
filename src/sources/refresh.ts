import { fileURLToPath } from "node:url";
import { fetchAlpine } from "./apk-alpine/fetch";
import { fetchAppCenter } from "./flatpak-appcenter/fetch";
import { fetchAppImage } from "./appimage/fetch";
import { fetchManualAppImages } from "./appimage-manual/fetch";
import { fetchArch } from "./pacman-arch/fetch";
import { fetchArchAppstream } from "./pacman-arch-appstream/fetch";
import { fetchAur } from "./pacman-aur/fetch";
import { fetchDebian } from "./deb-debian/fetch";
import { fetchDebianAppstream } from "./deb-debian-appstream/fetch";
import { fetchDeepin } from "./deb-deepin/fetch";
import { fetchFedora } from "./rpm-fedora/fetch";
import { fetchFlathub } from "./flatpak-flathub/fetch";
import { fetchGentoo } from "./ebuild-gentoo/fetch";
import { fetchGithubReleases } from "./github-releases/fetch";
import { fetchGog } from "./gog/fetch";
import { fetchLutris } from "./lutris/fetch";
import { fetchMint } from "./deb-mint/fetch";
import { fetchMxLinux } from "./deb-mxlinux/fetch";
import { fetchNixpkgs } from "./nix-nixpkgs/fetch";
import { fetchOpenSuse } from "./rpm-opensuse/fetch";
import { fetchOpenSuseAppstream } from "./rpm-opensuse-appstream/fetch";
import { fetchFedoraAppstream } from "./rpm-fedora-appstream/fetch";
import { fetchRpmFusion } from "./rpm-rpmfusion/fetch";
import { fetchPopOs } from "./deb-popos/fetch";
import { fetchSlackware } from "./slackware/fetch";
import { fetchSnapcraft } from "./snap-snapcraft/fetch";
import { fetchSolus } from "./eopkg-solus/fetch";
import { fetchUbuntu } from "./deb-ubuntu/fetch";
import { fetchUbuntuAppstream } from "./deb-ubuntu-appstream/fetch";
import { fetchVoid } from "./xbps-void/fetch";

const REFRESHERS: Record<string, (cachePath: string) => Promise<number>> = {
  "flatpak-flathub": fetchFlathub,
  "flatpak-appcenter": fetchAppCenter,
  "snap-snapcraft": fetchSnapcraft,
  appimage: fetchAppImage,
  "appimage-manual": fetchManualAppImages,
  "pacman-aur": fetchAur,
  "deb-debian": fetchDebian,
  "deb-ubuntu": fetchUbuntu,
  "rpm-fedora": fetchFedora,
  "pacman-arch": fetchArch,
  "pacman-arch-appstream": fetchArchAppstream,
  "nix-nixpkgs": fetchNixpkgs,
  "rpm-opensuse": fetchOpenSuse,
  "rpm-opensuse-appstream": fetchOpenSuseAppstream,
  "rpm-fedora-appstream": fetchFedoraAppstream,
  "rpm-rpmfusion": fetchRpmFusion,
  "apk-alpine": fetchAlpine,
  "xbps-void": fetchVoid,
  slackware: fetchSlackware,
  "eopkg-solus": fetchSolus,
  "ebuild-gentoo": fetchGentoo,
  "deb-mint": fetchMint,
  "deb-popos": fetchPopOs,
  "deb-deepin": fetchDeepin,
  "deb-mxlinux": fetchMxLinux,
  "deb-debian-appstream": fetchDebianAppstream,
  "deb-ubuntu-appstream": fetchUbuntuAppstream,
  gog: fetchGog,
  lutris: fetchLutris,
  "github-releases": fetchGithubReleases,
};

async function main() {
  const [sourceName] = process.argv.slice(2);
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
