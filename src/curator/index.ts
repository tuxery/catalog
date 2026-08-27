export { levenshteinDistance, levenshteinSimilarity } from "./match/levenshtein";
export { scoreMatch, MATCH_WEIGHTS } from "./match/score";
export { groupPackages, type MatchedApp } from "./match/group";
export { filterPackages } from "./filter";
export { enrichApps } from "./enrich";
export type { CatalogApp } from "./enrich/types";
