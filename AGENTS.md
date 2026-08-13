# AGENTS.md — Tuxery `catalog`

The Tuxery data pipeline: source connectors, the matching/merge engine, the
scripts that rebuild the dataset end to end, and the persisted store the
`app` repo (and, later, a public API) read from.

## Language

**All content must be in English** — code, comments, doc-comments, commit
messages, issues, pull requests, and configuration. No exceptions.

## Scope

- `packages/sources` — normalized `SourcedPackage` type and async connectors
  per upstream source (Flathub, Snapcraft, AppImage, native). Migrated from
  `tuxery/app`.
- `packages/matcher` — package deduplication/scoring engine. Pure functions,
  no I/O. Migrated from `tuxery/app`.
- `packages/rebuild` — orchestration scripts that run the sources + matcher
  pipeline end to end and produce a fresh dataset. Not yet created.
- `packages/store` — the persisted DB/cache layer (Cloudflare R2 today,
  possibly D1 later) that `app` reads from at build time. Not yet created.

This repo has no Qwik/UI code — that stays in `tuxery/app`. Keeping the two
separated is deliberate: contributors adding a source connector shouldn't
need to touch the web app, and the pipeline can have its own release/rebuild
cadence (e.g. a scheduled rebuild) independent of when the site deploys.

## Rules

- Don't add a local `TODO.md`/`ROADMAP.md` — track work as cards on the
  [Tuxery GitHub Project](https://github.com/orgs/tuxery/projects/1) instead
  (per this org's bootstrap instructions).
- Keep `packages/sources` and `packages/matcher` free of Qwik/UI dependencies
  — `app` and any future public API both depend on this repo, not the other
  way around.
- Don't wire real upstream network calls into `packages/sources`' connectors
  as a side effect of unrelated work — per-source rate limits, caching, and
  error handling need deliberate design, not an incidental implementation.

## Commit conventions

Canonical rules live in [`tuxery/.dev`'s AGENTS.md](https://github.com/tuxery/.dev/blob/main/AGENTS.md)
and [`commit-convention.json`](https://github.com/tuxery/.dev/blob/main/commit-convention.json).
Format: `type(scope): <emoji> description`.

### Allowed scopes

Scopes live in [`scopes.json`](./scopes.json) at this repo's root:

| Scope     | Maps to                                          |
| --------- | ------------------------------------------------- |
| `sources` | `packages/sources`                                |
| `matcher` | `packages/matcher`                                |
| `rebuild` | `packages/rebuild`                                |
| `store`   | `packages/store`, R2/D1 persistence               |
| `ci`      | `.github/workflows/`                              |
| `deps`    | Dependency bumps                                  |

**Do not use a scope outside this list.** If a new top-level concern is
added, update `scopes.json` (and this table) together.

```text
feat(sources): ✨ wire up the real Flathub search API
feat(rebuild): ✨ add scheduled dataset rebuild script
chore(deps): 📌 pin oxlint to 1.76.0
```

## Git workflow

Short-lived feature branches, merged via PR into `main`. No release-train
model yet (see `tuxery/.dev`'s AGENTS.md) — this is an early-stage, mostly
solo project; adopt stricter branch protection when it actually ships to
users or gains collaborators, not preemptively.

## License

AGPL-3.0-or-later.
