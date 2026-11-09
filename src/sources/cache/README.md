# Source cache

Git-committed NDJSON snapshots of each upstream source's raw data — one
file per source (`flathub.ndjson`, `snapcraft.ndjson`, `appimage.ndjson`,
...), one JSON object per line, typed in that source's own
`../src/<source>/types.ts` (deliberately not a shared schema, since
upstream shapes differ).

Read by each source's `index.ts` by default (offline, no network — see the
root `AGENTS.md`'s "Source cache" section). Written by that source's
`fetch.ts`, once implemented, on a schedule rather than on every push.

Sources whose data must not be redistributed (`RESTRICTED_SOURCES`) are
not here but in the private tuxery/source-cache repository.

## Licenses

Each file keeps its source's own terms; the AGPL that covers this
repository's code doesn't cover them. `../../../config/source-terms.json`
records what is known for every source. The sources whose license asks for
its notice to travel with copies:

| File                   | License                                                               | Notice                                                                     |
| ---------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `appimage.ndjson`      | MIT, from AppImage/appimage.github.io                                 | [LICENSES/appimage.MIT.txt](LICENSES/appimage.MIT.txt)                     |
| `nix-nixpkgs.ndjson`   | MIT, from NixOS/nixpkgs                                               | [LICENSES/nix-nixpkgs.MIT.txt](LICENSES/nix-nixpkgs.MIT.txt)               |
| `xbps-void.ndjson`     | BSD-2-Clause style, from void-linux/void-packages                     | [LICENSES/xbps-void.BSD-2-Clause.txt](LICENSES/xbps-void.BSD-2-Clause.txt) |
| `ebuild-gentoo.ndjson` | GPL-2.0, from the Gentoo ebuild repository (Copyright Gentoo Authors) | [LICENSES/GPL-2.0.txt](LICENSES/GPL-2.0.txt)                               |
