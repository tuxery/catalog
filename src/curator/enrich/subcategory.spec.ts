import { describe, expect, it } from "vitest";
import { APP_CATEGORY_LABEL_VALUES, GAME_CATEGORY_LABEL_VALUES } from "./category";
import {
  loadSubcategories,
  pickSubcategory,
  subcategoriesOf,
  type Subcategories,
  type SubcategoryInput,
} from "./subcategory";

const config = loadSubcategories();

type Pkg = SubcategoryInput["packages"][number];

function app(
  category: string,
  name: string,
  shortDescription = "",
  extra: Partial<SubcategoryInput> & { pkg?: Partial<Pkg> } = {},
): SubcategoryInput {
  const { pkg, ...rest } = extra;
  return {
    type: "app",
    category,
    name,
    shortDescription,
    packages: [{ source: "pacman-aur", name, ...pkg }],
    ...rest,
  };
}

const rules: Subcategories = new Map([
  [
    "app:Developer Tools",
    {
      type: "app",
      rules: [
        { subcategory: "A", pattern: "\\balpha\\b", weakKeys: ["Weak"] },
        { subcategory: "B", keys: ["Strong"], sections: ["deb-*:bsect"] },
        { subcategory: "C", names: "^cross-", fallbackNames: "^python-" },
      ],
    },
  ],
]);

describe("pickSubcategory: passes", () => {
  it("has nothing for a category without subcategories", () => {
    expect(pickSubcategory(app("Business", "Odoo"), config)).toBeUndefined();
  });

  it("checks names, then keys, then sections, then text, then weak signals, then fallbacks", () => {
    // A name beats a key.
    expect(
      pickSubcategory(
        app("Developer Tools", "cross-gcc", "", { pkg: { categories: ["Strong"] } }),
        rules,
      ),
    ).toBe("C");
    // A key beats an earlier rule's text.
    expect(
      pickSubcategory(
        app("Developer Tools", "x", "alpha tool", { pkg: { categories: ["Strong"] } }),
        rules,
      ),
    ).toBe("B");
    // A section beats text too.
    expect(
      pickSubcategory(
        app("Developer Tools", "x", "alpha tool", {
          pkg: { source: "deb-debian", section: "bsect" },
        }),
        rules,
      ),
    ).toBe("B");
    // Text beats a weak key.
    expect(
      pickSubcategory(
        app("Developer Tools", "python-x", "alpha", { pkg: { categories: ["Weak"] } }),
        rules,
      ),
    ).toBe("A");
    // A weak key beats a fallback name.
    expect(
      pickSubcategory(
        app("Developer Tools", "python-x", "", { pkg: { categories: ["Weak"] } }),
        rules,
      ),
    ).toBe("A");
    expect(pickSubcategory(app("Developer Tools", "python-x"), rules)).toBe("C");
    expect(pickSubcategory(app("Developer Tools", "x", "nothing"), rules)).toBeUndefined();
  });

  it("reads the LLM verdict's reason", () => {
    expect(
      pickSubcategory(app("Developer Tools", "x", "", { llmReason: "alpha tool" }), rules),
    ).toBe("A");
  });
});

describe("config/subcategories.json", () => {
  it("only names real categories, each with at least two subcategories", () => {
    const lonely = [
      ...APP_CATEGORY_LABEL_VALUES.map((label) => subcategoriesOf(config, "app", label)),
      ...GAME_CATEGORY_LABEL_VALUES.map((label) => subcategoriesOf(config, "game", label)),
    ].filter((subs) => subs.length === 1);
    expect(lonely).toEqual([]);
    expect(subcategoriesOf(config, "app", "Developer Tools")).toContain("Version Control");
    expect(subcategoriesOf(config, "game", "Board & Cards")).toContain("Chess & Go");
  });

  it.each([
    [
      "Developer Tools",
      "Visual Studio Code",
      "Code editing. Redefined.",
      { categories: ["Development", "IDE"] },
      "IDEs & Code Editors",
    ],
    ["Developer Tools", "gh", "GitHub's official command line tool", {}, "Version Control"],
    [
      "Developer Tools",
      "gcc-14-mips-linux-gnu",
      "GNU C compiler",
      {},
      "Language Modules & Cross-Compilers",
    ],
    ["Developer Tools", "python3-requests-toolbelt", "", {}, "Language Modules & Cross-Compilers"],
    ["Developer Tools", "PostgreSQL", "Object-relational SQL database", {}, "Databases"],
    [
      "System Tools",
      "kitty",
      "Fast, featureful, GPU based terminal emulator",
      {},
      "Terminals & Shells",
    ],
    ["System Tools", "btop", "A monitor of system resources", {}, "Monitoring & System Info"],
    [
      "System Tools",
      "brother-hl1110",
      "LPR and CUPS driver for the Brother HL-1110",
      {},
      "Printers & Scanners",
    ],
    [
      "Utilities",
      "CopyQ",
      "Clipboard manager with advanced features",
      {},
      "Clipboard, Screenshots & Desktop Helpers",
    ],
    [
      "Utilities",
      "vim-fugitive",
      "A Git wrapper so awesome, it should be illegal",
      {},
      "Editor Plugins",
    ],
    ["Security", "KeePassXC", "Cross-platform password manager", {}, "Passwords & Authentication"],
    [
      "Desktop & Settings",
      "waybar",
      "Highly customizable Wayland bar for Sway and Wlroots based compositors",
      {},
      "Panels, Bars & Widgets",
    ],
    [
      "Photo & Video",
      "yt-dlp-gui",
      "A video downloader for YouTube and other sites",
      {},
      "Converters & Downloaders",
    ],
    [
      "Music & Audio",
      "Strawberry",
      "Music player and music collection organizer",
      {},
      "Players & Streaming",
    ],
  ] as [string, string, string, Partial<Pkg>, string][])(
    "files %s's %s",
    (category, name, description, pkg, expected) => {
      expect(pickSubcategory(app(category, name, description, { pkg }), config)).toBe(expected);
    },
  );

  it("doesn't read an AUR -git suffix as a git tool", () => {
    expect(
      pickSubcategory(app("Developer Tools", "corange-git", "Pure C Game Engine"), config),
    ).toBe("Game Development");
  });

  it("reads the opening of a game's long description, not an app's", () => {
    const game: SubcategoryInput = {
      type: "game",
      category: "Board & Cards",
      name: "Knightfall",
      shortDescription: "Knightfall",
      longDescription: "A chess variant played on a ring-shaped board.",
      packages: [{ source: "pacman-aur", name: "knightfall" }],
    };
    expect(pickSubcategory(game, config)).toBe("Chess & Go");
    expect(
      pickSubcategory(
        app("Utilities", "Notely", "Notely", { longDescription: "A clipboard manager" }),
        config,
      ),
    ).toBeUndefined();
  });
});
