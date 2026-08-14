# AGENTS.md — Tuxery `catalog`

The Tuxery data pipeline: source connectors, the matching/merge engine, the
scripts that rebuild the dataset end to end, and the persisted store the
`app` repo (and, later, a public API) read from.

## Language

**All content must be in English** — code, comments, doc-comments, commit
messages, issues, pull requests, and configuration. No exceptions.

## Scope

- `docs` — wiki-style reference docs (one Markdown file per topic), e.g.
  [`docs/sources.md`](docs/sources.md)'s exhaustive source support matrix.
- `packages/sources` — normalized `SourcedPackage` type, one subfolder per
  upstream source (`flathub/`, `snapcraft/`, `appimage/`, ...) each owning
  its own cache row type (`types.ts`), `normalize.ts`, and `fetch.ts`.
  `_shared/` holds cross-source helpers (NDJSON read/write). `cache/`
  holds the git-committed NDJSON snapshot per source — see "Source cache"
  below. Flathub and Snapcraft's `fetch.ts` are implemented (e.g. `pnpm
--filter @tuxery/sources refresh flathub`); AppImage still reads an empty
  cache — see [`docs/sources.md`](docs/sources.md) for status per source.
- `packages/matcher` — package deduplication/scoring engine. Pure functions,
  no I/O. Migrated from `tuxery/app`.
- `packages/pipeline` — orchestration scripts that run the sources + matcher
  pipeline end to end and produce a fresh dataset.
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
separate `fetch.ts` (once implemented) hits the real upstream and rewrites
the cache file, run on a schedule rather than per-push — see the "Wire
scheduled source refresh" card on the Tuxery GitHub Project. Committing the
cache means CI/dev never starts from zero and upstream APIs aren't hit on
every rebuild.

## Rules

- Don't add a local `TODO.md`/`ROADMAP.md` — track work as cards on the
  [Tuxery GitHub Project](https://github.com/orgs/tuxery/projects/1) instead
  (per this org's bootstrap instructions).
- Keep `packages/sources` and `packages/matcher` free of Qwik/UI dependencies
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
| `matcher`  | `packages/matcher`                  |
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
