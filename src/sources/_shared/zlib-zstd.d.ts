// @types/node@20.19.0 (pinned across this monorepo, matching the "node":
// ">=20.0.0" engines requirement) predates Node's built-in Zstandard
// support — added later, present in the Node 24 this actually runs on.
// Augment rather than bump @types/node just for these two functions.
// zstdDecompressSync is used by _shared/http.ts's fetchZstdText (Fedora,
// openSUSE, Solus); zstdCompressSync only by tests, to build a real
// compressed fixture rather than mocking the decompression itself.
declare module "node:zlib" {
  export function zstdDecompressSync(buffer: NodeJS.ArrayBufferView): Buffer;
  export function zstdCompressSync(buffer: NodeJS.ArrayBufferView): Buffer;
}
