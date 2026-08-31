import type { SourcedPackage } from "../../sources";
import { looksLikeGuiPackage } from "../filter/rules";
import type { AppCategoryLabel } from "./category";

// Debian/Ubuntu's own Section field, for the exact subset filter/rules.ts's
// GUI_SECTIONS already verified as reliably GUI-predictive (see that
// file's own comment for the sampling behind "sound"/"editors"/"video"/
// "graphics"/"math"/"science"/"hamradio" specifically) — reused here for a
// second purpose. The section name itself is close enough to an
// app-taxonomy category to assign one directly, for the ~186,000-strong
// "To Classify" apps with no upstream category signal and no
// category-rules.json name match either: verified live, 3,846 real
// matches (OBS Studio -> video, Qalculate! -> math, PyQSO/CubicSDR/qDMR ->
// hamradio, universal-ctags -> editors, RHVoice/abcde/aften -> sound,
// DarkRadiant/Tulip/HDRMerge -> graphics, Jmol/llama-cpp/Stacks ->
// science). "games"/"contrib/games" are deliberately excluded here —
// those drive game *detection* (`looksLikeGamePackage`), not an
// app-taxonomy category.
const DEBIAN_SECTION_TO_APP_CATEGORY: Partial<Record<string, AppCategoryLabel>> = {
  sound: "Music & Audio",
  video: "Photo & Video",
  graphics: "Graphics & Design",
  math: "Science",
  science: "Science",
  // No amateur-radio category exists in our taxonomy; radio communication
  // tooling (SDR receivers, APRS/Morse encoders, ham radio loggers) is
  // conceptually closest to freedesktop's own Telephony/TelephonyTools
  // keys, which already map to Internet & Communication.
  hamradio: "Internet & Communication",
  // Matches this file's own freedesktop TextEditor key, already mapped to
  // Utilities rather than Developer Tools — kept consistent rather than
  // splitting general text editors from programmer-focused ones, which
  // Debian's own Section can't tell apart anyway.
  editors: "Utilities",
};

/**
 * A category inferred from a Debian/Ubuntu package's own Section field —
 * gated on `looksLikeGuiPackage` so the same noise-name/companion-suffix
 * exclusions (`-data`/`-common`/`-plugins`/`-server`/`-icons`, `-dev`/
 * `-doc`/`lib*`/...) that already keep GUI detection honest apply here
 * too, not just raw section membership.
 */
export function categoryFromDebianSection(pkg: SourcedPackage): AppCategoryLabel | undefined {
  if (pkg.source !== "deb-debian" && pkg.source !== "deb-ubuntu") return undefined;
  if (!pkg.section) return undefined;
  if (!looksLikeGuiPackage(pkg.name, pkg.section)) return undefined;
  return DEBIAN_SECTION_TO_APP_CATEGORY[pkg.section];
}
