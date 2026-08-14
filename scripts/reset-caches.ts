import { refreshSources } from "./_refresh-sources";

// Standalone maintenance command: refreshes every source's git-committed
// NDJSON cache from the network. No dataset rebuild, no dev server —
// just review the diff under packages/sources/cache/ and commit. Use
// `pnpm dev --force` instead if you also want the merged dataset rebuilt
// and a dev server launched right after.
refreshSources();
console.log("All source caches refreshed — review packages/sources/cache/ and commit.");
