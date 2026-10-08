export { levenshteinDistance, levenshteinSimilarity } from "./match/levenshtein";
export { scoreMatch, MATCH_WEIGHTS } from "./match/score";
export { groupPackages, type MatchedApp } from "./match/group";
export { filterPackages } from "./filter";
export { enrichApps, hasUpstreamCategory } from "./enrich";
export type { CatalogApp } from "./enrich/types";
export { attachFamilies } from "./family";
export type { Companion, CompanionKind, Relation, RelationType } from "./family";
