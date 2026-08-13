# Tuxery — `catalog`

The data side of Tuxery: source connectors, the matching/merge engine, the
scripts that rebuild the unified dataset, and the persisted store `app`
reads from. Split out from `app` so external contributors can add a source
connector without touching the Qwik UI, and so the pipeline can run on its
own schedule independent of web deploys. See
[`init.md`](https://github.com/tuxery/.github) and the
[Tuxery GitHub Project](https://github.com/orgs/tuxery/projects/1) for the
product brief and roadmap.

## Layout

```text
catalog/
├── packages/
│   ├── sources/         # @tuxery/sources — Flathub/Snapcraft/AppImage connectors
│   ├── matcher/         # @tuxery/matcher — scoring/dedup engine
│   ├── rebuild/         # orchestrates sources + matcher into a fresh dataset
│   └── store/            # persistence layer (Cloudflare R2, later maybe D1)
├── tsconfig.base.json    # shared TS config for packages/*
└── pnpm-workspace.yaml
```

`packages/sources` and `packages/matcher` have migrated here from `app`;
`packages/rebuild` and `packages/store` don't exist yet.

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

`packages/sources` and `packages/matcher` have landed, migrated from `app`
with their existing tests. `packages/sources`' connectors are still stubs
returning no results — real upstream integration, `packages/rebuild`, and
`packages/store` are tracked as cards on the
[Tuxery GitHub Project](https://github.com/orgs/tuxery/projects/1).
