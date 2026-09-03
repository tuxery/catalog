# Sources

Every upstream Linux app source Tuxery could pull from, in priority order.
Goal (probably unreachable, and that's fine): list Linux apps exhaustively.
Status here should stay in sync with the "connector" cards on the
[Tuxery GitHub Project](https://github.com/orgs/tuxery/projects/1) — this
table is the map, the Project is the tracked work.

## Support matrix

| #   | Source                | Component            | Format     | Count   | Exhaustive? | Status      | Notes |
| --- | --------------------- | -------------------- | ---------- | ------- | ----------- | ----------- | ----- |
| 1   | Flathub               | —                    | Flatpak    | 3,363   | ✅          | Implemented | [1]   |
| 1b  | Other Flatpak remotes | —                    | Flatpak    | —       | ⚠️          | Not started | [2]   |
| 2   | Snapcraft             | —                    | Snap       | 3,662   | ⚠️          | Implemented | [3]   |
| 3   | AppImage              | —                    | AppImage   | 1,052   | ⚠️          | Implemented | [4]   |
| 3b  | Manual AppImage seed  | —                    | AppImage   | 1       | ✅          | Implemented | [25]  |
| 4   | GitHub Releases       | —                    | Any        | 498     | ❌          | Implemented | [5]   |
| 5a  | AUR (Arch, community) | —                    | Native     | 117,520 | ✅          | Implemented | [6]   |
| 5b  | Arch official         | core                 | Native     | 296     | ✅          | Implemented | [7]   |
| 5b  | Arch official         | extra                | Native     | 14,906  | ✅          | Implemented | [7]   |
| 5b  | Arch official         | multilib             | Native     | 272     | ✅          | Implemented | [7]   |
| 5c  | Debian                | main                 | Native     | 68,755  | ✅          | Implemented | [8]   |
| 5c  | Debian                | contrib              | Native     | 303     | ✅          | Implemented | [8]   |
| 5c  | Debian                | non-free             | Native     | 741     | ✅          | Implemented | [8]   |
| 5c  | Debian                | non-free-firmware    | Native     | 44      | ✅          | Implemented | [8]   |
| 5d  | Ubuntu                | main                 | Native     | 6,487   | ✅          | Implemented | [9]   |
| 5d  | Ubuntu                | universe             | Native     | 66,741  | ✅          | Implemented | [9]   |
| 5d  | Ubuntu                | restricted           | Native     | 858     | ✅          | Implemented | [9]   |
| 5d  | Ubuntu                | multiverse           | Native     | 1,242   | ✅          | Implemented | [9]   |
| 5e  | Fedora                | Everything + updates | Native     | 68,990  | ✅          | Implemented | [10]  |
| 5f  | openSUSE              | oss                  | Native     | 52,482  | ✅          | Implemented | [11]  |
| 5f  | openSUSE              | non-oss              | Native     | 42      | ✅          | Implemented | [11]  |
| 5l  | RPM Fusion            | free + nonfree       | Native     | 539     | ✅          | Implemented | [26]  |
| 5g  | Alpine                | main                 | Native     | 5,961   | ✅          | Implemented | [12]  |
| 5g  | Alpine                | community            | Native     | 22,678  | ✅          | Implemented | [12]  |
| 5h  | Void                  | main                 | Native     | 14,746  | ✅          | Implemented | [13]  |
| 5h  | Void                  | nonfree              | Native     | 67      | ✅          | Implemented | [13]  |
| 5h  | Void                  | multilib             | Native     | 5,710   | ✅          | Implemented | [13]  |
| 5i  | Slackware             | —                    | Native     | 1,887   | ✅          | Implemented | [14]  |
| 5j  | Solus                 | shannon              | Native     | 11,660  | ✅          | Implemented | [15]  |
| 5k  | Gentoo                | —                    | Native     | 19,443  | ⚠️          | Implemented | [16]  |
| 6   | Nixpkgs               | —                    | Native     | 131,101 | ✅          | Implemented | [17]  |
| 7a  | elementary AppCenter  | —                    | Flatpak    | 158     | ✅          | Implemented | [18]  |
| 7b  | Linux Mint            | main                 | Native     | 108     | ✅          | Implemented | [19]  |
| 7c  | Pop!_OS               | main                 | Native     | 77      | ⚠️          | Implemented | [20]  |
| 7d  | Deepin                | main                 | Native     | 255     | ⚠️          | Implemented | [21]  |
| 7e  | MX Linux              | main                 | Native     | 142     | ⚠️          | Implemented | [22]  |
| 8a  | GOG                   | Linux-compat.        | Storefront | 1,342   | ⚠️          | Implemented | [23]  |
| 8b  | Lutris                | published, linux     | Script     | 1,795   | ⚠️          | Implemented | [24]  |
| 9a  | Debian AppStream      | main+contrib+nonfree | Enrichment | 2,109   | ⚠️          | Implemented | [27]  |
| 9b  | openSUSE AppStream    | oss+non-oss          | Enrichment | 887     | ⚠️          | Implemented | [28]  |

## Notes on each row

Detail and rationale that used to live in the table itself — moved out
because a paragraph per cell made the table unreadable.

1. **Flathub** — `dl.flathub.org/repo/appstream/x86_64/appstream.xml.gz`,
   the appstream repodata Flatpak clients themselves consume. Single
   gzipped XML file, no auth, no pagination. The canonical catalog —
   exhaustive by construction. Also joins in Flathub's own
   `/api/v2/collection/{verified,recently-added,recently-updated}`
   (`page`/`per_page` must both be passed together — either alone 400s,
   despite the OpenAPI spec listing them as independently optional) as
   `SourcedPackage.storeCollections` tags — "verified" pages through the
   full list (a real status, not a top-N ranking), the two recency feeds
   stay top-250 like `popular` already is.
   `src/sources/flatpak-flathub/fetch.ts`.
2. **Other Flatpak remotes** (GNOME nightly, KDE `kdeapps`, Fedora's own
   flatpak remote, ...) — same appstream.xml.gz mechanism per remote,
   different host. Not investigated yet; mostly nightly/testing builds,
   not curated apps, so low priority — Flathub already covers the vast
   majority of published apps.
3. **Snapcraft** — `api.snapcraft.io/v2/snaps/find`
   (`Snap-Device-Series: 16` header). No pagination or sort param (both
   rejected outright as "Bad parameters") — every query caps at ~100
   results. Swept two independent ways and merged by name: `category=`
   across 20 categories (from `api.snapcraft.io/api/v1/snaps/sections`),
   and `q=` for every letter/digit — verified neither sweep subsumes the
   other (1,542 vs. 2,919 unique snaps, only 809 overlapping; union
   3,652). Still an approximation, not a dump — no known way to actually
   enumerate the full store. A third sweep, `?featured=true` (~100 hand-
   picked snaps), tags matches as `SourcedPackage.storeCollections:
["featured"]` rather than folding into the general merge untraceably —
   distinct from the `category=featured` store category already part of
   the merge above. `src/sources/snap-snapcraft/fetch.ts`.
4. **AppImage** — [`appimage.github.io/feed.json`](https://appimage.github.io/feed.json)
   (community-curated — not to be confused with the separate,
   bot-gated AppImageHub.com, investigated as a second source and found
   not viable: deprecated API, site now behind bot detection), filtered
   to entries with a GitHub repo link (~3 in 4 of ~1,400). Each repo
   checked for existence via GitHub's API (dropping the ~5% confirmed
   404 — deleted/renamed/private, the feed itself going stale) and, if
   it exists, its real version resolved via the latest GitHub Release
   (86% success on the survivors — the rest exist but have no tagged
   release, e.g. continuous-build-only projects). Needs `GITHUB_TOKEN`
   set (5000 req/hr vs. 60 unauthenticated, ~1,100 repos × 2 calls
   each), skipped entirely otherwise rather than burning the
   unauthenticated budget for nothing. Depends entirely on community
   curation — not every AppImage publisher is listed.
   `src/sources/appimage/fetch.ts`.
5. **GitHub Releases** (generic; `.deb`, `.rpm`, `.AppImage`, raw
   binaries, ...) — no catalog exists, so this discovers candidates via
   `api.github.com/search/repositories?q=topic:linux-app+archived:false`
   (sorted by stars, paginated up to GitHub's 1,000-result search cap),
   kept only if the repo also has a real tagged Release (necessary —
   nothing to install otherwise — but not sufficient on its own: some
   repos with the topic and a Release are packaging tooling, not an app
   a user would launch, e.g. AppImage/AppImageKit itself, excluded via
   `config/filter-exclude.json`). 1,000 candidates in, 499 with a real
   Release, 498 after that one exclusion. `homepage` points at the
   Release page itself, not a specific asset — no reliable per-project
   convention for picking "the right download" across arbitrary repos.
   Needs `GITHUB_TOKEN` (search API's own stricter 30 req/min limit is
   still comfortably inside budget for ≤10 search pages + up to 1,000
   per-repo Release lookups). Not exhaustive by nature (topic-tagging is
   self-selected, and a real tagged Release undercounts too — some real
   apps ship via a shell-installer instead, e.g. winapps-org/winapps).
   Shares plumbing with AppImage's per-repo Release lookup.
   `src/sources/github-releases/fetch.ts`.
6. **AUR** (Arch, community) — `aur.archlinux.org/packages-meta-ext-v1.json.gz`,
   a full metadata dump regenerated every ~5 min, single file, no auth.
   Full dump — the easiest native source to be exhaustive on.
   `src/sources/pacman-aur/fetch.ts`.
7. **Arch official** (core + extra + multilib) —
   `geo.mirror.pkgbuild.com/{repo}/os/x86_64/{repo}.db`, gzipped tar
   archives, one `desc` file per package (`%FIELD%\nvalue\n\n` format,
   not deb822/XML/JSON), extracted via the `tar` npm package. Distinct
   from AUR — pre-built, Arch-team-maintained packages, not community
   build recipes. Exhaustive per repo/arch combination; x86_64 only.
   `src/sources/pacman-arch/fetch.ts`.
8. **Debian** (main + contrib + non-free + non-free-firmware) —
   `deb.debian.org/debian/dists/stable/{component}/binary-amd64/Packages.gz`
   — `.gz`, not the archive's default `.xz` (Node's built-in zlib
   gunzips without a new dependency; Debian publishes both). deb822
   stanza format. Exhaustive per suite/component/arch combination;
   stable/amd64 only — other suites/archs not fetched.
   `src/sources/deb-debian/fetch.ts`.
9. **Ubuntu** (main + universe + restricted + multiverse) — same deb822
   mechanism as Debian (it's a derivative), amd64 only, current stable
   suite only (resolute/26.04 as of writing — resolved live via
   Launchpad's series API rather than hardcoded, see the "Fedora/Ubuntu
   release freshness" cross-cutting note below). All four components
   needed, not `main` alone — verified against the real archive: `main`
   alone yielded 6,487 packages, adding `universe` brought it to 73,219.
   Ubuntu's component split is by _support tier_ (Canonical vs.
   community) and legal status, unlike Debian's purely license-based
   split, so most desktop apps live in universe.
   `src/sources/deb-ubuntu/fetch.ts`.
10. **Fedora** (Everything + updates, merged by name) — two-step per
    repo: `repodata/repomd.xml` first (to find the current
    content-hashed `primary.xml.zst` path — RPM repos don't use a fixed
    filename like Debian's `Packages.gz`), then that file,
    Zstandard-compressed (Node 24's built-in zlib decodes it, no new
    dependency). Fetches both the current release's Everything repo (the
    frozen release-day snapshot, release number resolved live via
    Bodhi's API rather than hardcoded — see the "Fedora/Ubuntu release
    freshness" cross-cutting note below) and its updates overlay, merged
    by name (updates wins ties — matches real dnf/yum behavior); x86_64
    only, other releases not fetched. Merged & deduped by name —
    Everything alone has 76,354 raw rows but only 67,430 unique names
    (arch/subpackage variants sharing a name); updates then adds 1,560
    genuinely new names on top. `src/sources/rpm-fedora/fetch.ts`.
11. **openSUSE** (Tumbleweed, oss + non-oss) — the identical repomd.xml ->
    content-hashed primary.xml[.zst] repodata schema as Fedora (parsing
    shared via `_shared/rpm-repodata.ts`, also used to refactor Fedora's
    own `fetch.ts`), fetched the same way. Two differences from Fedora:
    no per-arch repo directory — each repo's primary.xml already bundles
    every package's `<arch>` in one file (verified: oss's 52,482 entries
    split exactly into x86_64 + noarch, nothing else mixed in, so no
    arch filtering needed) — and oss/non-oss are disjoint components
    rather than overlapping snapshots (verified zero name collisions
    between them), so a plain concatenation replaces Fedora's by-name
    merge/precedence logic. `<rpm:group>` (the same RPM Group field
    Fedora also has but leaves "Unspecified" in practice) is genuinely
    populated on real openSUSE data, 68.7% of the time, with rich
    hierarchical values (e.g. `Development/Libraries/C and C++`) — a
    stronger, richer filter signal than Debian's flat Section vocabulary,
    reused via the same `SourcedPackage.section` slot.
    `src/sources/rpm-opensuse/fetch.ts`.
12. **Alpine** (main + community) — a custom text format
    (`APKINDEX.tar.gz`, extracted the same way as Arch's `.db` archives
    via the `tar` npm package), single-letter field prefixes (`P:name`,
    `V:version`, `T:summary`, `U:homepage`, ...) rather than deb822/RPM-
    XML — no shared parser with any other connector, unlike Fedora/
    openSUSE's `_shared/rpm-repodata.ts`. Unlike every other repo-per-
    release source here, fetched via `latest-stable` — a server-side
    alias that always resolves to the current stable release, so this
    connector doesn't join Fedora/Ubuntu on the "pin a hardcoded release"
    card. main (5,961) + community (22,678) are disjoint, zero name
    collisions verified, so a plain concatenation is enough, same as
    openSUSE's oss/non-oss. Verified APKINDEX has no Section/Group-
    equivalent field at all (full real-schema scan:
    `P/V/A/S/I/T/U/L/o/m/t/c/D/p/i/k` only) — filtering is name-pattern
    only here, same situation as AUR/Arch's `desc` format.
    `src/sources/apk-alpine/fetch.ts`.
13. **Void** (main + nonfree + multilib) — a genuinely different repodata
    shape from every other native source here: `<arch>-repodata` is a
    Zstandard-compressed tar (no file extension hints either fact)
    containing `index.plist`, an XML property list (Apple/GNUstep
    format) — one `<dict>` per package keyed by pkgname, not deb822, RPM
    XML, or APKINDEX's single-letter text format. Parsed with the `plist`
    npm package rather than hand-rolling a plist walker — the same
    "reach for the standard library for the format" choice as `tar` for
    Arch/Alpine's archives. `pkgver` (e.g. `0ad-0.27.1_6`) is always
    `<pkgname>-<version>_<revision>` by xbps convention, so the version
    is recovered by slicing off the already-known pkgname prefix. main
    (14,746) + nonfree (67) + multilib (5,710, `-32bit`-suffixed 32-bit
    compat packages) are disjoint, zero name collisions verified, same
    pattern as openSUSE's oss/non-oss and Alpine's main/community.
    Verified `index.plist` has no Section/Group-equivalent field at all
    (schema scan: `architecture`, `homepage`, `license`, `maintainer`,
    `pkgver`, `provides`, `run_depends`, `shlib-requires`, `short_desc`,
    `source-revisions`, `sourcepkg` only) — filtering is name-pattern
    only here, same situation as Alpine/AUR/Arch.
    `src/sources/xbps-void/fetch.ts`.
14. **Slackware** — `PACKAGES.TXT`, a single plain-text file (no
    compression, no repo/arch split — the simplest native source here),
    1,887 packages. Blocks are `KEY: value` header lines followed by a
    `PACKAGE DESCRIPTION:` section whose lines are prefixed `<name>:`.
    Slackware doesn't split `-dev`/`-doc` subpackages out the way Debian/
    Fedora do (packages are "fat", headers/libs/binaries all in one
    `.txz`), so the existing name-pattern filter has far less to catch —
    its package "series" (the short component code in `PACKAGE
LOCATION`, e.g. `l` for libraries, `kde`, `y` for games) is a real
    signal where the name alone isn't. `src/sources/slackware/fetch.ts`.
15. **Solus** — `eopkg-index.xml.zst` (Zstandard, same "Node's built-in
    zlib decodes it" pattern as Fedora/openSUSE, 4.1MB vs. 67MB
    uncompressed), 11,660 packages in Solus's single rolling repo
    ("shannon"). A richer XML schema than RPM/deb822: `Summary` repeats
    per language (English picked by `xml:lang="en"`) and there's no flat
    `Version` field — it's the most recent `<Update>` under `<History>`
    (verified always listed newest-first). `PartOf`, a dotted
    hierarchical grouping (e.g. `games.strategy`, `programming.library`,
    115 distinct values), serves the same Section-equivalent role.
    `src/sources/eopkg-solus/fetch.ts`.
16. **Gentoo** — source-based (ebuilds compiled locally via `emerge`,
    conceptually closer to AUR's build-recipe model than a binary repo),
    and its own official binary package host
    (`distfiles.gentoo.org`'s `Packages` index) has no description or
    homepage field at all — real per-package metadata only lives in the
    Portage tree's `md5-cache` (pre-computed ebuild variables), bundled
    in a periodic full-tree snapshot (`portage-latest.tar.xz`, ~48MB
    compressed). The one native source needing an actual XZ-decompression
    dependency (`xz-decompress`, WASM-based — Node's built-in zlib has
    gzip/brotli/zstd but no XZ/LZMA support) and a from-scratch tree walk
    — a meaningfully bigger lift than every other source here, which each
    reused an already-established parsing pattern. Reduced from ~32,800
    raw category/package/version cache files down to 19,443 rows, one per
    category/package at its latest version — picked via a best-effort
    (not full Package Manager Specification) version comparator, which
    explicitly excludes live (`9999`) ebuilds unless they're a package's
    only version, since Portage treats `9999` as always-highest by
    design. `src/sources/ebuild-gentoo/fetch.ts`.
    Clear Linux was investigated as the other remaining "Other native"
    candidate and dropped: its CDN (`cdn.download.clearlinux.org`) no
    longer resolves at all (Intel discontinued the distro) — the
    bundle-based install model (coarse bundles like "editors", not
    individual packages) wouldn't have fit this catalog's per-app model
    even if the infrastructure were alive. With Gentoo shipped, every
    identified native package-manager source is now either implemented
    or explicitly ruled out — see the "Derivative distros with genuinely
    unique in-house software" card on the Tuxery GitHub Project for the
    next distinct category (curated per-distro app stores, not package-
    manager dumps).
17. **Nixpkgs** — `channels.nixos.org/nixos-unstable/packages.json.br`, a
    single continuously-updated channel dump — the closest thing to a
    full-catalog file this codebase has seen (149,121 raw entries, more
    than AUR). The `.br` extension is misleading: the server sends a real
    `Content-Encoding: br` header, and Node's `fetch` transparently
    decompresses it itself — `response.text()` already returns plain
    JSON, no manual `zlib.brotliDecompressSync()` step (unlike Fedora's
    Zstandard handling, which does need one — confirmed by hitting a
    decompression error until this was found). Filtered to `x86_64-linux`
    (149,071 of 149,121) and dropped `broken`/`unavailable` entries
    (32,062 combined) at fetch time — a technical fact, not a curation
    judgment: these genuinely can't be installed today. `pname` alone
    isn't unique (the same library exists under several attribute paths —
    different language-version package sets, mainly: 20,700 of 114,016
    unique `pname`s are used more than once) — the full attribute path is
    the real identifier. `src/sources/nix-nixpkgs/fetch.ts`.

Row 7 is a different category from everything above: not a general-purpose
package manager, but a derivative distro's own curated app store/repo of
genuinely first-party software (not a reskin/rebuild of the parent distro).
See the "Derivative distros with genuinely unique in-house software" card
on the Tuxery GitHub Project for the full researched list, including
explicitly-filtered-out derivatives (CachyOS, Manjaro, EndeavourOS, Garuda,
Ubuntu flavours, Rocky/AlmaLinux, Raspberry Pi OS — near-vanilla rebases
with no distinct software of their own). Zorin OS and Kali Linux were
evaluated and concluded not worth a connector: Zorin's `stable` PPA has
real `zorin-*` branded packages, but they're almost entirely metapackages/
wallpapers/telemetry, ~4 genuinely launchable apps out of 231 (zorin-
connect, zorin-appearance, zorin-appgrid-lite, zorin-windows-app-support);
Kali's `main` component is 71,092 packages, essentially the full Debian
archive plus security tools under their own real upstream names (already
reachable via the Debian/Ubuntu connectors) — its 93 `kali-*` packages
are almost entirely desktop-variant metapackages and tool-category bundle
menus, ~4-5 genuinely distinctive launchable tools (kali-undercover,
kali-tweaks, kali-win-kex, kali-autopilot). Neither yield justified the
connector-building cost — see the "Derivative distros" card for the full
research writeup.

18. **elementary AppCenter** — its own Flatpak remote (not Flathub), same
    `appstream.xml.gz` mechanism, parsing shared with Flathub via the new
    `_shared/appstream.ts`. 158 curated, reviewed, pay-what-you-can apps
    built specifically for elementary OS. Verified against the real
    Flathub cache that only 32 of 147 app IDs also exist on Flathub
    (correctly merged by the existing exact-appId matching tier) — the
    other 115 are exclusive to AppCenter, a genuinely distinct channel
    rather than a reskinned Flathub subset.
    `src/sources/flatpak-appcenter/fetch.ts`.
19. **Linux Mint** — deb822 format (same parser as Debian/Ubuntu — Mint
    is a derivative), scoped deliberately to the `main` component only:
    108 packages, all genuinely Mint-authored (mintinstall, Warpinator,
    Hypnotix, Bulky, ...). Mint also publishes `upstream` (rebuilds of
    existing software, e.g. patched Chromium/Caja — mostly redundant
    with Ubuntu's own coverage) and `import` (third-party proprietary
    convenience packages, e.g. Dropbox/Spotify — not Mint's own
    software) components, deliberately left out as a different category
    from this connector's "genuinely unique in-house software" intent.
    Fetched over HTTP, not HTTPS — matches Mint's own real default
    `/etc/apt/sources.list.d/official-package-repositories.list`
    (`http://packages.linuxmint.com`, not `https://`); HTTPS to this
    host also failed to connect during development, consistent with it
    genuinely not being the supported scheme. Reuses Debian's exact
    `Section` vocabulary verbatim — no separate filter signal needed.
    `src/sources/deb-mint/fetch.ts`.
20. **Pop!\_OS** — deb822 format, one `main` component covering the whole
    647-package archive (unlike Mint, no separate own-software
    component) — narrowed to genuinely System76-authored packages by
    name prefix (`cosmic-`/`pop-`/`system76*`) instead. Checked
    "Maintainer contains system76" as a possible inclusion signal and
    rejected it: it pulls in 274 packages, mostly unrelated rebuilds
    System76 maintains for its own infra (Firefox + every
    `firefox-locale-*`, Thunderbird + locales, `ubuntu-release-upgrader`,
    `greetd`, `flatpak`, ...), not their own software. 77 packages on
    real data: COSMIC (System76's from-scratch Rust desktop environment
    — `cosmic-files`, `cosmic-edit`, `cosmic-term`, `cosmic-store`, ...)
    plus `pop-`/`system76-` tools (`pop-launcher`, `pop-upgrade`,
    `system76-power`, ...). A few other real System76 tools exist
    outside these prefixes (`popsicle`, `firmware-manager`, `tensorman`)
    but are deliberately left out rather than hand-picked in — the
    prefix rule is simple and explainable.
    `src/sources/deb-popos/fetch.ts`.
21. **Deepin** — deb822 format, one `main` component covering the whole
    distro archive, narrowed to genuinely Deepin-authored packages by
    name prefix (`dde-`/`deepin-`), same approach as Pop!_OS — 255
    packages out of 71,497 raw stanzas. Unlike every other deb822 source
    here, Deepin's `Packages.gz` keeps every historical version of each
    package in the same file rather than just the current one (e.g. 5
    separate stanzas for `dde-calendar`) — verified against the real
    data that stanzas for the same package are always listed
    newest-first (168 multi-version packages checked, zero out of
    order), so the first stanza per name is kept, same "releases are
    newest-first" assumption Flathub's connector already relies on.
    `src/sources/deb-deepin/fetch.ts`.
22. **MX Linux** — deb822 format (Debian derivative, using Debian's own
    release codenames rather than a distro-specific naming scheme like
    Mint's), one `main` component covering the whole 861-package
    archive, narrowed to genuinely MX-authored packages by name prefix
    (`mx`, matching `mx-*`, per-release `mxNN-*` artwork, and `mxfb-*`
    Fluxbox-edition variants uniformly) — 142 packages on real data:
    real "MX Tools" apps (`mx-tweak`, `mx-snapshot`, `mx-bootrepair`,
    `mx-cleanup`, `mx-live-usb-maker`, `mx-packageinstaller`,
    `mx-repo-manager`, ...) mixed with per-language
    `mx-docs-*`/`mx-faq-*`/`mxfb-docs-*` documentation packages, already
    caught by the existing `NOISE_SECTIONS` filter (`Section: doc` on
    real data) — no new signal needed.
    `src/sources/deb-mxlinux/fetch.ts`.
23. **GOG** — catalog.gog.com/v1/catalog, undocumented but real, public,
    unauthenticated, and already relied on by community tools (Heroic
    Games Launcher, Lutris) that need to query GOG's own catalog
    themselves — not just a scraped guess. `systems=linux` filters
    server-side to Linux-compatible products (2,658 of 12,589 total,
    ~21%, inclusive rather than Linux-exclusive — e.g. Firewatch's own
    `operatingSystems` is `["windows", "linux", "osx"]`); `productType`
    further narrows to real standalone games (1,342 of those), dropping
    "pack" (bundle editions of games already counted on their own,
    e.g. "Planescape: Torment: Enhanced Edition" alongside the base
    "Planescape: Torment") and "dlc" (add-on content, not standalone
    installable). `limit` caps at 100 (a `limit=200` request returns a
    real 400); 27 real pages, fetched sequentially rather than
    concurrently given the API has no documented rate-limit guidance.
    No `description` field exists on the catalog-list endpoint at all
    (only the per-product detail page has one, which would mean 2,000+
    extra requests just for that) — left blank, same precedent as
    AppImage's frequently-blank feed. `src/sources/gog/fetch.ts`.
24. **Lutris** — lutris.net/api/installers, real, public, unauthenticated.
    Its `/api/games` endpoint (347k+ entries) looked more promising at
    first glance but turned out to be mostly an IGDB mirror — most
    entries Windows-only or platform-unlabeled, not a real Linux signal
    on its own; `/api/installers` is the genuinely useful one, 15,557
    community-authored install scripts each tagged with a `runner` —
    "linux" (native, 2,261 of them) is what this connector wants,
    "wine"/"winesteam" (Windows games via a compatibility layer),
    "steam"/"web"/emulator runners (dosbox, scummvm, libretro, mame,
    ...) are all real but a different paradigm from every other source
    here. A `?runner=linux` query param was tried first and verified
    live to be silently ignored (same total count either way) —
    filtering happens client-side after fetching all 63 pages instead.
    Deduplicated down to one row per game (1,795 of them) — 332 real
    games have 2+ published Linux installers (different versions/install
    methods for the same game, not different games), the first one kept.
    No separate game description exists either — the closest available
    text is the chosen installer's own description (e.g. `Play
"RollerCoaster Tycoon 2" CD edition on Linux!"`), which is what gets
    used. `src/sources/lutris/fetch.ts`.

    Real bug, found live (2026-08-25): `normalize.ts` used to set
    `hasGameCategory: true` unconditionally on every entry, on the
    assumption that anything hosted on a "games launcher" must be a game.
    Wrong — Lutris genuinely hosts install scripts for real non-game
    Windows software too (Discord's own entry is one), and neither
    `/api/installers` nor `/api/games` (checked live) carries a
    genre/category field to tell them apart. Fixed by not setting
    `hasGameCategory` at all — a real Lutris-only game simply won't get
    the "Game" badge until a better signal turns up, an honest gap rather
    than a source of false positives.

25. **Manual AppImage seed** — a hand-curated, source-controlled list
    (`src/sources/appimage-manual/manual-appimages.ndjson`) for
    software with no GitHub repo (so `appimage`'s feed+Releases-lookup
    mechanism doesn't apply) and not covered by any other source. `fetch.ts`
    reads and validates this static file — no network call at all — same
    two-stage cache/normalize shape as every other source so it flows
    through `refresh.ts`/the pipeline identically. Records `homepage`
    (where a user goes to get the app), never a raw AppImage download
    URL, matching `appimage`'s own precedent (its `homepage` is the
    GitHub repo page, not a direct binary link). One entry today: pCloud
    Drive, the official client — only unofficial third-party AUR clients
    exist otherwise, and the real official AppImage has no GitHub repo at
    all. Investigated resolving its actual download link for real (found
    a working `api.pcloud.com/getpublinkdownload?code=<fixed-code>` call,
    verified live) but rejected it — the response's `expires` field is
    only hours out, so even caching the resolved link would go stale
    between weekly refreshes, and it wouldn't do anything a `homepage`
    link pointing at pCloud's own install page doesn't already do. A
    separate `Evaluate Portable Linux Apps (portable-linux-apps.github.io)
as a second AppImage source` card was investigated and rejected for
    the general case (its `apps.json` has no download URL at all; the
    real installer is `ivan-hc/AM`, which resolves each app's download by
    running a bespoke third-party shell script per app — no safe,
    structured way to extract a URL without executing ~1,000+ untrusted
    scripts) — this manual seed list is deliberately narrow instead: one
    hand-verified entry at a time, added only when a real motivating case
    (like pCloud) turns up.
26. **RPM Fusion** — the addon repo behind Fedora's own "enable
    third-party repositories" installer option: codecs, NVIDIA drivers,
    Steam, VLC, OBS, and other packages Fedora's own repo can't ship for
    licensing reasons. Four repos for the current release (resolved live
    via the same Bodhi lookup Fedora itself uses, now shared between them
    via `_shared/fedora-release.ts`) — free, nonfree, and each one's
    updates overlay, merged by name with updates winning, same shape as
    `rpm-fedora`'s own Everything+updates merge. Same repomd.xml/primary.xml
    schema as Fedora/openSUSE, but gzip-compressed rather than their
    zstd — `_shared/rpm-repodata.ts`'s `fetchPrimaryXml` now picks the
    decompressor from the file extension instead of assuming one, a real
    gap this connector's own live verification caught. Unlike
    `rpm-fedora`, keeps `<rpm:group>` (populated with real values here —
    "Amusements/Games", "Applications/Multimedia" — not the
    always-"Unspecified" Fedora leaves it), which also extends
    `looksLikeGamePackage` in curator's `filter/rules.ts`: RPM Fusion
    reuses the identical `Amusements/Games` prefix openSUSE already
    uses, verified against real entries (gltron, stepmania,
    doom-shareware, ...) before wiring it in. `src/sources/rpm-rpmfusion/fetch.ts`.
27. **Debian AppStream (DEP-11)** — not a new install channel but the
    distro's own per-package app metadata layer, published as
    `dists/<suite>/<component>/dep11/Components-<arch>.yml.gz` for
    main/contrib/non-free (Ubuntu ships the identical format, so the
    parser is shared: `_shared/dep11.ts`, same cross-source reason as
    `deb822.ts`). Hand-rolled parser rather than a YAML dependency: the
    DEP-11 shape is flat and machine-generated, only the consumed subset
    of keys is read, and unknown blocks are skipped by indentation until
    the next column-0 key — verified against the real 545k-line
    `dists/stable/main` file (2,062 components parsed in ~70ms; spot
    checks gitg/Secrets/gammaray). Only untranslated `C:` entries are
    read, like `_shared/appstream.ts`; `Description` block scalars are
    flattened from HTML with the same paragraph/list conventions the XML
    path produces. `Icon: remote:`/`source-image:` urls resolve against
    the document's own `MediaBaseUrl`; `cached`/`stock` icons and
    screenshot thumbnails are theme/filename data with no fetchable URL
    and are ignored. Components join the catalog by binary package name
    (`Package:`) via the exact-appId tier — enrichment, never a standalone
    listing. Verified live against the real files before wiring in:
    2,109 components, 1,338 with a usable icon url, 817 with screenshots,
    606 with a developer, 2,054 with categories. Measured on the merged
    catalog (2026-09-03): +612 apps gaining an icon, +112 a developer,
    +147 screenshots, −122 "To Classify", and ~198 previously-separate
    groups merging where a DEP-11 human display name bridges two
    bare-package-name groups (GENERIC_NAME_BLOCKLIST guards the generic
    names; sampled merges all genuine — Ptyxis, Dialect, TuxGuitar, ...).
    `src/sources/deb-debian-appstream/fetch.ts`.
28. **openSUSE AppStream** — the RPM-native equivalent of [27]: Tumbleweed
    publishes an `appdata` + `appdata-icons` pair in each repo's
    repomd.xml (location discovered from the repomd itself — the
    content-hash filename changes on every refresh, same as
    `primary.xml`), keyed by `<pkgname>` so components join the
    `rpm-opensuse` listing by exact appId. Parsed by the shared
    `_shared/appstream.ts` (the Flatpak parser — same AppStream XML
    schema), extended to thread `<pkgname>`/`<source_pkgname>` through.
    oss + non-oss: 887 components, 847 joining the merged catalog.
    `src/sources/rpm-opensuse-appstream/fetch.ts`.

## Cross-cutting notes

- **Two-stage model per source**: `fetch.ts` (network → `src/sources/cache/<source>.ndjson`, source-specific row type) and `normalize.ts` (cache → the shared `SourcedPackage` type). Only `fetch.ts` needs implementing per row above — `normalize.ts`, the cache read path, and tests already exist per source (see the root [`AGENTS.md`](../AGENTS.md)'s "Source cache" section).
- **Fetch metadata**: every implemented `fetch.ts` writes a `cache/<source>.meta.json` sidecar — `fetchedAt`, the upstream `url`, `entryCount`, plus source-specific details (Flathub's `arch`, Snapcraft's `deviceSeries`/`categoriesSwept`). See `_shared/metadata.ts`.
- **Matching cost**: the curator module's `match/group.ts` (formerly the standalone `the old matcher package` package — merged into `curator` alongside the new `filter/` stage) originally bucketed by an 8-char normalized-name prefix before pairwise scoring within each bucket — a mitigation over a naive full pairwise scan, but one whose cost still climbed super-linearly as more sources landed: ~6s at ~123k packages, ~26s at ~192k, ~51s at ~268k, ~111s at ~357k raw, ~35s after `curator/filter` cut the input to ~303k (see the "Matcher bucket sizes growing again" card, now closed). It's since been replaced with a union-find over exact-match tiers — manual overrides → exact `appId` → exact normalized name, each an O(1)-per-package map lookup, no pairwise comparison at all. A fourth, fuzzy/scored tier (`match/score.ts`'s `scoreMatch`, name-distance + appId + icon-filename weights) was considered but turned out to be mathematically unreachable once the two exact tiers run first — with the current weights (name 0.5, appId 0.35, icon 0.15) and a 0.75 threshold, no pair lacking an exact appId or exact name can score above 0.65 — so it was dropped rather than shipped as inert code; `scoreMatch` stays exported for when weights get revisited. Net effect: grouping the filtered ~303k packages now takes well under a second. The exact-`appId` tier's own `GENERIC_NAME_BLOCKLIST` protection (see the constant's comment in `match/group.ts` for the full list of real cross-source collisions it was built to prevent) originally only guarded the exact-name tier — an ultra-review pass caught that the identical class of collision reaches the appId tier too, since bare-package-name sources (AUR, Arch, Fedora, Debian/Ubuntu family, Snapcraft, Alpine, Void, Slackware, Solus, openSUSE, Gentoo, nixpkgs) literally use the package name as `appId`. Confirmed live before fixing: `fuse`, `weather`, `calendar`, and `notes` were each merging 3-8 bare-appId sources into one group purely on this unguarded tier — every one happened to be the same real software today (no visible wrong merge), but with no actual guard against the same unrelated-software collision the blocklist's own examples describe. Fixed by applying the identical blocklist check (via `tier1Key`) to the appId tier; the four affected clusters now correctly split back into one app per source rather than staying merged by luck.
- **Scheduled refresh**: `.github/workflows/refresh-sources.yml` runs every `fetch.ts` weekly (Saturday 4am UTC — weekend timing on purpose, see the workflow's own comment — or on demand via `workflow_dispatch` for a single source), opening a PR with any cache diff rather than pushing straight to main (branch-protected, PR + rebase only) — one source failing doesn't block the others, it's just left at its last successful cache state.
- **GUI vs CLI classification**: the curator module's enrich stage (`hasGuiEvidence` in `enrich/index.ts`) sets `CatalogApp.kind = "gui"` when any member package carries positive evidence, from two signals. `SourcedPackage.hasDesktopFile` (Fedora/openSUSE only, parsed from `<rpm:provides>`'s synthetic `application(*.desktop)` entry — RPM tooling generates this for any package shipping a `.desktop` file) is the first, narrowest, 100%-precise-where-present but low-coverage (~3%) signal. `filter/rules.ts`'s `looksLikeGuiPackage` is the second, weaker Debian/Ubuntu-only signal — no equivalent synthetic desktop-file marker exists in `Packages.gz`, so it leans on `Section` instead, verified by cross-tabulating every real Section value against apps already known to be GUI via the Fedora/openSUSE signal (228k-app merged catalog, 8,342 apps had both a Debian/Ubuntu section and a Fedora/openSUSE package to check against, 18.4% baseline gui rate in that population): `sound`/`editors`/`video`/`graphics`/`math`/`science`/`hamradio`/`games`/`contrib-games` came back well above baseline (42-75%) _and_ sampled clean on manual inspection; `x11`/`gnome`/`kde`/`xfce` had comparably high raw rates but were rejected after sampling turned up real desktop-environment theme/icon/plugin packages Section alone can't tell apart from real apps (`adwaita-icon-theme`, `breeze-icon-theme`, `arc-kde`, Numix icon themes, ...) — same "_look at real samples, not just the percentage_" trap as the noise-filter Section sets below. A further exclusion list (`-data`/`-common`/`-plugin(s)`/`-server`/`-icon(s)` suffixes) filters out companion packages riding along under the same safe Section as their real app (`0ad-data` next to `0ad`, `ardour-lv2-plugins` next to `ardour`) — none of these suffixes are caught by the noise filter's own `NOISE_PATTERNS`, which is scoped to dev/debug/doc/lib/font/language-module naming, not this. Both signals stay deliberately one-directional — absence never sets `"cli"`. Combined, 7,895 of 228,076 apps in the real merged catalog are classified `"gui"` (up from 3,029 with the Fedora/openSUSE signal alone). Still not checked: an Arch/AUR signal, and Flatpak/Snap/AppImage source presence as a weaker fallback — see the "GUI vs CLI classification" card.
- **Apps vs games classification**: same pattern as GUI vs CLI, a different axis (a game can be GUI or terminal-based) — `hasGameEvidence` in `enrich/index.ts` sets `CatalogApp.contentType = "game"` from two signal families, both positive-evidence-only. `SourcedPackage.hasGameCategory` (Flathub/AppCenter only, parsed from AppStream's `<categories><category>Game</category></categories>` — the freedesktop.org menu spec's own top-level category, via `_shared/appstream.ts`) is the direct, first-party signal: 773 of Flathub's 4,680 real `<component>` entries carry it. `filter/rules.ts`'s `looksLikeGamePackage` covers every source whose Section-equivalent field has its own games grouping, each sampled against real data before trusting it: Debian's `games`/`contrib/games`/`non-free/games` (bare in Debian's own unstripped `section`, `games` only for Ubuntu since its `normalize.ts` strips the `<component>/` prefix — Mint/Pop!_OS/Deepin/MX Linux reuse Debian's unstripped form) — 1,178 Debian and 1,237 Ubuntu entries sampled, all real games or a game's own data/server sub-package; Gentoo's `games-*` category prefix — 765 sampled, same result; openSUSE's `Amusements/Games` `<rpm:group>` prefix — 251 sampled, all games plus a couple of gaming-adjacent tools openSUSE itself groups there (`PlayOnLinux`); Solus's `games`/`games.*` `PartOf` value — 169 sampled, same story (`antimicrox`, a joystick-to-keyboard mapper). Slackware's `y` series was checked and left out — only 3 real entries, too small a sample to trust either way. 1,877 of 228,326 apps in the real merged catalog are classified `"game"` (1,069 of those also `"gui"` — most games are, but the two fields are computed independently, e.g. terminal roguelikes are `"game"` without being `"gui"`). Distinct from and doesn't attempt to solve the much larger "Define the category taxonomy" card (genre-level browsing) — this is only the coarse apps-vs-games split.
- **Category taxonomy**: `enrich/category.ts`'s `pickCategory` sets `CatalogApp.category` to one of 10 display labels (Developer tools, Science, Education, Graphics & Creativity, Multimedia, Productivity, Internet & Communication, System tools, Settings, Utilities), sourced from `SourcedPackage.categories` (Flathub/AppCenter's raw AppStream `<category>` list, threaded through by the same `_shared/appstream.ts` change that added `hasGameCategory`). Deliberately narrower than freedesktop.org's full menu-spec vocabulary: only the 13 registered "Main Categories" are recognized (Additional Categories like `ArcadeGame`/`TextEditor`/`WebBrowser` aren't mapped, a possible follow-on), and "Game" is excluded entirely — that's `contentType`'s job, not this. Verified against real Flathub data (3,240 desktop-application components): 2,561 (79%) carry a non-Game Main Category, 652 (20%) are Game-only, only 27 (0.8%) have neither. `Audio`/`Video` collapse into `Multimedia` alongside `AudioVideo` itself — checked that they overwhelmingly co-occur (147 apps carry both `Audio` and `AudioVideo`, only 23/3 carry `Audio`/`Video` alone) rather than being three distinct buckets. When a package has more than one Main Category (749 of 3,240, e.g. `Office`+`Utility` 59 times), a fixed preference order picks the more specific one, `Utility` always losing — freedesktop's own spec describes it as the generic catch-all, confirmed by real pairings (`Office`+`Utility`, `Development`+`Utility`, `Network`+`Utility`, ...). Picked from whichever member package actually has category data, not strictly the group's representative package — AppCenter isn't in `enrich/index.ts`'s `SOURCE_PRIORITY` at all, so a Snapcraft+AppCenter group's representative would never carry categories on its own otherwise. 2,682 of 228,326 apps in the real merged catalog have a category. Display labels cross-checked against Microsoft Store's own published taxonomy and the original homepage spec's section names (see the card for the full research) — trimmed down deliberately, not a wholesale adoption of either.
- **Rich fields from AppStream**: first slice of "Populate CatalogApp rich fields per source" — `_shared/appstream.ts` extended (the same file the game/category signals already use) to also expose `<project_license>` (`license`), `<developer_name>`/`<developer><name>` (`developer`, real data has both forms — 3,231 of 3,240 real Flathub components use the simpler bare-string `developer_name`, only 5 use the newer translated `<developer>` form), `<description>` (`longDescription`, flattened from its `<p>`/`<ul>`/`<ol>` structure to plain text), `<screenshots>` (`screenshots`, always full URLs already), and a resolved `iconUrl` (`resolveIconUrl`: a `type="remote"` icon's URL directly when present — 100% of real Flathub components, only ~8% of AppCenter's — else `iconFilename` joined against that connector's own repo base, verified live against both). Two real bugs caught fixing this against live data, not just the fixture: `<description>` repeats once per translation exactly like `<name>`/`<summary>` (GIMP has 30 of them) — reading it naively flattens every language's paragraphs together; and `<p>`/`<li>` text can carry nested inline markup (`<em>`, ...) that fast-xml-parser turns into a nested object instead of a plain string (hit on `app.authpass.AuthPass`'s real description) — `extractText` recursively concatenates string leaves to handle it, at the cost of not guaranteeing word order around the inline tag specifically (plain paragraphs, the vast majority, are unaffected). Also fixes a real regression flagged by the card itself: Snapcraft's `normalize.ts` had a full icon URL from its own API and discarded it down to just a filename — now keeps both. Picked per-app the same way as `category` (`enrich/index.ts`'s generalized `pickField`, from whichever member package actually has the data, not strictly the `SOURCE_PRIORITY` representative). All of `CatalogApp`'s fields, the Turso schema, and `app`'s mirrored types/detail-page rendering were already fully wired from earlier "typed now, sourced later" work — this only starts sourcing the values. Verified against the real merged catalog (228,326 apps): ~3,400 have `license`/`developer`/`longDescription`/`screenshots` each (Flathub/AppCenter-only fields), ~5,800 have `iconUrl` (broader, since Snapcraft contributes too) — Firefox and Blender spot-checked with correct real values (MPL-2.0/Mozilla, GPL-3.0/Blender Foundation). `ageRating` deliberately not attempted here despite AppStream's `<content_rating>` being present on all 3,240 real components (707, ~22%, have actual `<content_attribute>` ratings, the rest an empty self-closing marker) — OARS doesn't expose a single "value" directly, computing one needs implementing OARS's own published age-scoring algorithm from the attribute levels, a large enough separate piece of work to deserve its own slice rather than rushing it in here.
- **Catalog filtering**: the curator module's `filter/` drops packages that look like libraries/dev-headers/docs/fonts/language-ecosystem-modules rather than apps/games, two independent signals: name patterns (`looksLikeSupportPackage`) and the upstream `Section`-equivalent field, when the source has one (`looksLikeSupportSection`, `SourcedPackage.section`) — both verified against real cache data before landing. The `^lib` name prefix has real exceptions (LibreOffice, LibreCAD, Libreddit, ...) rescued by exact name via `config/filter-keep.json` rather than by pattern (a `libre*`-prefix allowlist was considered and rejected: 1,208 unique `libre*` names exist, only 25 are real). Debian/Ubuntu's Section signal is deliberately narrow — `libs`/`libdevel`/`oldlibs`/`doc`/`debug`/`introspection`/`gnu-r` only; tempting-looking sections like `python`/`perl`/`golang`/`devel`/`kernel` were checked and rejected, since real standalone tools (black, composer, cliphist, cosign, ...) show up in them too densely to blanket-exclude. Nixpkgs reuses the same `section` slot for its attribute-path namespace prefix (`kdePackages.akregator` -> `kdePackages`) — same discipline applied: verified language/toolchain package sets (R, Haskell, Python, Perl, OCaml, Lua, Ruby, TeX Live, Typst, Qt6, Wine, Godot, PostgreSQL) plus a general `*Plugins`/`*Extensions` suffix pattern (verified safe across ~10 different host-app namespaces), but _not_ a blanket `*Packages` suffix — `kdePackages` and `php83Packages`/`phpPackages` were checked and rejected for the same "real tools mixed in" reason (composer, psalm, akregator, ark). openSUSE reuses the same slot again for its hierarchical `<rpm:group>` value — six exact-match groups (`System/Libraries`, `Documentation/HTML`, `Documentation/Other`, `System/X11/Fonts`, `System/Localization`, `Metapackages`) verified safe (15-60 sampled entries each, one real exception found and allowlisted by name — `seidl`, a monitoring client, not an install-time metapackage); `Development/Libraries/*`/`Development/Languages/*` hit the exact same trap as Debian's devel/python/perl/golang sections (clisp, love, act, typescript, codespell, ... mixed in) and were rejected the same way. Slackware reuses the slot again for its package "series" — only two of its 15 values are safe (`l`/libraries, `f`/FAQs-docs; one real exception, `glade`, allowlisted); Solus reuses it for its dotted `PartOf` grouping (115 distinct values) — seven safe after sampling (`debug`, `programming.library`/`desktop.library`/`multimedia.library`, `programming.docs`, `desktop.theme`, `emul32`; one real exception, `dcraw`, allowlisted), and even `programming.devel` (2,070 packages, 98.6% already `-devel`-suffixed and so already caught by name pattern) was rejected once its un-suffixed 1.4% tail turned up real tools (gcc-13, dpkg, mingw-w64) for zero marginal catch. Effective on Debian (~54.3%), Ubuntu (~48.9%), Fedora (~54.7%), openSUSE (~43.3%), Solus (~67.6%, the second-largest single-source cut), and Nixpkgs (~80.0%, by far the largest — the language-ecosystem long tail dominates nixpkgs even more than Debian); much less so on AUR (~7.4%), Arch official (~17.6%), Alpine (~39.4%), Void (~32.3%), Slackware (~33.0%), and Gentoo (~5.0%, the lowest of any source) — Alpine/Void verified to have no Section-equivalent field at all (Alpine's APKINDEX, Void's index.plist), so filtering there is name-pattern only, same situation as AUR/Arch; Slackware has a real signal but its own packaging convention doesn't split `-dev`/`-doc`/`-static` subpackages out the way Debian/Fedora do, so the name-pattern half of the filter has far less to catch regardless; Gentoo reuses the slot for its top-level category — most categories mix real tools with libraries like everywhere else, but `acct-group`/`acct-user` (900 packages, pure system-account definitions) and `virtual` (134, Portage's own provider-selection abstractions) are unambiguous and excluded; found via a data-quality pass on the merged catalog, not proactively — these were surviving the filter and polluting cross-source name matches (e.g. `acct-group/clock` merging into the real Clock app group, before the curator module's match tier also got a `GENERIC_NAME_BLOCKLIST` fix for exactly that class of bug — see `match/group.ts`). Gentoo otherwise, like Slackware, doesn't split dev-file subpackages out by naming convention. Mint, Pop!_OS, Deepin, and MX Linux all reuse Debian's exact Section vocabulary verbatim (each is a Debian/Ubuntu derivative publishing the identical deb822 format) — no new signal needed for any of them; effective at ~0.9% (Mint), ~50.6% (Deepin), and ~47.2% (MX Linux) — Deepin/MX Linux mix in far more libraries/dev-files/localized-docs than Mint's small, deliberately-curated `main` component does; Pop!_OS not separately measured given its small size (77 entries) after the connector's own name-prefix scoping already does most of the narrowing. A reverse-dependency-graph signal and AUR's self-declared Keywords field were both investigated as a further AUR/Arch-specific improvement and found not viable (see the "Filter is far less effective on AUR/Arch" card for the full research writeup) — the ticket stays open for a genuinely new idea. `config/filter-keep.json` and `filter-exclude.json` (in `src/curator/overrides/`) are the manual escape hatch on either side; see that directory's `README.md` for the "would a user launch this on its own" litmus test used to decide `filter-keep.json` entries.
- **Aggregated ratings**: `CatalogApp.rating` is a count-weighted average across every member package's own `SourcedPackage.rating` (`enrich/index.ts`'s `aggregateRating`) — genuinely combined, not picked from one source, since a game sold on GOG and packaged on Flathub carries two real, independent vote pools that both deserve to count. Two sources feed it. **GNOME's ODRS** (`_shared/odrs.ts`, `odrs.gnome.org/1.0/reviews/api/ratings`) is the community-review backend behind GNOME Software and Flathub's own star ratings — one unauthenticated bulk GET returns all 10,700 rated apps (~2MB, no pagination), joined against Flathub/AppCenter's AppStream ids at fetch time. Real, surprising data-quality find along the way: ODRS never migrated old review submissions onto one canonical id shape — the same app can have separate vote pools under its bare AppStream id (`org.mozilla.Firefox`, the dominant real-data convention — 2,561 of 3,348 real Flathub matches) _and_ the older `.desktop`-suffixed GNOME Software convention (`org.mozilla.Firefox.desktop`, a smaller supplementary pool — 197 real Flathub apps have both, with different vote counts each), plus mixed id casing throughout. `pickOdrsRating` checks both forms case-insensitively and sums whichever exist rather than picking one and silently dropping real votes — an initial exact-case, suffix-only join undercounted badly (204/3,348 Flathub matches, 6.1%) until this was caught by comparing the bulk dump against ODRS's own per-app endpoint live; the fixed join covers 2,571/3,348 (77%) of Flathub and 77/158 (49%) of AppCenter. **GOG** exposes `reviewsRating`/`reviewsCount` directly on its catalog API (0-50 scale, e.g. `39` = 3.9/5 — verified live against real product pages) — games only, no join needed, `reviewsCount: 0` (unreviewed) dropped rather than kept as a fake zero. 3,820 of 230,719 apps in the real merged catalog carry an aggregate rating today. Per-source detail needs no new field: each `SourcedPackage.rating` stays readable on `CatalogApp.packages`, and `app`'s detail page now renders a "Ratings by source" row alongside the aggregate badge whenever more than one source has one.
- **Aggregated trends/popularity**: `CatalogApp.popularity` is a plain mean across every member package's own `SourcedPackage.popularity` (`enrich/index.ts`'s `aggregatePopularity`) — unlike `rating`, there's no natural weight (a vote count) to skew by, so a simple average of whichever member packages have a score. Each source's own score is normalized to 0-1 _within that source's own distribution_ before reaching here, since the raw signals are on completely incompatible scales otherwise. **AUR** reuses `Popularity`, a field already present in the bulk metadata dump `pacman-aur/fetch.ts` already downloads (no extra request) — a decayed usage-frequency float ranked into a percentile score across all real entries (`rankPopularity` in that connector's `fetch.ts`); only the 26,583 of 117,747 real packages (23%) with any real votes get a score, the rest (never installed via a Popularity-reporting AUR helper) are left unscored rather than assigned a fake bottom value. **Flathub** exposes its own "Popular" collection — the identical ranked list its own frontend renders (`flathub.org/api/v2/collection/popular`, live, unauthenticated, one request, no per-app calls) — its top 250 apps get a score by list position, everything outside the list gets none. 24,752 of 230,733 apps in the real merged catalog carry a popularity score today (`Sober`, `yay`, `paru`, `visual-studio-code-bin` topping real live data — all genuinely popular real-world tools, not noise). Powers the homepage's "Apps & games trends" section (`app`'s `getTrendingApps`, `ORDER BY popularity DESC LIMIT 60`) — previously a placeholder reusing the plain alphabetical listing with an explicit "ranking criteria still TBD" note.
- **Software suites**: `CatalogApp.suite` links a bundled "main" app to its separately-installable "component" apps — e.g. LibreOffice's single Flathub flatpak (which the match tiers already fold Debian/Ubuntu/Fedora's own bare `libreoffice` metapackage into, via exact normalized-name matching) alongside `libreoffice-writer`/`-calc`/`-impress`/`-draw`/`-base`, each independently installable on Debian/Ubuntu/Fedora. Deliberately not auto-detected — a small hand-curated list (`config/enrich-suites.json`, same "manual, not heuristic" discipline as `GENERIC_NAME_BLOCKLIST`), joined against the already-built `CatalogApp[]` array by `enrich/suite.ts`'s `applySuites`. Two real suites today: LibreOffice (5 components) and Calligra (5 components — Words/Sheets/Stage/Plan/Karbon; deliberately narrower than every real `calligra`-named package, since Void Linux fragments it into many packaging artifacts — 32-bit variants, `-devtools`, `-handbook`, `-libs`, `-plugins`, `-data` subpackages — that fail `filter-keep.json`'s "would a user launch this on its own" litmus test). Doesn't record which sources are "bundled" vs. "component-only" as a separate field — each app's own `packages` array already answers that directly, so the existing install-CTA logic in `app` needs zero changes to correctly show only the sources a given component (or the bundle) actually has. Caught a real false-merge while shipping the manual AppImage seed source alongside this: `appimage-manual`'s official pCloud Drive entry and AUR's unrelated `pcloud-drive` ("Electron edition", a third-party reimplementation) both normalize to the same name and merged via Tier 2 — fixed via a `match-deny.json` entry, same mechanism as this session's earlier Calculator/Weather false-merge fixes.
- **Fedora/Ubuntu release freshness**: both `fetch.ts`s used to hardcode a release constant (`RELEASE = "44"`, `SUITE = "resolute"`) that would silently go stale every ~6 months as new distro versions shipped — unlike Debian's `dists/stable/` alias, which always resolves server-side to whatever the current release actually is with no code change needed. Neither Fedora nor Ubuntu has an equivalent URL-path alias (checked: `releases/stable/` 404s on Fedora's mirror; Ubuntu's archive only ever uses codenames), but both have a live API that serves the same purpose. Fedora: Bodhi's `/releases/` endpoint marks the currently-supported releases (not EPEL/ELN, which share the same endpoint) `state: "current"` — typically two at once during the post-release overlap window, so `_shared/fedora-release.ts`'s `resolveCurrentFedoraRelease` takes the higher version number, matching what a fresh install gets — shared with `rpm-rpmfusion`, an addon repo tracking the same release number, rather than duplicated. Ubuntu: Launchpad's `/ubuntu/series` endpoint marks exactly one series `status: "Current Stable Release"` at a time (LTS releases stay `"Supported"` long after they stop being current, so that status alone isn't enough) — `deb-ubuntu/fetch.ts`'s `resolveCurrentSuite` reads it directly. Both resolved live at the start of every fetch now, verified against real data (2026-08-17: Fedora 44, Ubuntu resolute/26.04 — both matching the values that used to be hardcoded).
- **Desktop-shell extensions excluded**: `looksLikeSupportPackage` in `filter/rules.ts` now also treats GNOME Shell extensions, KWin effects/styles/decorations, Plasma applets/plasmoids, and COSMIC panel applets as noise — same "needs a host to do anything" reasoning as a library, decided 2026-08-20 rather than building a dedicated "Extensions" section. Verified live before committing to each pattern: `gnome-shell-extension-` is real and large (422 AUR, 1,378 Nixpkgs, 48 Fedora, 41 Debian, among others) — two real standalone tools happen to share the prefix without being extensions themselves (`gnome-shell-extension-manager`, a GTK app; `-installer`, a bash script), rescued via `config/filter-keep.json`. `kwin-effects?-`/`kwin-style-`/`kwin-decoration-` deliberately don't match bare `kwin`/`kwin-x11`/`kwindowsystem` — the compositor and its library, a different category not in scope here. Plasma widget naming shows up as both a prefix (`plasma6-applets-kara`) and a suffix (`kalgebra-plasmoid`, `kclock-plasma-applet`) depending on packager, so the pattern covers both. COSMIC is scoped to `cosmic-ext-applet-` specifically, not the broader `cosmic-ext-` prefix — verified live that the wider prefix also covers real standalone third-party COSMIC apps (`cosmic-ext-calculator`, `cosmic-ext-tweaks`, `cosmic-ext-control-center`, ...), not just panel applets.
- **Kernel modules and SDK libraries excluded**: two more `looksLikeSupportPackage` patterns, decided 2026-08-23. DKMS packages (`nvidia-580xx-dkms`, `acpi-call-dkms`, Ubuntu's own `nvidia-dkms-535-open`, ...) need `insmod`/the kernel as a host, never launched on their own — verified 484+ in AUR alone, no exceptions found; the pattern can't be a strict suffix match since real driver variants tag a version/suffix after `dkms` rather than ending there (`nvidia-340xx-dkms-macbook`). "SDK"-shaped names are overwhelmingly per-service API client libraries or build kits, not launchable tools: `aws-sdk-cpp-<service>` alone is 400+ packages (one per AWS service) across sources, `aliyun-python-sdk` is 490 in Nixpkgs alone, plus `azure-sdk`, `py3-sentry-sdk`/`-slack-sdk`/`-splunk-sdk`, and Snapcraft's KDE/Qt "content snap" SDKs (`kf5-core22-sdk`, ...) — real exceptions are genuine CLI toolchains and are rescued by exact name via `config/filter-keep.json`: `dotnet-sdk` (`dotnet build`/`dotnet run`, across its several per-distro naming schemes — bare, `dotnetN-sdk`, `dotnet-sdk-N.0`), `wasi-sdk` (a clang-based WASI toolchain), `google-cloud-sdk` (the `gcloud` CLI), and bare `android-sdk` (`sdkmanager`) but deliberately not its per-component sub-packages (`android-sdk-build-tools-*`, `-platform-tools`, `-cmake-*`), which are libraries, not the tool itself. Real impact of both patterns together: 230,332 → 228,775 apps.
- **AUR build-variant dedup**: `match/group.ts`'s Tier 2 (exact normalized-name match) now strips AUR's `-git`/`-svn`/`-hg`/`-bzr`/`-cvs`/`-bin` packaging convention before keying — AUR's own submission guidelines reserve those suffixes for an alternate build of the exact same software as the unsuffixed package, not a different project, so treating them as permanent separate apps was a real bug, not a matching gap needing a scored/fuzzy tier. `-git`/`-svn`/`-hg`/`-bzr`/`-cvs` mark a rolling-release snapshot build (`0xtools`/`0xtools-git`, a real user-reported example); `-bin` marks a prebuilt-binary build instead of building from source (4,392 real pairs, e.g. `zen-browser`/`zen-browser-bin` — also user-reported). AUR-only: no equivalent convention verified elsewhere. `pacman-aur/normalize.ts` now also reads the stripped suffix into `SourcedPackage.channel` (its first real populated value — previously typed but unused by any connector), and `app`'s detail page labels a channel-carrying package as e.g. "AUR (git build)" instead of a bare, indistinguishable "AUR" duplicate, and no longer silently prefers a dev build over its official twin in "automatic" install mode. Real impact of `-git`/etc alone: 228,775 → 214,593 apps (spot-checked live for false merges — dupeguru/dupeguru-git, mininet/mininet-git, ulauncher/ulauncher-git, ... all correct pairs); adding `-bin`: 214,593 → 208,288.
- **Zen Browser: a false merge and a false split, found investigating one user report**: Flathub's `app.zen_browser.zen` (display name "Zen"), Snapcraft's `zen-browser-snap`, and AUR's `zen-browser`/`zen-browser-bin`/`zen-browser-git` were four separate apps. Two independent bugs, not one: (1) the `-bin` gap above meant `zen-browser-bin` never joined `zen-browser`/`zen-browser-snap`; (2) Flathub's short "Zen" was instead merging with an unrelated AUR package literally named `zen` ("Reduce your stress with the C language...", nothing to do with the browser) via the exact-name collision `GENERIC_NAME_BLOCKLIST` exists for — now blocklisted, same as `calculator`/`weather`/etc. With `zen` correctly split off, Flathub's real appId and AUR's `zen-browser` family no longer share any name-pattern bridge (a short display name vs. a longer technical one, not a suffix convention), so `config/match-force.json` (Tier 0, empty until now) forces that one specific union instead. Also added `config/enrich-suites.json`'s third entry: seven `zen-browser-<extension>` AUR packages (Bitwarden, Dark Reader, SingleFile, SponsorBlock, uBlock Origin, URL to Desktop, Violentmonkey) are real Zen-specific browser extensions, not standalone apps — same shape as LibreOffice/Calligra, per the user's own suggestion, rather than filter/rules.ts noise (a user might legitimately search for one by name and should land on the real Zen Browser app). `zen-browser-twilight-bin` deliberately left out of the suite — Twilight is a distinctly branded separate release channel (Zen's nightly/beta), not an extension.
- **Source-specific noise conventions**: three more patterns, each verified to mean something different (and non-noise) on other sources before scoping it to the one source where it's actually reliable — a new `looksLikeSourceSpecificNoise(source, name)`, since `looksLikeSupportPackage` is deliberately name-only. Debian-family (`deb-debian`/`deb-ubuntu`/`deb-mint`/`deb-popos`/`deb-deepin`/`deb-mxlinux`) `-source` suffix ships actual source code (kernel-module sources, compiler sources, library archives) — 58 real matches on Debian alone, one exception (`apt-show-source`, a real CLI tool, rescued via `config/filter-keep.json`); checked AUR/Nixpkgs/openSUSE/Fedora too and the same suffix means something else there (real OBS Studio input-source plugins, a real AUR build-variant of a real app), so it's deliberately not source-agnostic. Snapcraft-only `-gadget` suffix is Ubuntu Core's own term for a board's boot-configuration snap (bootloader, device tree, partition layout) — all 6 real matches were board-support packages; checked AUR/Nixpkgs too and found a real exception there (`kubectl-gadget`, a real Kubernetes CLI tool), so also not source-agnostic. AUR-only `android-<arch>-` prefix (verified arches: `aarch64`/`armv7a`/`riscv64`/`x86`/`x86-64`) catches cross-compiled libraries built _for_ Android as a target, not apps — a blanket `android-` prefix was checked and rejected (`android-emulator`/`android-apktool`/`android-file-transfer` are real standalone tools sharing it). 206,806 apps after this pass (208,288 before).
- **App-store/package-manager frontend classification**: `CatalogApp.appStoreFrontend` (new) tags apps whose whole purpose is browsing/installing other software — GNOME Software, KDE Discover, Synaptic, bauh, octopi, pamac, mintinstall, dnfdragora, gnome-packagekit — so they don't get buried under a generic category. Checked a name/description pattern first, per the originating card's own caution, and it genuinely isn't viable: real examples describe themselves too differently for any common phrase to match ("find and install new apps", "managing your applications", "resources management", "Pacman frontend", ...), and generic names collide with unrelated packages (`discover` also matches `haskell-hspec-discover`, `synaptic` as a broad substring matches touchpad drivers). Shipped as a hand-curated exact `{source, name}` list instead (`config/enrich-app-store-tags.json`, `enrich/app-store-frontend.ts`), same discipline as `enrich-suites.json`. 9 real apps tagged on the current catalog, verified live against each entry's actual description before adding it.
