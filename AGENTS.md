# AGENTS.md — Tuxery `catalog`

The Tuxery data pipeline: source connectors, the curation engine (filter +
match/merge), the scripts that rebuild the dataset end to end, and the
persisted store the `app` repo (and, later, a public API) read from.

## Language

**All content must be in English** — code, comments, doc-comments, commit
messages, issues, pull requests, and configuration. No exceptions.

## Scope

- `docs` — wiki-style reference docs (one Markdown file per topic), e.g.
  [`docs/sources.md`](docs/sources.md)'s exhaustive source support matrix.
- `packages/sources` — normalized `SourcedPackage` type, one subfolder per
  upstream source (`flathub/`, `snapcraft/`, `appimage/`, `aur/`, ...) each
  owning its own cache row type (`types.ts`), `normalize.ts`, and
  `fetch.ts`. `_shared/` holds cross-source helpers (NDJSON read/write).
  `cache/` holds the git-committed NDJSON snapshot per source — see
  "Source cache" below. Every source except GitHub Releases has a real
  `fetch.ts` implemented (e.g. `pnpm --filter @tuxery/sources refresh
flathub`) — see [`docs/sources.md`](docs/sources.md) for status per
  source.
- `packages/curator` — catalog curation, pure functions, no I/O. Renamed
  from `packages/matcher` once it grew a second responsibility:
  `filter/` decides which packages belong in the catalog at all (drops
  libraries/dev-headers/docs/fonts — see its own rules + git-committed
  `overrides/keep.ndjson`/`exclude.ndjson`), `match/` (the original
  matcher — migrated from `tuxery/app`) groups what's left into unified
  apps across sources.
- `packages/pipeline` — orchestration scripts that run sources + curator
  end to end and produce a fresh dataset.
- `packages/store` — the persisted DB/cache layer (Cloudflare R2 today,
  possibly D1 later) that `app` reads from at build time.

This repo has no Qwik/UI code — that stays in `tuxery/app`. Keeping the two
separated is deliberate: contributors adding a source connector shouldn't
need to touch the web app, and the pipeline can have its own release/rebuild
cadence (e.g. a scheduled rebuild) independent of when the site deploys.

## Source cache

`packages/sources/cache/<source>.ndjson` is a git-committed snapshot of each
upstream source's raw data (one JSON object per line, typed per source in
that source's own `types.ts` — deliberately _not_ a single shared schema,
since upstream shapes differ). Each source's `index.ts` reads this cache by
default (no network, works offline, safe to run on every push); only a
separate `fetch.ts` hits the real upstream and rewrites the cache file, run
on a schedule rather than per-push — see the "Wire scheduled source
refresh" card on the Tuxery GitHub Project. Committing the cache means
CI/dev never starts from zero and upstream APIs aren't hit on every
rebuild.

Every `fetch.ts` also writes a `cache/<source>.meta.json` sidecar (via
`_shared/metadata.ts`) recording when and from where the data was fetched —
`fetchedAt`, `url`, `entryCount`, plus whatever else is relevant per source
(Flathub's `arch`, Snapcraft's `deviceSeries`/`categoriesSwept`). Kept as a
sibling file rather than fields on every NDJSON row, so a re-fetch's
changed timestamp doesn't touch every data line's diff. `_shared/deb822.ts`
is the one format-parsing helper shared between sources (Debian and
Ubuntu both use it, being the same upstream format) — otherwise each
source's parsing stays local to its own folder even when structurally
similar, so it can be modified independently later.

## Rules

- Don't add a local `TODO.md`/`ROADMAP.md` — track work as cards on the
  [Tuxery GitHub Project](https://github.com/orgs/tuxery/projects/1) instead
  (per this org's bootstrap instructions).
- Keep `packages/sources` and `packages/curator` free of Qwik/UI dependencies
  — `app` and any future public API both depend on this repo, not the other
  way around.
- Don't wire real upstream network calls into a `packages/sources` connector
  as a side effect of unrelated work — per-source rate limits, caching, and
  error handling need deliberate design (see `flathub/fetch.ts` for the
  established shape), not an incidental implementation.

## Commit conventions

Canonical rules live in [`tuxery/.dev`'s AGENTS.md](https://github.com/tuxery/.dev/blob/main/AGENTS.md)
and [`commit-convention.json`](https://github.com/tuxery/.dev/blob/main/commit-convention.json).
Format: `type(scope): <emoji> description`.

### Allowed scopes

Scopes live in [`scopes.json`](./scopes.json) at this repo's root:

| Scope      | Maps to                             |
| ---------- | ----------------------------------- |
| `sources`  | `packages/sources`                  |
| `curator`  | `packages/curator`                  |
| `pipeline` | `packages/pipeline`                 |
| `store`    | `packages/store`, R2/D1 persistence |
| `docs`     | `docs/`                             |
| `ci`       | `.github/workflows/`                |
| `deps`     | Dependency bumps                    |

**Do not use a scope outside this list.** If a new top-level concern is
added, update `scopes.json` (and this table) together.

```text
feat(sources): ✨ wire up the real Flathub search API
feat(pipeline): ✨ add scheduled dataset rebuild script
chore(deps): 📌 pin oxlint to 1.76.0
```

## Git workflow

Push straight to `main`, no PR needed — this is an early-stage PoC, mostly
solo project. No release-train model yet (see `tuxery/.dev`'s AGENTS.md).
Adopt feature branches + PRs and stricter branch protection once it actually
ships to users or gains collaborators, not preemptively.

## License

AGPL-3.0-or-later.
