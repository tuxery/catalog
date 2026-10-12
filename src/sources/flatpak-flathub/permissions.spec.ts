import { describe, expect, it } from "vitest";
import { toFinishArgs } from "./permissions";

describe("toFinishArgs", () => {
  it("rebuilds Firefox's finish-args from its summary (flathub.org/api/v2/summary, 2026-10-12)", () => {
    expect(
      toFinishArgs({
        shared: ["network", "ipc"],
        devices: ["all"],
        filesystems: ["xdg-config/gtk-3.0:ro", "xdg-download"],
        sockets: ["x11", "wayland", "fallback-x11"],
        "session-bus": {
          talk: ["org.gtk.vfs.*", "org.a11y.Bus"],
          own: ["org.mozilla.firefox.*"],
        },
      }),
    ).toEqual([
      "--share=network",
      "--share=ipc",
      "--socket=x11",
      "--socket=wayland",
      "--socket=fallback-x11",
      "--device=all",
      "--filesystem=xdg-config/gtk-3.0:ro",
      "--filesystem=xdg-download",
      "--talk-name=org.gtk.vfs.*",
      "--talk-name=org.a11y.Bus",
      "--own-name=org.mozilla.firefox.*",
    ]);
  });

  it("copes with a null session bus and missing lists", () => {
    expect(toFinishArgs({ "session-bus": null, sockets: ["wayland"] })).toEqual([
      "--socket=wayland",
    ]);
  });

  it("is empty for a declared but closed sandbox, undefined without a permissions block", () => {
    expect(toFinishArgs({})).toEqual([]);
    expect(toFinishArgs(undefined)).toBeUndefined();
    expect(toFinishArgs(null)).toBeUndefined();
  });
});
