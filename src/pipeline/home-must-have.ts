import { fileURLToPath } from "node:url";
import { z } from "zod";
import { readJson } from "../curator/_shared/json";

const HOME_MUST_HAVE_PATH = fileURLToPath(
  new URL("../../config/home-must-have.json", import.meta.url),
);

/**
 * The most cards the homepage row shows (`app`'s `HOME_ROW_SIZE`): a longer
 * list would publish cards nobody sees.
 */
const MAX_MUST_HAVE_APPS = 16;

export const HomeMustHaveListSchema = z
  .array(
    z
      .string()
      .min(1)
      .describe(
        "A published app's id (`CatalogApp.id`, the last part of its /app/<id>/ url), e.g. `firefox` or `app.zen_browser.zen`.",
      ),
  )
  .max(MAX_MUST_HAVE_APPS)
  .meta({
    title: "Store: the homepage's must-have apps",
    description:
      "The apps of the homepage's hand-picked 'Must-have apps' row, in display order: editorial, as no field of the dataset says what is a must-have. Published as the `listingRows:mustHave` meta row; an id the dataset doesn't list is left out of the row (`pnpm seed` names it).",
  });

/** `config/home-must-have.json` (a missing file reads as empty), read at publish time like the source terms. */
export function readHomeMustHave(path: string = HOME_MUST_HAVE_PATH): string[] {
  return readJson(path, HomeMustHaveListSchema);
}
