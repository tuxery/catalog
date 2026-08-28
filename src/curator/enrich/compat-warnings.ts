import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { SourcedPackage } from "../../sources";
import { readJson } from "../_shared/json";

const COMPAT_WARNINGS_PATH = fileURLToPath(
  new URL("../../../config/enrich-compat-warnings.json", import.meta.url),
);

const CompatWarningEntrySchema = z.object({
  source: z.string().describe('A PackageSourceId, e.g. "snap-snapcraft".'),
  name: z.string().describe("The exact SourcedPackage.name on that source."),
  severity: z
    .enum(["warning", "info"])
    .describe(
      '"warning" for a real functional problem, "info" for a lesser one with a confirmed one-line fix.',
    ),
  issue: z.string().describe("What actually goes wrong, in plain terms."),
  fix: z
    .string()
    .optional()
    .describe(
      "A concrete workaround, when one exists — omit entirely rather than leaving empty when there's no known fix.",
    ),
  reason: z
    .string()
    .describe(
      "How this was verified (issue trackers, forum reports, ...) — required so the warning is auditable later, not just an unexplained line.",
    ),
});

export type CompatWarningEntry = z.infer<typeof CompatWarningEntrySchema>;

export const CompatWarningsListSchema = z.array(CompatWarningEntrySchema).meta({
  title: "Enrich: compatibility warnings",
  description:
    "Known packaging-format compatibility issues for one specific app on one specific source (e.g. GNOME Boxes via Snap losing KVM/libvirt device access to confinement) — surfaced in app's install drawer next to the affected source, not a separate page.",
});

/** One package-format compatibility issue, attached to the specific source it affects — see `CatalogApp.compatibilityWarnings`'s doc comment. */
export interface CompatWarning {
  source: string;
  severity: "warning" | "info";
  issue: string;
  fix?: string;
}

/** Loads the hand-curated compatibility-warning list (`config/enrich-compat-warnings.json`, missing file reads as empty). */
export function loadCompatWarnings(): CompatWarningEntry[] {
  return readJson(COMPAT_WARNINGS_PATH, CompatWarningsListSchema);
}

/**
 * Every known compatibility warning affecting any of an app's member
 * packages, one per matching `{source, name}` pair — an app installable
 * from both a warned source (Snap) and a clean one (a native distro
 * package) still surfaces the warning, scoped to just the affected
 * source, since `app`'s install drawer shows it next to that specific
 * source's row, not as a blanket app-level banner.
 */
export function getCompatWarnings(
  packages: SourcedPackage[],
  entries: CompatWarningEntry[],
): CompatWarning[] {
  return packages.flatMap((pkg) =>
    entries
      .filter((entry) => entry.source === pkg.source && entry.name === pkg.name)
      .map(({ source, severity, issue, fix }) => ({ source, severity, issue, fix })),
  );
}
