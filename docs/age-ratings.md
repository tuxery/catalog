# Age ratings

Every published product carries at most one age, on one scale, and
the bracket the site files it under: `CatalogApp.ageRating` (the
minimum age in years) and `CatalogApp.ageBracket` (3, 7, 12, 16 or 18,
the `age_bracket` column). A product no source rates has neither: it is
**unrated**, which is not "all ages". `app` shows the bracket on the
product page and filters `/browse` by it ("Suitable for").

## Where the ages come from

| System | Sources                                                                                         | What it says                                                                            |
| ------ | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| OARS   | Flathub, elementary AppCenter, the Debian, Ubuntu, Arch, Fedora and openSUSE AppStream catalogs | what content the app has, per attribute (violence, drugs, sex, language, money, social) |
| PEGI   | GOG (data withheld since 2026-11-15, see [`sources.md`](sources.md))                            | the European rating board's bracket                                                     |
| USK    | GOG, when it has no PEGI                                                                        | the German board's bracket                                                              |
| ESRB   | GOG, when it has neither                                                                        | the North American board's bracket                                                      |

No other source carries a rating: Snap, AppImage, Lutris, the distro
package lists and GitHub have none, and Steam and IGDB aren't sources.
The `KidsGame` and `Education` keys are categories (Educational,
Education), not ratings; see [`categories.md`](categories.md#kids).

OARS declares what an app contains, not who it is for. An app with
`<content_rating type="oars-1.1"/>` and no attribute was checked and has
nothing to declare: age 0. An app with no `<content_rating>` was never
checked: unrated. Both are read the same way by every AppStream parser
(`_shared/appstream-extras.ts`'s `summarizeContentRating`).

## Rules

1. **OARS to an age.** Each attribute at each intensity has a minimum
   age, Common Sense Media's table as libappstream ships it
   (`oars_to_csm_mappings`, copied in `src/sources/_shared/oars.ts`),
   the same ages GNOME Software and Flathub compute. A rating's age is
   its attributes' highest. Examples: cartoon violence, mild: 3; fantasy
   violence, moderate: 7; sharing usage data (`social-info`, moderate):
   13; text chat with strangers (`social-chat`, intense): 13; voice chat:
   15; intense sexual themes: 15; sexual violence or intense bloodshed: 18.
2. **PEGI, USK, ESRB to an age.** The board's own age (GOG's
   `ageRating`): PEGI 3/7/12/16/18 as is, USK 0/6/12/16/18, ESRB
   Everyone 6, Everyone 10+ 10, Teen 13, Mature 17, Adults Only 18
   (`src/sources/gog/fetch.ts`).
3. **One age per product: the strictest.** Every member package's own
   rating counts, whatever its source's rank, and the highest age wins
   (`pickAgeRating` in `src/curator/enrich/field-priority.ts`): a source
   that rated higher saw something the others may have missed. Each
   package keeps its own rating, for the per-source detail on the page.
   18 products (2026-11-17) have sources that disagree.
4. **The age to a bracket: round up.** The bracket is the lowest of 3,
   7, 12, 16 and 18 at or above the age (`ageBracket` in
   `src/curator/enrich/age-bracket.ts`); age 0 is bracket 3, "all ages",
   as PEGI 3 is. Rounding up keeps "suitable for 12" exact: every
   product in a bracket up to 12 has an age of 12 or less.
   libappstream's `as_content_rating_system_format_age`, what GNOME
   Software shows a European user, rounds **down** instead: an app rated
   15 for intense sexual themes reads "PEGI 12" there, and 16 here. 493
   rated products (2026-11-17) land in a higher bracket than GNOME
   Software's, almost all of them at 13 or 15 (16 here, 12 there).
5. **No rating, no bracket.** Unrated products match no "suitable for"
   filter, and nothing guesses an age from a category or a description.

## Store

- `age_bracket INTEGER`, NULL when unrated. A nullable column at the end
  of `apps`, so an incremental publish adds it in place: 11,526 rows
  written on 2026-11-17's dataset (`pnpm seed --measure`, 3,880 rows
  updated and 3,789 `meta` rows), and a full publish +7,576 rows
  (1,833,449 against 1,825,873). No index: one would make the next
  remote publish a full one.
- `countAge:{generation}:{age}:{license}:{interface}:{type}:{source}:{category}`:
  the count of every `/browse` combination under a "suitable for" age (3,
  7, 12 or 16), all apps or free software only, unrated apps never
  counted. Written when the source or the category is unset (3,788 keys);
  with both set, `app` counts live through the category's index.
- `ageIds:{generation}:{age}:{type}:{chunk}`: the ids of every product
  meeting the age, per type, in `name ASC` order, chunked like
  `sourceIds:` (~60 rows). `/browse/?age=7`, with or without a type,
  reads its page from here instead of walking `idx_apps_name` past the
  97% of unrated products (7,052 rows read for page 50 of "all ages",
  6,324 for any page of "games for all ages", measured on a local
  `sqld`).
- `listingRows:familyGames` (and its id list, `familyGames`): the
  homepage's "Games for the whole family" row, the 24 most popular games
  in the all-ages bracket that have an icon, unscored ones last. Its name
  is pinned in `store-contract.json` (`familyGamesListing`).
- `browseKeys.ageFilter`: these rows and the column exist. `app` hides
  the filter on a dataset without it.

The formats and the bracket values are pinned in
`src/store/store-contract.json` (`ageBrackets`, `metaKeyFormats`), kept
identical to `app`'s copy.

## Coverage, 2026-11-17

`pnpm start`, private caches present, 106,709 published products.

| Bracket   | Apps         | Games     |
| --------- | ------------ | --------- |
| All ages  | 2,887        | 377       |
| 7+        | 11           | 52        |
| 12+       | 48           | 52        |
| 16+       | 265          | 147       |
| 18+       | 15           | 26        |
| Unrated   | 97,537       | 5,292     |
| **Rated** | 3,226 (3.2%) | 654 (11%) |

Rated products among those with a package from each source: Flathub
2,795 of 2,795 apps and 596 of 596 games (every one), AppCenter
126 of 128 and 10 of 10, openSUSE 568 of 724 and 109 of 130, Fedora 597
of 869 and 128 of 241, Arch 642 of 1,067 and 103 of 141, Ubuntu 661 of
1,612 and 136 of 379, Debian 578 of 1,494 and 121 of 357 (AppStream
catalogs only, the distros' plain package lists carry no rating). Flathub
alone rates 2,509 of the 3,880 rated products. Among the 500 most popular
games 201 are rated, among the 500 most popular apps 90: GUI games are
rated a third of the time (286 of 856).

"Suitable for" filters: all ages 3,264 products (377 games), 7 and
under 3,327 (429), 12 and under 3,427 (481), 16 and under 3,839 (628).

## Things the ages get wrong

- **Social and money attributes weigh like content.** Sharing usage
  data (`social-info`, moderate) is 13 in Common Sense Media's table, so
  fwupd, Stellarium and Notepadqq are 16+ here, and Telegram (voice chat, 15) and Scratch (`social-chat` intense, 13) too. The caches keep each
  source's summary (strongest intensity and age), not the attributes, so
  telling content from online interaction would need the attributes
  kept and the sources re-read.
- **Game engines filed as tools.** Quakespasm, Doom BFA, Hexen II and
  RBDoom3BFG are 18+ "System Tools" apps: their category is the
  problem, not the rating.
- **Mature content is mostly unrated.** 353 of the 359 Visual Novel
  games have no rating; of the 19 products whose description says
  "hentai", "NSFW", "erotic", "porn" or "18+", 18 are unrated. Hiding 18+
  would hide 41 products (26 games, mostly shooters), not the adult ones.
