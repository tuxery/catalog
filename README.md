# Tuxery — `catalog`

The data side of Tuxery: source connectors, the matching/merge engine, the
scripts that rebuild the unified dataset, and the persisted store `app`
reads from. Split out from `app` so external contributors can add a source
connector without touching the Qwik UI, and so the pipeline can run on its
own schedule independent of web deploys. See
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
│   ├── matcher/            # @tuxery/matcher — scoring/dedup engine
│   ├── pipeline/           # @tuxery/pipeline — orchestrates sources + matcher into a fresh dataset
│   └── store/               # @tuxery/store — persistence layer (Cloudflare R2, later maybe D1)
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

## Checks

```shell
pnpm typecheck
pnpm lint
pnpm test
```

Or scoped to one package: `pnpm --filter @tuxery/matcher test`, etc.

## Status

`packages/sources`, `packages/matcher`, `packages/pipeline`, and
`packages/store` have all landed. Flathub's connector is fetching real data
(3,341 apps cached); Snapcraft and AppImage still read an empty cache — see
[`docs/sources.md`](docs/sources.md) and the
[Tuxery GitHub Project](https://github.com/orgs/tuxery/projects/1) for what's
implemented vs. tracked as roadmap cards.
