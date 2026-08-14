// @types/node@20.19.0 (pinned across this monorepo, matching the "node":
// ">=20.0.0" engines requirement) predates Node's built-in Zstandard
// support — added later, present in the Node 24 this actually runs on.
// Augment rather than bump @types/node just for this one function.
declare module "node:zlib" {
  export function zstdDecompressSync(buffer: NodeJS.ArrayBufferView): Buffer;
}
