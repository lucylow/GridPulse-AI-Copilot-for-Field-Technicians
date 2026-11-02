import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import {
  markOutOfScope,
  routeQuery,
  safeFallbackRouting,
  type QueryRouting,
  type RetrievalStrategy,
} from "./adaptive-retrieval";
import {
  buildKnowledgeGraph,
  expandKnowledgeGraph,
  type KnowledgeGraph,
} from "./knowledge-graph";

export type DemoScenario = {
  id: string;
  title: string;
  description: string;
  assetId: string;
  location: string;
  weather: string;
  incidentNote: string;
};

export type DemoDocument = {
  id: string;
  title: string;
  kind: string;
  description: string;
  content: string;
  sourceLabel: string;
  sourceUrl: string | null;
  validationStatus: string;
};

export type WorkflowStep = {
  id: string;
  label: string;
  status: "complete" | "blocked" | "abstained" | "skipped";
};

export type Trace = {
  id: string;
  query: string;
  outcome: "grounded" | "abstained" | "blocked";
  retrievedDocumentIds: string[];
  durationMs: number;
  createdAt: string;
  steps: WorkflowStep[];
};

export const scenarios: DemoScenario[] = [
  {
    id: "substation-x-heatwave",
    title: "Transformer temperature alarm",
    description:
      "A synthetic incident note for a heatwave scenario at Substation X.",
    assetId: "TX-04",
    location: "Substation X",
    weather: "Heatwave conditions (simulated)",
    incidentNote:
      "Synthetic demonstration incident: a transformer temperature alarm was logged at Substation X during a heatwave. No live telemetry or equipment diagnosis is available.",
  },
];

export const knowledgeDocuments: DemoDocument[] = [
  {
    id: "demo-incident-record",
    title: "Substation X heatwave incident record",
    kind: "Synthetic incident",
    description:
      "Demonstration-only incident record; contains no telemetry or work instructions.",
    content:
      "Synthetic demonstration incident record: a transformer temperature alarm was logged at Substation X during a heatwave. This record contains no live telemetry, equipment diagnosis, or work instruction.",
    sourceLabel: "GridPulse synthetic demo corpus",
    sourceUrl: null,
    validationStatus: "Synthetic demonstration data",
  },
  {
    id: "demo-handoff-template",
    title: "Human-reviewed incident handoff template",
    kind: "Synthetic template",
    description:
      "A documentation-only structure for preparing a reviewer handoff.",
    content:
      "Synthetic coordination template fields: incident summary, observed timestamp, synthetic asset identifier, source of information, missing information, and responsible authorized reviewer. Use only employer-approved channels and procedures. This template specifies no field work steps.",
    sourceLabel: "GridPulse synthetic demo corpus",
    sourceUrl: null,
    validationStatus: "Synthetic demonstration data",
  },
  {
    id: "demo-asset-tx04",
    title: "Synthetic asset registry: TX-04",
    kind: "Mock asset record",
    description:
      "A read-only mock registry entry with no live or verified equipment state.",
    content:
      "Synthetic registry entry: TX-04 is a demonstration transformer associated with Substation X. The record is read-only mock data and does not represent live telemetry, equipment condition, or a verified operating state.",
    sourceLabel: "GridPulse synthetic asset registry",
    sourceUrl: null,
    validationStatus: "Mock record — not operationally verified",
  },
  {
    id: "demo-go174-pointer",
    title: "GO 174 public-source reference pointer",
    kind: "Public source pointer",
    description:
      "A link to an official public index only; current text and revision have not been checked.",
    content:
      "This demo stores a public-source pointer for CPUC General Order 174. It does not include the order text, verify the current revision, or provide operating instructions. Treat the link as a starting point for independent review only.",
    sourceLabel: "California Public Utilities Commission — public index",
    sourceUrl:
      "https://www.cpuc.ca.gov/about-cpuc/divisions/safety-and-enforcement-division/electric-safety-and-reliability-branch/general-order-174-reports",
    validationStatus: "Pointer only — current text not validated",
  },
  {
    id: "demo-safety-scope",
    title: "Simulation scope and safe handoff",
    kind: "Safety boundary",
    description:
      "Explains the demo's limits and routes real-world decisions to authorized people.",
    content:
      "GridPulse Copilot is an independent training simulation. It does not provide electrical field instructions or control equipment. For real events, use employer-approved procedures and authorized control or dispatch channels. Do not approach or interact with a hazard based on this demo.",
    sourceLabel: "GridPulse simulation policy",
    sourceUrl: null,
    validationStatus: "Demo policy — not an operating procedure",
  },
];

const recentTraces: Trace[] = [];

const emergencyPattern =
  /\b(fire|smoke|sparking|sparks|downed line|person down|injured|injury|electric shock|electrocution|explosion|arc flash|uncontrolled arcing)\b/i;

const prohibitedPattern =
  /\b(switch(?:ing)?|energiz(?:e|ed|ation)|de[\s-]?energiz(?:e|ed|ation)?|isolat(?:e|ion|ing)|ground(?:ing)?|live[\s-]?line|minimum approach distance|approach distance|arc[\s-]?flash boundary|ppe|repair(?:ing)?|replace(?:ment|ing)?|relay settings?|protection settings?|test(?:ing)? (?:the )?(?:equipment|line|circuit)|clearance distance)\b/i;

const unsupportedDetailPattern =
  /\b(cause|root cause|why did|what caused|exact (?:reading|value|temperature)|actual (?:reading|value|temperature)|current (?:state|status|reading)|maintenance history|last serviced|verified temperature|confirmed temperature)\b/i;

const stopWords = new Set([
  "about",
  "after",
  "all",
  "and",
  "are",
  "can",
  "could",
  "demo",
  "does",
  "for",
  "from",
  "give",
  "help",
  "how",
  "into",
  "is",
  "it",
  "me",
  "my",
  "of",
  "on",
  "please",
  "show",
  "tell",
  "that",
  "the",
  "this",
  "to",
  "was",
  "what",
  "when",
  "where",
  "which",
  "with",
  "would",
  "you",
]);

function tokens(value: string): string[] {
  return (value.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (token) => token.length > 1 && !stopWords.has(token),
  );
}

function documentText(document: DemoDocument): string {
  return [
    document.title,
    document.description,
    document.content,
    document.sourceLabel,
    document.validationStatus,
  ].join(" ");
}

function rankByKeyword(query: string): Array<{ documentId: string; score: number }> {
  const queryTokens = tokens(query);
  if (queryTokens.length === 0) return [];

  const docs = knowledgeDocuments.map((document) => ({
    document,
    words: tokens(documentText(document)),
  }));
  const averageLength =
    docs.reduce((total, item) => total + item.words.length, 0) / docs.length || 1;
  const k1 = 1.2;
  const b = 0.75;

  return docs
    .map(({ document, words }) => {
      const score = queryTokens.reduce((total, term) => {
        const frequency = words.filter((word) => word === term).length;
        if (frequency === 0) return total;
        const documentFrequency = docs.filter((item) =>
          item.words.includes(term),
        ).length;
        const inverseDocumentFrequency = Math.log(
          1 + (docs.length - documentFrequency + 0.5) / (documentFrequency + 0.5),
        );
        const denominator =
          frequency +
          k1 * (1 - b + b * (words.length / averageLength));
        return (
          total +
          inverseDocumentFrequency *
            ((frequency * (k1 + 1)) / denominator)
        );
      }, 0);
      return { documentId: document.id, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
}

function rankByLocalSimilarity(
  query: string,
): Array<{ documentId: string; score: number }> {
  const queryCounts = new Map<string, number>();
  for (const token of tokens(query)) {
    queryCounts.set(token, (queryCounts.get(token) ?? 0) + 1);
  }
  const queryMagnitude = Math.sqrt(
    [...queryCounts.values()].reduce((sum, count) => sum + count * count, 0),
  );
  if (queryMagnitude === 0) return [];

  return knowledgeDocuments
    .map((document) => {
      const counts = new Map<string, number>();
      for (const token of tokens(documentText(document))) {
        counts.set(token, (counts.get(token) ?? 0) + 1);
      }
      let dot = 0;
      for (const [token, count] of queryCounts) {
        dot += count * (counts.get(token) ?? 0);
      }
      const magnitude = Math.sqrt(
        [...counts.values()].reduce((sum, count) => sum + count * count, 0),
      );
      return {
        documentId: document.id,
        score: magnitude === 0 ? 0 : dot / (queryMagnitude * magnitude),
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
}

function rankByMetadata(query: string): Array<{ documentId: string; score: number }> {
  const queryTerms = tokens(query);
  if (queryTerms.length === 0) return [];

  return knowledgeDocuments
    .map((document) => {
      const metadata = tokens(
        [document.id, document.title, document.kind, document.sourceLabel].join(" "),
      );
      const matchedTerms = queryTerms.filter((term) => metadata.includes(term)).length;
      const exactIdentifier =
        document.id.toLowerCase().includes(query.trim().toLowerCase()) ||
        document.title.toLowerCase().includes(query.trim().toLowerCase());
      return {
        documentId: document.id,
        score: exactIdentifier ? matchedTerms + 2 : matchedTerms,
      };
    })
    .filter((item) => item.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || a.documentId.localeCompare(b.documentId),
    );
}

function hasCorpusOverlap(query: string): boolean {
  const queryTokens = tokens(query);
  if (queryTokens.length === 0) return false;
  const corpusTokens = new Set(
    knowledgeDocuments.flatMap((document) => tokens(documentText(document))),
  );
  return queryTokens.some((token) => corpusTokens.has(token));
}

function emptyRetrieval(
  routing: QueryRouting,
  method: string,
) {
  return {
    method,
    routing,
    metadataRankings: [] as Array<{
      documentId: string;
      rank: number;
      score: number;
    }>,
    keywordRankings: [] as Array<{
      documentId: string;
      rank: number;
      score: number;
    }>,
    localRankings: [] as Array<{
      documentId: string;
      rank: number;
      score: number;
    }>,
    graphRankings: [] as Array<{
      documentId: string;
      rank: number;
      matchedNodeCount: number;
      evidenceEdgeIds: string[];
    }>,
    graphEvidence: [] as Array<{
      documentId: string;
      edgeId: string;
      relationshipType: string;
      evidenceReference: string;
      evidenceExcerpt: string;
      confidenceLabel: string;
    }>,
    fusedRankings: [] as Array<{
      documentId: string;
      rank: number;
      score: number;
    }>,
  };
}

function retrieve(
  query: string,
  routing: QueryRouting,
  graph: KnowledgeGraph,
) {
  const strategy = routing.selectedStrategy;
  if (
    strategy === "SAFETY_GATE_ONLY" ||
    strategy === "NO_TEMPORAL_METADATA" ||
    strategy === "NO_RETRIEVAL"
  ) {
    const method =
      strategy === "SAFETY_GATE_ONLY"
        ? "Retrieval skipped by the deterministic safety gate."
        : strategy === "NO_TEMPORAL_METADATA"
          ? "Temporal retrieval skipped; the corpus has no version history or effective dates."
          : "Retrieval skipped because the query has no overlap with the current synthetic corpus.";
    return emptyRetrieval(routing, method);
  }

  const usesMetadata =
    strategy === "IDENTIFIER_METADATA_BM25" ||
    strategy === "DOCUMENT_METADATA_BM25";
  const metadata = usesMetadata ? rankByMetadata(query) : [];
  const keyword = rankByKeyword(query);
  const usesLocalSimilarity =
    strategy === "LOCAL_HYBRID" ||
    strategy === "LOCAL_HYBRID_GRAPH" ||
    strategy === "LOCAL_HYBRID_SINGLE_PASS";
  const local = usesLocalSimilarity ? rankByLocalSimilarity(query) : [];
  const initialSeedIds = [...new Set([...metadata, ...keyword, ...local]
    .map((item) => item.documentId))].slice(0, 3);
  const graphExpansion =
    strategy === "LOCAL_HYBRID_GRAPH"
      ? expandKnowledgeGraph(query, graph, initialSeedIds)
      : { matchedNodeIds: [], traversedEdges: [], rankings: [] };
  const keywordRanks = new Map(keyword.map((item, index) => [item.documentId, index + 1]));
  const metadataRanks = new Map(
    metadata.map((item, index) => [item.documentId, index + 1]),
  );
  const localRanks = new Map(local.map((item, index) => [item.documentId, index + 1]));
  const graphRanks = new Map(
    graphExpansion.rankings.map((item, index) => [item.documentId, index + 1]),
  );
  const ids = new Set([
    ...metadataRanks.keys(),
    ...keywordRanks.keys(),
    ...localRanks.keys(),
    ...graphRanks.keys(),
  ]);
  const fused = [...ids]
    .map((documentId) => {
      const metadataRank = metadataRanks.get(documentId);
      const keywordRank = keywordRanks.get(documentId);
      const localRank = localRanks.get(documentId);
      const graphRank = graphRanks.get(documentId);
      return {
        documentId,
        score:
          (metadataRank ? 1 / (60 + metadataRank) : 0) +
          (keywordRank ? 1 / (60 + keywordRank) : 0) +
          (localRank ? 1 / (60 + localRank) : 0) +
          (graphRank ? 1 / (60 + graphRank) : 0),
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score || a.documentId.localeCompare(b.documentId),
    );

  const method =
    strategy === "IDENTIFIER_METADATA_BM25"
      ? "Exact identifier metadata + BM25 + reciprocal rank fusion (local only)"
      : strategy === "DOCUMENT_METADATA_BM25"
        ? "Document metadata + BM25 + reciprocal rank fusion (local only)"
        : strategy === "LOCAL_HYBRID_GRAPH"
          ? "BM25 + local sparse-token similarity + RRF + source-backed graph expansion"
          : "BM25 + local sparse-token similarity (not embeddings) + reciprocal rank fusion";

  return {
    method,
    routing,
    metadataRankings: metadata.map((item, index) => ({
      documentId: item.documentId,
      rank: index + 1,
      score: Number(item.score.toFixed(4)),
    })),
    keywordRankings: keyword.map((item, index) => ({
      documentId: item.documentId,
      rank: index + 1,
      score: Number(item.score.toFixed(4)),
    })),
    localRankings: local.map((item, index) => ({
      documentId: item.documentId,
      rank: index + 1,
      score: Number(item.score.toFixed(4)),
    })),
    graphRankings: graphExpansion.rankings,
    graphEvidence: graphExpansion.traversedEdges.map((edge) => ({
      documentId: edge.evidenceReference,
      edgeId: edge.relationshipId,
      relationshipType: edge.relationshipType,
      evidenceReference: edge.evidenceReference,
      evidenceExcerpt: edge.evidenceExcerpt,
      confidenceLabel: edge.confidenceLabel,
    })),
    fusedRankings: fused.slice(0, 5).map((item, index) => ({
      documentId: item.documentId,
      rank: index + 1,
      score: Number(item.score.toFixed(6)),
    })),
  };
}

function makeSteps(
  outcome: Trace["outcome"],
  hasEvidence: boolean,
  routing: QueryRouting,
  graphEvidenceCount: number,
): WorkflowStep[] {
  const blockedBySafety = routing.selectedStrategy === "SAFETY_GATE_ONLY";
  const skippedRetrieval = [
    "SAFETY_GATE_ONLY",
    "NO_TEMPORAL_METADATA",
    "NO_RETRIEVAL",
  ].includes(routing.selectedStrategy);
  const steps: WorkflowStep[] = [
    { id: "input-validation", label: "Input validation", status: "complete" },
    {
      id: "safety-gate",
      label: "Deterministic safety screening",
      status: blockedBySafety ? "blocked" : "complete",
    },
    {
      id: "query-router",
      label: "Adaptive query routing",
      status: blockedBySafety ? "skipped" : "complete",
    },
    {
      id: "hybrid-retrieval",
      label: "Selected local retrieval",
      status: skippedRetrieval ? "skipped" : hasEvidence ? "complete" : "abstained",
    },
  ];
  if (routing.selectedStrategy === "LOCAL_HYBRID_GRAPH") {
    steps.push({
      id: "graph-expansion",
      label: "Source-backed graph expansion",
      status: graphEvidenceCount > 0 ? "complete" : "abstained",
    });
  }
  steps.push(
    {
      id: "response-composer",
      label: "Deterministic structured response",
      status: outcome === "abstained" ? "abstained" : "complete",
    },
    {
      id: "citation-check",
      label: "Citation ID validation",
      status: outcome === "grounded" ? "complete" : "abstained",
    },
  );
  return steps;
}

export function analyzePrompt(prompt: string, scenario: DemoScenario) {
  const startedAt = performance.now();
  const emergency = emergencyPattern.test(prompt);
  const prohibited = prohibitedPattern.test(prompt);
  const unsupportedDetail = unsupportedDetailPattern.test(prompt);
  const temporalQuery =
    /\b(as of|historical|historically|previous version|prior version|revision date|revised on|version history|what changed|before \d{4}|after \d{4})\b/i.test(
      prompt,
    );
  const forcedBlock = emergency || prohibited;
  const intent = /\b(go\s*174|regulator|commission|order)\b/i.test(prompt)
    ? "reference_lookup"
    : /\b(asset|registry|tx[\s-]?04|equipment record)\b/i.test(prompt)
      ? "asset_lookup"
      : /\b(inventory|stock|catalogue|catalog)\b/i.test(prompt)
        ? "inventory_lookup"
        : "incident_summary";

  const summarizesScenario =
    intent === "incident_summary" &&
    /\b(summary|summarize|incident|alarm|transformer|heatwave|substation|handoff)\b/i.test(
      prompt,
    );
  const retrievalQuery = summarizesScenario
    ? `${prompt} ${scenario.incidentNote}`
    : prompt;
  const graph = getKnowledgeGraphSnapshot();
  let routing: QueryRouting;
  if (forcedBlock) {
    routing = routeQuery(prompt, { safetyBlocked: true });
  } else {
    try {
      routing = routeQuery(prompt);
    } catch {
      routing = safeFallbackRouting(prompt);
    }
  }
  if (
    !forcedBlock &&
    !temporalQuery &&
    routing.queryType === "SEMANTIC_KNOWLEDGE_QUERY" &&
    !hasCorpusOverlap(prompt)
  ) {
    routing = markOutOfScope(routing);
  }
  const retrieval = retrieve(retrievalQuery, routing, graph);
  const candidates = forcedBlock || unsupportedDetail || temporalQuery
    ? []
    : retrieval.fusedRankings
        .slice(0, 3)
        .map((ranking) => knowledgeDocuments.find((doc) => doc.id === ranking.documentId))
        .filter((document): document is DemoDocument => Boolean(document));
  const outcome: Trace["outcome"] = forcedBlock
    ? "blocked"
    : candidates.length > 0
      ? "grounded"
      : "abstained";
  const citations = candidates.map((document) => {
    const ranking = retrieval.fusedRankings.find(
      (item) => item.documentId === document.id,
    );
    return {
      id: document.id,
      title: document.title,
      kind: document.kind,
      excerpt: document.content,
      sourceLabel: document.sourceLabel,
      score: ranking?.score ?? 0,
      validationStatus: document.validationStatus,
    };
  });

  let summary: string;
  let safetyNotice: string | null = null;
  if (emergency) {
    summary =
      "Potential emergency language detected. Do not approach or interact with the hazard. Stop using this demo for guidance and follow your employer’s approved emergency procedures and authorized control or dispatch channels. For an immediate threat to people, contact emergency services according to site policy.";
    safetyNotice = "Emergency language detected — procedural guidance stopped.";
  } else if (prohibited) {
    summary =
      "This demo cannot provide electrical operating, approach, testing, PPE, repair, or equipment-control instructions. Do not use it to guide field activity. Follow your employer’s approved procedures and authorized control or dispatch channels.";
    safetyNotice = "Prohibited operational request — fixed safe fallback applied.";
  } else if (temporalQuery) {
    summary =
      "This demo has no source version history or effective dates, so it cannot answer historical or as-of questions. No temporal answer was produced.";
  } else if (candidates.length === 0) {
    summary =
      "Insufficient verified information in this demo knowledge base. No supported answer was produced.";
  } else if (unsupportedDetail) {
    summary =
      "Insufficient verified information in this demo knowledge base. The requested detail is not established by the retrieved records.";
  } else if (intent === "reference_lookup") {
    summary =
      "The demo contains a public-source pointer for GO 174, but it does not include or verify current order text or revisions. Treat the link as a starting point for independent review only; this is not operational guidance.";
  } else if (intent === "asset_lookup") {
    summary =
      "A matching synthetic asset record was found. It is demonstration-only and does not represent live telemetry or a verified equipment state.";
  } else {
    summary =
      "The retrieved demo references provide limited context for a human-reviewed incident handoff. They do not diagnose equipment or prescribe field actions.";
  }

  const facts = candidates.map((document) => document.content);
  const assumptions =
    outcome === "grounded"
      ? ["All scenario, asset, and incident details in this demo are synthetic."]
      : [];
  const missingInformation =
    outcome === "grounded"
      ? [
          "No live telemetry or verified equipment status is available.",
          "A qualified human must review any real-world information using approved channels.",
        ]
      : [];
  const durationMs = Number((performance.now() - startedAt).toFixed(2));
  const createdAt = new Date().toISOString();
  const traceId = randomUUID();
  const steps = makeSteps(
    outcome,
    candidates.length > 0,
    routing,
    retrieval.graphEvidence.length,
  );

  return {
    traceId,
    outcome,
    intent,
    summary,
    facts,
    assumptions,
    missingInformation,
    citations,
    retrieval,
    steps,
    durationMs,
    safetyNotice,
    createdAt,
    trace: {
      id: traceId,
      query: prompt,
      outcome,
      retrievedDocumentIds: citations.map((citation) => citation.id),
      durationMs,
      createdAt,
      steps,
    } satisfies Trace,
  };
}

export function storeTrace(trace: Trace): void {
  recentTraces.unshift(trace);
  if (recentTraces.length > 20) recentTraces.length = 20;
}

export function listRecentTraces(): Trace[] {
  return [...recentTraces];
}

let graphSnapshot: KnowledgeGraph | undefined;

export function getKnowledgeGraphSnapshot(): KnowledgeGraph {
  graphSnapshot ??= buildKnowledgeGraph(knowledgeDocuments);
  return graphSnapshot;
}
