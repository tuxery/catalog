# Rich fields

Which sources fill each of `CatalogApp`'s rich fields (icon, license,
screenshots, ...), and which one wins when they disagree. The code is
[`src/curator/enrich/field-priority.ts`](../src/curator/enrich/field-priority.ts)'s
`FIELD_PRIORITY`; this page is the reasoning behind it. Change it here
first, then in code.

Tracked on the [Tuxery GitHub Project](https://github.com/orgs/tuxery/projects/1)
card "Populate CatalogApp rich fields per source".

## Why

Until 2026-10-12 every field went through one list, the one that picks
the name and description (`SOURCE_PRIORITY`: Flathub, Snap, AppImage,
then the AppStream feeds), and any source left out of it came last in
array order. That was fine while only Flathub and AppCenter filled rich
fields. With every connector about to add some, one list can't hold the
differences between fields: a snap's publisher is not the app's
developer, a Fedora license field is better reviewed than an AUR one, an
RPM build date is not a release. It also took fields from build
variants: VSCodium's page showed VSCodium Insiders' icon, screenshots,
version and download size.

## Rules for every field

1. **One list per field, exhaustive.** A source not listed for a field
   never fills it, so a connector that starts carrying a field has to be
   added here on purpose (see [Adding a source](#adding-a-source-to-a-field)).
2. **Default builds first.** A package that is a parallel line (ESR, an
   LTS track), a build-difference flavor or a pre-release (beta, nightly,
   a snap's edge channel) only fills a field when no default build of
   any listed source has it. Firefox's page describes Firefox.
3. **One package's value, never a merge.** Screenshots, links per type
   and releases each come whole from one package: mixing two sources
   shows two releases side by side.
4. **Empty is absent.** A blank string, an empty list or a placeholder
   license (`unknown`, `NOASSERTION`, ...) counts as no value and leaves
   the field to the next source. Never guessed, never a synthetic default.

## Source tiers

| Tier             | Sources                                                                  | Why this rank                                                                   |
| ---------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Upstream stores  | Flathub, AppCenter                                                       | Metainfo the developers write and keep current themselves                       |
| Distro AppStream | openSUSE, Debian, Ubuntu, Fedora, Arch AppStream feeds                   | The same upstream metainfo, as each distro ships it, often for an older release |
| Stores           | Snap, AppImage, GOG, Lutris, vendor repos, GitHub releases               | Written by whoever publishes the listing, sometimes not the developer           |
| Distro packages  | Fedora, openSUSE, Arch, Alpine, Nix, Gentoo, Void, Solus, AUR, Debian... | Written by packagers: reliable for licenses, silent on the rest                 |

## Per field

| Field                    | Sources, best first                                                                                                                                                     | Notes                                                               |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `iconUrl`                | Upstream stores, distro AppStream, Snap, AppImage, vendor repos, GOG, Lutris                                                                                            |                                                                     |
| `screenshots`            | Upstream stores, distro AppStream, Snap, AppImage, GOG                                                                                                                  | One source's whole set                                              |
| `videos`                 | Upstream stores, distro AppStream, Snap, GOG                                                                                                                            | One MP4/WebM per screenshot; Snap's API carries none                |
| `longDescription`        | Upstream stores, distro AppStream, Snap, GOG, Lutris, AppImage, Nix                                                                                                     | Nix's `meta.longDescription` last: packager-written                 |
| `license`                | Upstream stores, distro AppStream, then packagers: Fedora, openSUSE, RPM Fusion, Arch, Alpine, Nix, Gentoo, Void, Solus, then vendor repos, GitHub, Snap, AppImage, AUR | See [License](#license)                                             |
| `developer`              | Upstream stores, distro AppStream, GOG, AppImage                                                                                                                        | Never a store account, never a packager or maintainer               |
| `publisher`              | Snap, GOG                                                                                                                                                               | The account publishing the listing, see [Publisher](#publisher)     |
| `languages`              | Upstream stores, distro AppStream                                                                                                                                       | The longest list wins, see below                                    |
| `links`                  | Upstream stores, distro AppStream, Snap, AppImage, GitHub releases                                                                                                      | Each link type picked on its own                                    |
| `releases` + `changelog` | Upstream stores, distro AppStream                                                                                                                                       | AppStream `<releases>` only, see below                              |
| `lastUpdated`            | Every package's upstream release date                                                                                                                                   | Newest among default builds, see below                              |
| `approxSizeBytes`        | Flathub                                                                                                                                                                 | A Flatpak download. Installed sizes stay per package                |
| `ageRating`              | Upstream stores, distro AppStream                                                                                                                                       | AppStream `<content_rating>` (OARS), see [Age rating](#age-rating)  |
| `requirements`           | Upstream stores, distro AppStream                                                                                                                                       | AppStream `<requires>`/`<recommends>`/`<supports>`, one line        |
| `permissions`            | Flathub                                                                                                                                                                 | The Flatpak's own sandbox. Partial, see [Permissions](#permissions) |

Not in this table: name, short description and homepage come from the
group's representative (`SOURCE_PRIORITY` in `enrich/index.ts`);
`category` has its own chain (`pickCategoryLabel`); `rating`,
`popularity`, `installsTotal` and `storeCollections` aggregate every
package instead of picking one.

### License

Upstream's own declaration (`<project_license>`) beats the packagers',
then the packagers rank by how much their license field is reviewed:
Fedora and openSUSE check SPDX expressions at package review, AUR
doesn't check anything. A store's field comes after the distros':
Snap's is often `Other`.

`licenseSpdx` comes from the winning license when it converts to SPDX.
When it doesn't ("GPL3" says neither -only nor -or-later), it comes from
the best-ranked other source whose license agrees with it
(`helpers4/license`'s `agree`): Fedora's "GPL-3.0-or-later" gives the
SPDX form of Flathub's "GPL3". A disagreeing source never does. Neither does one whose expression holds a distro's own
identifiers (`LicenseRef-Callaway-BSD`, `LicenseRef-Fedora-...`,
`LicenseRef-SUSE-...`), which mean nothing outside that distro.

`custom` and `LicenseRef-...` are real licenses (proprietary or
source-available, with a URL): they win like any other. Only
placeholders are skipped.

### Publisher

`publisher` is the display name of the account publishing the listing:
a snap's publisher is often not the app's developer (a community snap of
someone else's software), which is why it never fills `developer`.
`SourcedPackage.publisherVerified` is set when the store vouches for the
account (Snap's `validation: "verified"`; `starred` and `unproven` stay
unset). It is carried per package for now: no `CatalogApp` badge yet.

### Age rating

OARS describes intensities per attribute (`violence-cartoon: mild`),
and turning them into a minimum age is each store's policy, not data.
`ageRating` is therefore `{ system: "OARS", value }` with the strongest
intensity declared (`none`, `mild`, `moderate`, `intense`); a rating
with no attribute at all is a checked app with nothing to declare, so
`none`, and an app without `<content_rating>` has none.

### Permissions

`permissions` holds a Flatpak's `finish-args` (`--share=network`,
`--filesystem=xdg-download:ro`, ...), the form the app turns into its
sandbox summary. Flathub's summary API only exposes the shared
namespaces, sockets, devices, filesystems and the session bus's
`talk`/`own` names: `--allow=` features (`devel`), `--persist`, the
system bus and the environment are missing from it even when the
manifest declares them (checked on GNOME Builder, which has
`--allow=devel`). So a list here is a lower bound, and an app without
one (a runtime, an extension) has no sandbox information at all, which
is not the same as a closed sandbox.

### Dates

- `SourcedPackage.lastUpdated` is an **upstream release date** only.
- `SourcedPackage.builtAt` is when the package itself was built or
  uploaded: an RPM's build time, Arch's `%BUILDDATE%`, a snap revision's
  release, AUR's `LastModified`. It describes the listing's freshness
  and stays per package — a distro rebuild is not a release.
- `CatalogApp.lastUpdated` is the newest `lastUpdated` among default
  builds: Chrome's beta and unstable channels don't count.

### Releases and changelog

`releases` comes from one package, and `changelog` (the newest release's
notes) from that same package, so the notes always describe the listed
version. Another package's notes fill in only for that exact version.

### Languages

The longest list among the AppStream sources, ties to the better-ranked
source. A build listing only `en_US` or `en_GB` didn't scan its locale
files (318 Flathub apps on 2026-10-12, Warp and dconf Editor among them):
that doesn't mean the app isn't translated.

### Sizes

`approxSizeBytes` is Flathub's download size without its runtime.
`SourcedPackage.installedSizeBytes` (RPM's `size installed`, Arch's
`%ISIZE%`, Debian's `Installed-Size`) measures something else and stays
on each package for the app to show per install method.

### Fields that stay manual

`features`, `aiFeatures`, `inAppPurchases`, `gdprCompliant`,
`editorialTags` and `reviews` have no upstream signal in any source.
They belong to editorial work or to the developer claim-a-page flow, not
to a connector.

## Adding a source to a field

1. **Fetch**: keep the field in the connector's cache row
   (`src/sources/<source>/fetch.ts` and its `types.ts`), then refresh
   its cache.
2. **Normalize**: map it to the `SourcedPackage` field whose doc comment
   matches its meaning (`lastUpdated` vs `builtAt`, `developer` vs
   `publisher`, `approxSizeBytes` vs `installedSizeBytes`). When none
   matches, add a field and its doc comment rather than bending one.
3. **Rank**: add the source to `FIELD_PRIORITY` at the place this page
   gives it, and update the per-field table here.
4. **Test**: a normalize test with a real sample row, and a
   `field-priority.spec.ts` case when the new source changes who wins.
5. **Measure**: compare the field's coverage before and after on a
   fresh build, and look at a sample of apps where the value changed.
6. **Docs**: the source's row in [`sources.md`](sources.md), and the
   field's doc comment in `sources/types.ts` and `enrich/types.ts`.

A field `CatalogApp` doesn't have yet also needs its store column
(`src/store/turso-client.ts`) and the app's side (`tuxery/app`'s
`catalog-types.ts`, `catalog.ts`): that's a change across both repos.
