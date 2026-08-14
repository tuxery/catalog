# Source cache

Git-committed NDJSON snapshots of each upstream source's raw data — one
file per source (`flathub.ndjson`, `snapcraft.ndjson`, `appimage.ndjson`,
...), one JSON object per line, typed in that source's own
`../src/<source>/types.ts` (deliberately not a shared schema, since
upstream shapes differ).

Read by each source's `index.ts` by default (offline, no network — see the
root `AGENTS.md`'s "Source cache" section). Written by that source's
`fetch.ts`, once implemented, on a schedule rather than on every push.

Empty until the first connector's `fetch.ts` lands — see the
[Tuxery GitHub Project](https://github.com/orgs/tuxery/projects/1) for
tracked work per source.
