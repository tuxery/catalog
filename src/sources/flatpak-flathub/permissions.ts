/**
 * The sandbox permissions Flathub's summary API exposes
 * (`metadata.permissions`), back as the `--share=`/`--socket=`/... arguments
 * of a Flatpak's `finish-args` — the one form the app reads. That API gives
 * `shared`, `sockets`, `devices`, `filesystems` and the session bus's
 * `talk`/`own` names; it leaves out `features` (`--allow=devel`),
 * `persistent`, the system bus and the environment, which Flathub's
 * manifests may still declare. Pure — no I/O.
 */
export interface RawPermissions {
  shared?: string[] | null;
  sockets?: string[] | null;
  devices?: string[] | null;
  filesystems?: string[] | null;
  "session-bus"?: { talk?: string[] | null; own?: string[] | null } | null;
}

/** `undefined` when the package declares no permissions block at all (a runtime, an extension): not the same as a closed sandbox. */
export function toFinishArgs(permissions: RawPermissions | null | undefined): string[] | undefined {
  if (!permissions) return undefined;
  const args = [
    ...(permissions.shared ?? []).map((name) => `--share=${name}`),
    ...(permissions.sockets ?? []).map((name) => `--socket=${name}`),
    ...(permissions.devices ?? []).map((name) => `--device=${name}`),
    ...(permissions.filesystems ?? []).map((path) => `--filesystem=${path}`),
    ...(permissions["session-bus"]?.talk ?? []).map((name) => `--talk-name=${name}`),
    ...(permissions["session-bus"]?.own ?? []).map((name) => `--own-name=${name}`),
  ];
  return args;
}
