import { appImageAxes } from "../appimage/normalize";
import type { SourcedPackage } from "../types";
import type { AppImageHubCacheEntry } from "./types";

// AppImageHub's own categories (`typename`), 72 of them on 2026-10-20, as
// the freedesktop categories `pickCategory` reads (config/categories-*.json).
// Free to use, per opendesktop.org. A store category with no app meaning
// maps to nothing; the ones that aren't apps at all are filtered out below.
const TYPENAME_CATEGORIES: Record<string, string[]> = {
  Utilities: ["Utility"],
  "Developers Apps": ["Development"],
  "Graphic Apps": ["Graphics"],
  "Chat & Messenging": ["Network", "InstantMessaging", "Chat"],
  "Various Games": ["Game"],
  Browser: ["Network", "WebBrowser"],
  "Internet Apps": ["Network"],
  "Audio Apps": ["AudioVideo", "Audio"],
  Crypto: ["Finance"],
  Notes: ["Office"],
  Audioplayers: ["AudioVideo", "Audio", "Player"],
  "Office Apps": ["Office"],
  "Education Apps": ["Education"],
  Science: ["Science"],
  Financial: ["Finance"],
  Security: ["Security"],
  "File Management": ["System", "FileManager"],
  "Video Apps": ["AudioVideo", "Video"],
  "Tactics & Strategy": ["Game", "StrategyGame"],
  Emulation: ["System", "Emulator"],
  "Text Editors": ["Utility", "TextEditor"],
  "Music Production": ["AudioVideo", "Audio", "Music"],
  Network: ["Network"],
  "System Tools (NOT OS or ROMS)": ["System"],
  "TV & Streaming": ["AudioVideo", "Video", "TV"],
  "3D Graphics": ["Graphics", "3DGraphics"],
  "Video Players": ["AudioVideo", "Video", "Player"],
  "Terminal Apps": ["Utility"],
  "Jump N Run": ["Game", "ArcadeGame"],
  "Image Viewers": ["Graphics", "Viewer"],
  "Radio Apps": ["AudioVideo", "Audio"],
  "Video Editors": ["AudioVideo", "Video", "AudioVideoEditing"],
  "P2P & Torrent": ["Network", "P2P", "FileTransfer"],
  Shooter: ["Game", "Shooter"],
  IDEs: ["Development", "IDE"],
  Arcade: ["Game", "ArcadeGame"],
  "System Monitoring": ["System", "Monitor"],
  Email: ["Network", "Email"],
  "Ebook Software": ["Office", "Viewer"],
  "Vector Graphics": ["Graphics", "VectorGraphics"],
  "PDF Software": ["Office", "Viewer"],
  Database: ["Development"],
  "Screenshot Tools": ["Graphics", "Utility"],
  "Video Converters": ["AudioVideo", "Video"],
  "Audio Extractors/Converters": ["AudioVideo", "Audio"],
  Chess: ["Game", "BoardGame"],
  Racing: ["Game"],
  Board: ["Game", "BoardGame"],
  "Webcam & Monitoring": ["AudioVideo", "Video"],
  Groupware: ["Office", "Network"],
  Card: ["Game", "CardGame"],
  "E-Learning": ["Education"],
  "Screen Recorders": ["AudioVideo", "Video"],
  "DJ Apps": ["AudioVideo", "Audio", "Music"],
  "Shoot em up": ["Game", "Shooter"],
  VPN: ["Network"],
  "Phone Utilities": ["Utility"],
  IoT: ["Network"],
  Printing: ["System"],
  Telephony: ["Network", "Telephony"],
  Programming: ["Development"],
};

// Store categories that hold no applications: wallpapers, splash screens,
// skins, widget libraries, phone firmware.
const NOT_APPS = new Set([
  "Nature",
  "Animals",
  "Abstract",
  "Mountains",
  "Landscapes",
  "Wallpaper Other",
  "Plasma 5 Wallpaper Plugins",
  "Gimp Splashes",
  "Audacious",
  "Qt Widgets",
  "Phone ROMS",
]);

// License tags as SPDX ids; the store's tags are free to use.
const LICENSE_TAGS: Record<string, string> = {
  gplv3: "GPL-3.0-only",
  gplv2: "GPL-2.0-only",
  "gplv2-later": "GPL-2.0-or-later",
  lgplv3: "LGPL-3.0-only",
  lgplv2: "LGPL-2.0-only",
  agplv3: "AGPL-3.0-only",
  "mit-license": "MIT",
  "apache-license": "Apache-2.0",
  "bsd-license": "BSD-3-Clause",
  cc0: "CC0-1.0",
};

/** The risk the uploader declared (`release-beta`, `release-git`), when the name itself says none. Pure. */
function tagRisk(tags: string[]): Pick<SourcedPackage, "track" | "risk"> {
  if (tags.includes("release-beta")) return { risk: "beta" };
  if (tags.includes("release-git")) return { risk: "git" };
  return {};
}

/**
 * A preview image's URL at `size` (e.g. "128x128"), by rewriting the size
 * segment of images.pling.com's cache path, which opendesktop.org
 * documented for this (2026-11-10): `/cache/770x540-4/img/...` becomes
 * `/cache/128x128-4/img/...`. `undefined` when the URL has no such
 * segment, so an icon is never loaded at a size we can't control. Pure.
 */
export function iconRendering(url: string, size = "128x128"): string | undefined {
  const pattern = /^(https:\/\/images\.pling\.com\/cache\/)\d+x\d+(-\d+\/)/;
  return pattern.test(url) ? url.replace(pattern, `$1${size}$2`) : undefined;
}

/**
 * The short description: the store's summary, unless it is that legacy
 * ~40-character cut of the description (opendesktop.org, 2026-11-10), in
 * which case the description's first sentence, from the excerpt. Pure.
 */
export function shortDescription(entry: AppImageHubCacheEntry): string {
  const summary = entry.summary;
  const excerpt = entry.descriptionExcerpt;
  if (!excerpt) return summary;
  const stem = summary.replace(/(?:\.\.\.|…)$/, "").trim();
  if (!stem || !excerpt.startsWith(stem) || excerpt.length <= summary.length) return summary;
  return excerpt.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? excerpt;
}

/** Whether an item is an AppImage application rather than artwork or a component. Pure. */
export function isApp(entry: AppImageHubCacheEntry): boolean {
  return entry.tags.includes("appimage") && !NOT_APPS.has(entry.typename);
}

export function normalize(entries: AppImageHubCacheEntry[]): SourcedPackage[] {
  return entries.filter(isApp).map((entry) => {
    const categories = TYPENAME_CATEGORIES[entry.typename] ?? [];
    const nameAxes = appImageAxes(entry.name);
    const axes = nameAxes.track || nameAxes.risk ? nameAxes : tagRisk(entry.tags);
    const license = entry.tags.map((tag) => LICENSE_TAGS[tag]).find(Boolean);
    return {
      source: "appimagehub",
      name: entry.name,
      description: shortDescription(entry),
      // A first-paragraph excerpt only; the app links to the detail page
      // for the rest, as opendesktop.org asked.
      longDescription: entry.descriptionExcerpt,
      // previewpic1 is usually the app's icon (not guaranteed, per
      // opendesktop.org), asked for at 128x128 at most; the others are
      // screenshots. Both load from their servers, last in FIELD_PRIORITY.
      iconUrl: entry.previewPics?.[0] ? iconRendering(entry.previewPics[0]) : undefined,
      screenshots:
        entry.previewPics && entry.previewPics.length > 1 ? entry.previewPics.slice(1) : undefined,
      version: entry.version ?? "unknown",
      appId: entry.id,
      track: axes.track,
      risk: axes.risk,
      // The item's AppImageHub page is where opendesktop.org asks every app
      // using their data to send people to download it ("Source: AppImageHub").
      homepage: entry.detailpage,
      license,
      categories: categories.length > 0 ? categories : undefined,
      hasGameCategory: categories.includes("Game"),
      // `original-product`: the uploader made the app. Otherwise a repack by
      // someone else, of unknown standing: left unknown.
      provenance: entry.tags.includes("original-product") ? "upstream" : undefined,
    };
  });
}
