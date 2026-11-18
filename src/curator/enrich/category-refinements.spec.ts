import { describe, expect, it } from "vitest";
import {
  CategoryRefinementsListSchema,
  loadCategoryRefinements,
  refineCategory,
  type CategoryRefinementEntry,
} from "./category-refinements";

const rules: CategoryRefinementEntry[] = [
  {
    type: "app",
    from: ["Networking"],
    to: "Messaging & Calls",
    pattern: "\\birc client\\b",
    reason: "test",
  },
  { type: "app", from: ["Networking"], to: "Email", pattern: "\\bimap\\b", reason: "test" },
  { type: "game", from: ["Sports", "Arcade"], to: "Racing", pattern: "\\bkart\\b", reason: "test" },
];

const text = (shortDescription: string, llmReason?: string) => ({
  name: "example",
  shortDescription,
  llmReason,
});

describe("refineCategory", () => {
  it("moves an app from a broad category when its description names a finer one", () => {
    expect(refineCategory("app", "Networking", text("A terminal IRC client"), rules)).toBe(
      "Messaging & Calls",
    );
  });

  it("reads the LLM verdict's reason too", () => {
    expect(refineCategory("app", "Networking", text("Sync tool", "IMAP mailbox sync"), rules)).toBe(
      "Email",
    );
  });

  it("leaves an app in a category no rule starts from", () => {
    expect(refineCategory("app", "Utilities", text("A terminal IRC client"), rules)).toBe(
      "Utilities",
    );
  });

  it("moves an app whose freedesktop keys a rule lists, whatever its text", () => {
    const keyed: CategoryRefinementEntry[] = [
      {
        type: "app",
        from: ["System Tools"],
        to: "Utilities",
        keys: ["FileManager"],
        pattern: "\\bfile manager\\b",
        reason: "test",
      },
    ];
    expect(
      refineCategory(
        "app",
        "System Tools",
        { ...text("Browse your files"), keys: ["FileManager"] },
        keyed,
      ),
    ).toBe("Utilities");
    expect(refineCategory("app", "System Tools", text("Browse your files"), keyed)).toBe(
      "System Tools",
    );
  });

  it.each([
    ["System Tools", "File manager for the GNOME desktop", ["System", "FileManager"], "Utilities"],
    ["System Tools", "Highly customizable Wayland bar for Sway", [], "Desktop & Settings"],
    ["System Tools", "Input Method", [], "Utilities"],
    ["Utilities", "A fast, feature-rich terminal emulator", ["TerminalEmulator"], "System Tools"],
    ["Developer Tools", "The terminal multiplexer", [], "System Tools"],
  ])("files a %s app (%s) where the config says", (from, description, keys, to) => {
    expect(
      refineCategory("app", from, { ...text(description), keys }, loadCategoryRefinements()),
    ).toBe(to);
  });

  it("keeps each rule to its own type", () => {
    expect(refineCategory("app", "Sports", text("A kart game"), rules)).toBe("Sports");
    expect(refineCategory("game", "Arcade", text("A kart game"), rules)).toBe("Racing");
  });

  it("returns the first matching rule's category", () => {
    expect(refineCategory("app", "Networking", text("IRC client with IMAP support"), rules)).toBe(
      "Messaging & Calls",
    );
  });
});

describe("CategoryRefinementsListSchema", () => {
  it("rejects a label of the other type", () => {
    expect(
      CategoryRefinementsListSchema.safeParse([
        { type: "app", from: ["Networking"], to: "Racing", pattern: "x", reason: "test" },
      ]).success,
    ).toBe(false);
  });
});

describe("config/category-refinements.json", () => {
  const configured = loadCategoryRefinements();
  const refine = (type: "app" | "game", category: string, shortDescription: string) =>
    refineCategory(type, category, text(shortDescription), configured);

  it("splits the network catch-all by what the description says", () => {
    expect(refine("app", "Networking", "Modern IRC client")).toBe("Messaging & Calls");
    expect(refine("app", "Networking", "Privacy-focused web browser based on Firefox")).toBe(
      "Web Browsers",
    );
    expect(refine("app", "Networking", "Terminal email client")).toBe("Email");
    expect(refine("app", "Networking", "GTK client for Mastodon")).toBe("Social Media");
    expect(refine("app", "Networking", "Multithread download manager")).toBe(
      "File Sharing & Downloads",
    );
    expect(refine("app", "Networking", "Dynamic DNS updater")).toBe("Networking");
  });

  it("files a file-sharing network's client under file sharing, whatever chat it also offers", () => {
    expect(
      refine("app", "Messaging & Calls", "Graphical client for the Soulseek peer-to-peer network"),
    ).toBe("File Sharing & Downloads");
    expect(refine("app", "Messaging & Calls", "Share, freely")).toBe("Messaging & Calls");
  });

  it("doesn't take a web app for a browser, nor an AI chat for messaging", () => {
    expect(refine("app", "Networking", "Manage your router from your web browser")).toBe(
      "Networking",
    );
    expect(refine("app", "Networking", "Chat with local LLMs")).toBe("AI");
    expect(refine("app", "Messaging & Calls", "A simple AI chat client")).toBe("AI");
  });

  it("files AI assistants, LLM front ends, model runners and image generators under AI", () => {
    expect(refine("app", "Networking", "A desktop client for OpenAI's ChatGPT")).toBe("AI");
    expect(refine("app", "Productivity", "Private offline AI assistant")).toBe("AI");
    expect(refine("app", "Desktop & Settings", "Kirigami client for Ollama")).toBe("AI");
    expect(refine("app", "Developer Tools", "Run AI models, locally and privately")).toBe("AI");
    expect(refine("app", "Productivity", "Local AI with Gemma 4 inference snap")).toBe("AI");
    expect(refine("app", "Graphics & Design", "GTK+ frontend for Stable Diffusion")).toBe("AI");
  });

  it("leaves an app with an AI feature, a coding agent or a transcriber where it is", () => {
    expect(refine("app", "Networking", "Open-source desktop SSH client with an AI assistant")).toBe(
      "Networking",
    );
    expect(
      refine("app", "Utilities", "Terminal emulator with private, local AI powered by Ollama"),
    ).toBe("System Tools");
    expect(refine("app", "Developer Tools", "Open source AI coding agent")).toBe("Developer Tools");
    expect(refine("app", "AI", "Native desktop coding agent")).toBe("Developer Tools");
    expect(refine("app", "AI", "Private offline AI assistant")).toBe("AI");
    expect(refine("app", "Developer Tools", "CLI client for the OpenAI API")).toBe(
      "Developer Tools",
    );
    expect(refine("app", "Utilities", "Speech-to-text using local Whisper AI models")).toBe(
      "Utilities",
    );
    expect(refine("app", "Books & Reference", "Translate your slides using Ollama")).toBe(
      "Books & Reference",
    );
    expect(refine("app", "Networking", "Browse Gemini pages")).not.toBe("AI");
  });

  it("files console emulators and game launchers under Gaming Tools, not QEMU", () => {
    expect(refine("app", "System Tools", "Nintendo Game Boy Advance emulator")).toBe(
      "Gaming Tools",
    );
    expect(refine("app", "System Tools", "A Minecraft launcher with mod support")).toBe(
      "Gaming Tools",
    );
    expect(refine("app", "System Tools", "QEMU system emulator for OpenRisc32")).toBe(
      "System Tools",
    );
    expect(refine("app", "Utilities", "Unofficial desktop client for Proton Drive")).toBe(
      "Utilities",
    );
  });

  it("reads consoles separated by slashes, and files DOSBox, Steam and store launchers under Gaming Tools", () => {
    expect(refine("app", "System Tools", "GameCube / Wii / Triforce Emulator")).toBe(
      "Gaming Tools",
    );
    expect(refine("app", "System Tools", "Play Epic, GOG and Amazon Games")).toBe("Gaming Tools");
    expect(refine("app", "System Tools", "Doom Source Port")).toBe("Gaming Tools");
    expect(
      refineCategory(
        "app",
        "System Tools",
        { name: "Steam", shortDescription: "Launcher for the Steam software distribution service" },
        configured,
      ),
    ).toBe("Gaming Tools");
    expect(refine("app", "System Tools", "An open source port of libfoo")).toBe("System Tools");
  });

  it("files monitors, firmware tools, containers and terminal emulators under System Tools", () => {
    expect(refine("app", "Utilities", "Interactive processes viewer")).toBe("System Tools");
    expect(refine("app", "Utilities", "Update device firmware on Linux")).toBe("System Tools");
    expect(refine("app", "Utilities", "Manage Flatpak permissions")).toBe("System Tools");
    expect(refine("app", "Utilities", "Manage Distrobox containers")).toBe("System Tools");
    expect(refine("app", "Utilities", "A beautiful GTK 4 terminal")).toBe("System Tools");
    expect(refine("app", "Utilities", "Fast GPU-accelerated terminal emulator")).toBe(
      "System Tools",
    );
    expect(refine("app", "Utilities", "A minimal terminal countdown timer")).toBe("Utilities");
    expect(refine("app", "Utilities", "A minimalist terminal-based focus timer")).toBe("Utilities");
  });

  it("gives racing, shooter, rhythm and visual novel games their own genre", () => {
    expect(refine("game", "Arcade", "High speed arctic racing game")).toBe("Racing");
    expect(refine("game", "Action", "Tactical first person shooter")).toBe("Shooter");
    expect(refine("game", "Arcade", "A free and open source karaoke game")).toBe("Music & Rhythm");
    expect(refine("game", "Adventure", "A cyberpunk visual novel")).toBe("Visual Novel");
    expect(refine("game", "Action", "A heart-racing platformer")).toBe("Action");
  });
});
