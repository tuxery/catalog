import { fileURLToPath } from "node:url";
import type { SourcedPackage } from "../../sources";
import { readNdjson } from "../_shared/ndjson";

const COMPAT_WARNINGS_PATH = fileURLToPath(
  new URL("../../../config/overrides/compat-warnings.ndjson", import.meta.url),
);

export interface CompatWarningEntry {
  source: string;
  name: string;
  severity: "warning" | "info";
  issue: string;
  fix?: string;
  reason: string;
}

/** One package-format compatibility issue, attached to the specific source it affects — see `CatalogApp.compatibilityWarnings`'s doc comment. */
export interface CompatWarning {
  source: string;
  severity: "warning" | "info";
  issue: string;
  fix?: string;
}

/** Loads the hand-curated compatibility-warning list (`config/overrides/compat-warnings.ndjson`, missing file reads as empty). */
export function loadCompatWarnings(): CompatWarningEntry[] {
  return readNdjson<CompatWarningEntry>(COMPAT_WARNINGS_PATH);
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
  const warnings: CompatWarning[] = [];
  for (const pkg of packages) {
    for (const entry of entries) {
      if (entry.source === pkg.source && entry.name === pkg.name) {
        warnings.push({
          source: entry.source,
          severity: entry.severity,
          issue: entry.issue,
          fix: entry.fix,
        });
      }
    }
  }
  return warnings;
}
