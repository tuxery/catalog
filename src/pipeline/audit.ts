import { z } from "zod";
import type { CatalogApp } from "../curator";

// `pnpm audit-matching` (scripts/audit-matching.ts): suspected matching mistakes in a built
// dataset, ranked by how many people they affect, plus the golden-set
// check (config/audit-golden.json). Pure — every function here works on
// an already-built `CatalogApp[]` (excluded and companion groups included).

/** One app as an audit lists it — enough to judge it without opening the dataset. */
export interface AuditApp {
  id: string;
  name: string;
  /** Shown on the site: neither LLM-excluded nor a companion of another product. */
  published: boolean;
  excluded?: string;
  companionOf?: string;
  homepage?: string;
  sources: string[];
  packageCount: number;
  installsTotal?: number;
  popularity?: number;
  shortDescription: string;
}

export type AuditSignal = "shared-homepage" | "same-name" | "megagroup" | "hidden-app";

/** A group of apps one signal says may be wrong — `key` is what they share (a homepage, a name). */
export interface AuditSuspect {
  signal: AuditSignal;
  key: string;
  apps: AuditApp[];
  /** Ranking only: the highest install count / popularity among `apps`. */
  reach: number;
}

export function toAuditApp(app: CatalogApp): AuditApp {
  return {
    id: app.id,
    name: app.name,
    published: !app.excluded && !app.companionOf,
    excluded: app.excluded,
    companionOf: app.companionOf,
    homepage: app.homepage,
    sources: [...new Set(app.packages.map((pkg) => pkg.source))],
    packageCount: app.packages.length,
    installsTotal: app.installsTotal,
    popularity: app.popularity,
    shortDescription: app.shortDescription,
  };
}

/** Flathub installs first, then the 0-1 popularity rank — comparable enough to sort a review list. */
export function reachOf(app: Pick<AuditApp, "installsTotal" | "popularity">): number {
  return (app.installsTotal ?? 0) + (app.popularity ?? 0) * 10_000;
}

// Hosts where the project lives in the first two path segments
// (`github.com/<owner>/<repo>`, `sourceforge.net/projects/<name>`) rather
// than in the host itself — measured 2026-10-09: github.com alone is the
// homepage host of 48,994 apps.
const PROJECT_IN_PATH_HOSTS = new Set([
  "github.com",
  "gitlab.com",
  "codeberg.org",
  "sourceforge.net",
  "git.sr.ht",
  "launchpad.net",
  "gitlab.gnome.org",
  "invent.kde.org",
  "salsa.debian.org",
  "gitlab.freedesktop.org",
  "pypi.org",
  "crates.io",
  "apps.kde.org",
  "wiki.gnome.org",
  "gog.com",
  "lutris.net",
]);

// A homepage key shared by more groups than this is a portal or an
// umbrella project page (gcc.gnu.org, bioconductor.org), not one product.
export const MAX_SHARED_HOMEPAGE_GROUP = 12;

/**
 * What identifies a project in its homepage: the host without `www.`,
 * plus the first two path segments on a code host (`github.com/owner/repo`)
 * or the whole path elsewhere (`videolan.org/vlc`), lowercased, no query,
 * fragment or trailing slash. `undefined` for a bare code host or a
 * distribution's own package page, which say nothing about the project.
 */
export function homepageKey(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const match = url
    .trim()
    .toLowerCase()
    .match(/^(?:[a-z+]+:\/\/)?(?:www\.)?([^/?#]+)([^?#]*)/);
  if (!match?.[1]) return undefined;
  const host = match[1];
  if (/^(aur\.archlinux\.org|packages\.|archlinux\.org\/packages)/.test(host)) return undefined;
  const segments = (match[2] ?? "").split("/").filter(Boolean);
  if (PROJECT_IN_PATH_HOSTS.has(host)) {
    if (segments.length < 2) return undefined;
    return [host, ...segments.slice(0, 2)].join("/").replace(/\.git$/, "");
  }
  return [host, ...segments].join("/");
}

/** Groups listed together under one shared key, when there's more than one of them. */
function groupBy(
  apps: readonly CatalogApp[],
  keysOf: (app: CatalogApp) => (string | undefined)[],
): Map<string, CatalogApp[]> {
  const byKey = new Map<string, CatalogApp[]>();
  for (const app of apps) {
    for (const key of new Set(keysOf(app))) {
      if (!key) continue;
      byKey.set(key, [...(byKey.get(key) ?? []), app]);
    }
  }
  return new Map([...byKey].filter(([, group]) => group.length > 1));
}

function suspect(signal: AuditSignal, key: string, apps: readonly CatalogApp[]): AuditSuspect {
  const listed = apps.map(toAuditApp).toSorted((a, b) => reachOf(b) - reachOf(a));
  return { signal, key, apps: listed, reach: Math.max(...listed.map(reachOf)) };
}

/**
 * Several groups sharing one project homepage (any member package's) —
 * the strongest sign of a product split across cards: VLC and `vlc-bin`,
 * VS Code and `code-insiders`. At least one of them must be published.
 */
export function sharedHomepageSuspects(apps: readonly CatalogApp[]): AuditSuspect[] {
  const groups = groupBy(apps, (app) => app.packages.map((pkg) => homepageKey(pkg.homepage)));
  return [...groups]
    .filter(([, group]) => group.length <= MAX_SHARED_HOMEPAGE_GROUP)
    .filter(([, group]) => group.some((app) => !app.excluded && !app.companionOf))
    .map(([key, group]) => suspect("shared-homepage", key, group));
}

/** A display name reduced to letters and digits, without the build words AUR names carry. */
export function nameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[-_ .](bin|git|appimage)$/, "")
    .replaceAll(/[^a-z\d]/g, "");
}

/**
 * Several published groups whose names only differ by punctuation or a
 * build word (`amneziavpn-bin` / `amnezia-vpn-bin`). Many are genuine
 * namesakes (every desktop has a "Calculator"); ranked by reach so the
 * ones people actually meet come first.
 */
export function sameNameSuspects(apps: readonly CatalogApp[]): AuditSuspect[] {
  const published = apps.filter((app) => !app.excluded && !app.companionOf);
  const groups = groupBy(published, (app) => {
    const key = nameKey(app.name);
    return [key.length >= 4 ? key : undefined];
  });
  return [...groups].map(([key, group]) => suspect("same-name", key, group));
}

/**
 * One group holding what should be several products: three or more
 * distinct Flathub ids or Snaps, or packages pointing at eight or more
 * homepage hosts — the shape of the chained false merges (`dotnet`: 202
 * packages, Mines, Mosaic, Black Box, Map, ...).
 */
export function megagroupSuspects(apps: readonly CatalogApp[]): AuditSuspect[] {
  return apps
    .filter((app) => {
      const ids = (source: string) =>
        new Set(app.packages.filter((pkg) => pkg.source === source).map((pkg) => pkg.appId)).size;
      const hosts = new Set(
        app.packages
          .map((pkg) => homepageKey(pkg.homepage)?.split("/")[0])
          .filter((host): host is string => Boolean(host)),
      ).size;
      return ids("flatpak-flathub") >= 3 || ids("snap-snapcraft") >= 3 || hosts >= 8;
    })
    .map((app) => suspect("megagroup", app.id, [app]));
}

/**
 * LLM-hidden groups carrying strong evidence of being an app — an
 * AppStream desktop or console application, or a `.desktop` file — the
 * place to look for real apps the classifier hid.
 */
export function hiddenAppSuspects(apps: readonly CatalogApp[]): AuditSuspect[] {
  return apps
    .filter(
      (app) =>
        app.excluded &&
        app.packages.some(
          (pkg) =>
            pkg.hasDesktopFile ||
            pkg.formal?.componentType === "desktop-application" ||
            pkg.formal?.componentType === "console-application",
        ),
    )
    .map((app) => suspect("hidden-app", app.id, [app]));
}

const GoldenEntrySchema = z.object({
  product: z.string().describe("The product's display name, for humans."),
  anchors: z
    .array(z.object({ source: z.string(), appId: z.string() }))
    .min(1)
    .describe(
      "Packages that must all end up in this product's group, and in no other golden product's.",
    ),
  note: z.string().optional().describe("Why an anchor is (or isn't) here, when not obvious."),
});

export type GoldenEntry = z.infer<typeof GoldenEntrySchema>;

export const GoldenListSchema = z.array(GoldenEntrySchema).meta({
  title: "Audit: golden products",
  description:
    "The most-installed products and the packages each must group — `pnpm audit-matching` fails when one is split across cards or two share one. Generated once (`pnpm audit-matching --init-golden`), then reviewed by hand.",
});

export interface GoldenViolation {
  product: string;
  kind: "split" | "merged" | "missing";
  detail: string;
}

/**
 * Checks every golden product: all its anchors in one group (else
 * `split`), no group holding two golden products (`merged`), and every
 * anchor still present in the data (`missing`, a package a source
 * dropped). Pure.
 */
export function checkGolden(
  apps: readonly CatalogApp[],
  golden: readonly GoldenEntry[],
): GoldenViolation[] {
  const groupOf = new Map<string, CatalogApp>();
  for (const app of apps) {
    for (const pkg of app.packages) groupOf.set(`${pkg.source}:${pkg.appId ?? pkg.name}`, app);
  }

  const violations: GoldenViolation[] = [];
  const productByGroup = new Map<string, string>();
  for (const entry of golden) {
    const groups = new Map<string, string[]>();
    for (const anchor of entry.anchors) {
      const key = `${anchor.source}:${anchor.appId}`;
      const group = groupOf.get(key);
      if (!group) {
        violations.push({ product: entry.product, kind: "missing", detail: key });
        continue;
      }
      groups.set(group.id, [...(groups.get(group.id) ?? []), key]);
    }
    if (groups.size > 1) {
      violations.push({
        product: entry.product,
        kind: "split",
        detail: [...groups].map(([id, keys]) => `${id} (${keys.join(", ")})`).join(" | "),
      });
    }
    for (const id of groups.keys()) {
      const other = productByGroup.get(id);
      if (other && other !== entry.product) {
        violations.push({
          product: entry.product,
          kind: "merged",
          detail: `${id} also holds ${other}`,
        });
      }
      productByGroup.set(id, entry.product);
    }
  }
  return violations;
}

// Sources whose package names are the product's well-known name on a
// major platform — anchors for a generated golden entry.
const ANCHOR_SOURCES = new Set([
  "flatpak-flathub",
  "snap-snapcraft",
  "deb-debian",
  "deb-ubuntu",
  "rpm-fedora",
  "pacman-arch",
]);

/**
 * A first golden set: the `count` most-installed published products, each
 * anchored on its default builds from the major platforms. Encodes the
 * current grouping, mistakes included — meant to be reviewed, not trusted.
 */
export function generateGolden(apps: readonly CatalogApp[], count: number): GoldenEntry[] {
  return apps
    .filter((app) => !app.excluded && !app.companionOf && app.installsTotal)
    .toSorted((a, b) => (b.installsTotal ?? 0) - (a.installsTotal ?? 0))
    .slice(0, count)
    .map((app) => ({
      product: app.name,
      anchors: [
        ...new Map(
          app.packages
            .filter(
              (pkg) =>
                ANCHOR_SOURCES.has(pkg.source) &&
                !pkg.track &&
                !pkg.risk &&
                !pkg.flavors?.length &&
                (pkg.appId ?? pkg.name),
            )
            .map((pkg) => {
              const anchor = { source: pkg.source, appId: pkg.appId ?? pkg.name };
              return [`${anchor.source}:${anchor.appId}`, anchor] as const;
            }),
        ).values(),
      ],
    }))
    .filter((entry) => entry.anchors.length > 0);
}
