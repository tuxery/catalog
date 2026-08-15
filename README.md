# Tuxery — `catalog`

The data side of Tuxery: source connectors, the curation engine (filter +
match/merge), the scripts that rebuild the unified dataset, and the
persisted store `app` reads from. Split out from `app` so external
contributors can add a source connector without touching the Qwik UI, and
so the pipeline can run on its own schedule independent of web deploys. See
[`init.md`](https://github.com/tuxery/.github), [`docs/`](docs/) and the
[Tuxery GitHub Project](https://github.com/orgs/tuxery/projects/1) for the
product brief, reference docs, and roadmap.

## Layout

```text
catalog/
├── docs/                  # wiki-style reference docs, one .md per topic
├── packages/
│   ├── sources/           # @tuxery/sources — connectors, one folder per upstream source
│   │   ├── cache/          # git-committed NDJSON snapshot per source
│   │   ├── _shared/         # cross-source helpers (NDJSON read/write)
│   │   ├── flathub/ snapcraft/ appimage/ ...
│   │   └── search.ts       # searchAllSources() — fans out to every source
│   ├── curator/            # @tuxery/curator — catalog curation
│   │   ├── overrides/       # git-committed keep/exclude exceptions
│   │   ├── filter/           # decides which packages belong in the catalog at all
│   │   └── match/            # groups what's left into unified apps across sources
│   ├── pipeline/           # @tuxery/pipeline — orchestrates sources + curator into a fresh dataset
│   └── store/               # @tuxery/store — persistence layer (Turso/libSQL)
├── tsconfig.base.json       # shared TS config for packages/*
└── pnpm-workspace.yaml
```

See [`docs/sources.md`](docs/sources.md) for the full per-source support
matrix (implemented vs. roadmap).

## Development

```shell
pnpm install
pnpm build
```

To run the site locally against real data, three terminals:

```shell
pnpm seed             # here: builds/reuses the dataset, writes a local libSQL database
pnpm serve             # here: serves that database (this repo owns the data, not app)
# then, in tuxery/app:
pnpm dev              # there: builds + launches the actual Worker, queries that database
```

The database file lives at `.turso-state/` in this repo (gitignored) —
never under `app`. See [`AGENTS.md`](AGENTS.md)'s "Local dev" section for
how the two repos' scripts hand off to each other.

## Checks

```shell
pnpm typecheck
pnpm lint
pnpm test
```

Or scoped to one package: `pnpm --filter @tuxery/curator test`, etc.

## Status

`packages/sources`, `packages/curator`, `packages/pipeline`, and
`packages/store` have all landed. Every source except GitHub Releases
(deferred to roadmap) is fetching real data — Flathub (3,345 apps),
Snapcraft (1,542 snaps), AppImage (1,104 apps, no version yet), AUR
(117,520 packages), Arch official core+extra (15,200 packages), Debian
(68,755 packages, stable/main/amd64 only), Ubuntu (73,228 packages,
resolute main+universe/amd64 only), and Fedora (76,354 packages, release
44 Everything/x86_64 only) — see [`docs/sources.md`](docs/sources.md) and
the [Tuxery GitHub Project](https://github.com/orgs/tuxery/projects/1) for
what's implemented vs. tracked as roadmap cards.

`packages/curator`'s `filter` cuts ~54k non-app/game packages (libraries,
dev headers, docs, fonts) before matching — effective on Debian/Ubuntu
(~33% each), much less so on AUR/Arch (~2-3%, different naming
conventions — see the "Filter is far less effective on AUR/Arch" card).
`match` groups the rest with a union-find over exact-match tiers (manual
overrides → exact appId → exact normalized name, no fuzzy scoring),
replacing the original bucketed-pairwise-scoring approach from
`tuxery/app` — grouping ~303k filtered packages now takes well under a
second.
