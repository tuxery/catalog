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
