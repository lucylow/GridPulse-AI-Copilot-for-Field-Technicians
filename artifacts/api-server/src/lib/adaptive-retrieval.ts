export const queryTypes = [
  "EXACT_IDENTIFIER_QUERY",
  "SEMANTIC_KNOWLEDGE_QUERY",
  "RELATIONSHIP_QUERY",
  "DOCUMENT_LOOKUP_QUERY",
  "TEMPORAL_QUERY",
  "MULTI_PART_QUERY",
  "OUT_OF_SCOPE_QUERY",
] as const;

export const retrievalStrategies = [
  "IDENTIFIER_METADATA_BM25",
  "DOCUMENT_METADATA_BM25",
  "LOCAL_HYBRID",
  "LOCAL_HYBRID_GRAPH",
  "LOCAL_HYBRID_SINGLE_PASS",
  "NO_TEMPORAL_METADATA",
  "NO_RETRIEVAL",
  "SAFETY_GATE_ONLY",
] as const;

export type QueryType = (typeof queryTypes)[number];
export type RetrievalStrategy = (typeof retrievalStrategies)[number];

export type QueryRouting = {
  queryType: QueryType;
  selectedStrategy: RetrievalStrategy;
  rationale: string;
  normalizedQuery: string;
  fallbackUsed: boolean;
};

const temporalPattern =
  /\b(as of|historical|historically|previous version|prior version|revision date|revised on|version history|what changed|before \d{4}|after \d{4})\b/i;
const relationshipPattern =
  /\b(related|relationship|connect(?:ed|ion)?|link(?:ed)?|between|associated|relate(?:d)? to|graph)\b/i;
const identifierPattern =
  /\b(?:tx[\s-]?\d{2}|go\s*174|general order\s*174|demo-[a-z0-9-]+)\b/i;
const documentPattern =
  /\b(document|source|record|reference|citation|pointer)\b/i;
const multiPartPattern =
  /[?;]| \b(?:and also|as well as|additionally)\b /i;

function route(
  query: string,
  queryType: QueryType,
  selectedStrategy: RetrievalStrategy,
  rationale: string,
): QueryRouting {
  return {
    queryType,
    selectedStrategy,
    rationale,
    normalizedQuery: query.trim().replace(/\s+/g, " "),
    fallbackUsed: false,
  };
}

export function routeQuery(
  query: string,
  options: { safetyBlocked?: boolean } = {},
): QueryRouting {
  const normalizedQuery = query.trim().replace(/\s+/g, " ");
  if (options.safetyBlocked) {
    return route(
      normalizedQuery,
      "OUT_OF_SCOPE_QUERY",
      "SAFETY_GATE_ONLY",
      "The deterministic safety gate blocked this request; retrieval and graph expansion were not run.",
    );
  }
  if (temporalPattern.test(normalizedQuery)) {
    return route(
      normalizedQuery,
      "TEMPORAL_QUERY",
      "NO_TEMPORAL_METADATA",
      "The corpus has no version history or effective dates, so historical retrieval is unavailable.",
    );
  }
  if (relationshipPattern.test(normalizedQuery)) {
    return route(
      normalizedQuery,
      "RELATIONSHIP_QUERY",
      "LOCAL_HYBRID_GRAPH",
      "Run local keyword and sparse-token retrieval, then expand only source-backed graph relationships.",
    );
  }
  if (identifierPattern.test(normalizedQuery)) {
    return route(
      normalizedQuery,
      "EXACT_IDENTIFIER_QUERY",
      "IDENTIFIER_METADATA_BM25",
      "Prioritize exact source metadata and local keyword ranking; no neural embedding or model call is used.",
    );
  }
  if (documentPattern.test(normalizedQuery)) {
    return route(
      normalizedQuery,
      "DOCUMENT_LOOKUP_QUERY",
      "DOCUMENT_METADATA_BM25",
      "Prioritize document identifiers and source metadata with local keyword ranking.",
    );
  }
  if (multiPartPattern.test(normalizedQuery)) {
    return route(
      normalizedQuery,
      "MULTI_PART_QUERY",
      "LOCAL_HYBRID_SINGLE_PASS",
      "Keep the original request intact and run one local hybrid pass; automatic decomposition is not enabled.",
    );
  }
  return route(
    normalizedQuery,
    "SEMANTIC_KNOWLEDGE_QUERY",
    "LOCAL_HYBRID",
    "Use the existing BM25 and local sparse-token similarity; this is not a neural semantic search.",
  );
}

export function markOutOfScope(
  routing: QueryRouting,
  rationale = "No terms overlap the current synthetic corpus; retrieval was skipped.",
): QueryRouting {
  return {
    ...routing,
    queryType: "OUT_OF_SCOPE_QUERY",
    selectedStrategy: "NO_RETRIEVAL",
    rationale,
  };
}

export function safeFallbackRouting(query: string): QueryRouting {
  return {
    queryType: "SEMANTIC_KNOWLEDGE_QUERY",
    selectedStrategy: "LOCAL_HYBRID",
    rationale:
      "The query router failed; the documented fallback is one local hybrid search.",
    normalizedQuery: query.trim().replace(/\s+/g, " "),
    fallbackUsed: true,
  };
}
