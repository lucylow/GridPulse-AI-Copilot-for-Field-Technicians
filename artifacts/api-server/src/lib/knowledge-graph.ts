import type { DemoDocument } from "./gridpulse";

export const graphNodeTypes = [
  "DOCUMENT",
  "SECTION",
  "TECHNICAL_CONCEPT",
  "ASSET_CLASS",
  "INCIDENT_CATEGORY",
  "REGULATORY_REFERENCE",
  "COMPONENT",
] as const;

export const graphRelationshipTypes = [
  "DOCUMENT_CONTAINS_SECTION",
  "SECTION_REFERENCES_CONCEPT",
  "DOCUMENT_REFERENCES_REGULATION",
  "ASSET_CLASS_HAS_COMPONENT",
  "INCIDENT_CATEGORY_RELATES_TO_CONCEPT",
  "SECTION_REFERENCES_SECTION",
  "CONCEPT_HAS_SYNONYM",
  "SECTION_DESCRIBES_ASSET_CLASS",
  "SECTION_CLASSIFIES_INCIDENT",
] as const;

export type GraphNodeType = (typeof graphNodeTypes)[number];
export type GraphRelationshipType = (typeof graphRelationshipTypes)[number];

export type KnowledgeGraphNode = {
  nodeId: string;
  nodeType: GraphNodeType;
  canonicalName: string;
  description: string;
  sourceDocumentId: string | null;
  verificationStatus: string;
  createdAt: string | null;
  updatedAt: string | null;
  metadata: Record<string, string>;
};

export type KnowledgeGraphEdge = {
  relationshipId: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationshipType: GraphRelationshipType;
  evidenceReference: string;
  evidenceExcerpt: string;
  confidenceLabel: string;
  creationMethod: string;
  timestamp: string | null;
};

export type KnowledgeGraph = {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  provenance: string;
};

export type GraphDocumentRanking = {
  documentId: string;
  rank: number;
  matchedNodeCount: number;
  evidenceEdgeIds: string[];
};

export type GraphExpansion = {
  matchedNodeIds: string[];
  traversedEdges: KnowledgeGraphEdge[];
  rankings: GraphDocumentRanking[];
};

type ConceptSeed = {
  id: string;
  name: string;
  aliases: string[];
  description: string;
  verificationStatus: string;
};

const conceptSeeds: ConceptSeed[] = [
  {
    id: "concept:transformer",
    name: "Transformer",
    aliases: ["transformer"],
    description: "A term explicitly present in synthetic source records.",
    verificationStatus: "Synthetic source term — not a live asset claim",
  },
  {
    id: "concept:temperature-alarm",
    name: "Temperature alarm",
    aliases: ["temperature alarm"],
    description: "A synthetic incident phrase present in the demo record.",
    verificationStatus: "Synthetic demonstration data",
  },
  {
    id: "concept:heatwave",
    name: "Heatwave",
    aliases: ["heatwave"],
    description: "A scenario descriptor explicitly present in the demo record.",
    verificationStatus: "Synthetic demonstration data",
  },
  {
    id: "concept:handoff",
    name: "Incident handoff",
    aliases: ["handoff"],
    description: "A documentation-only handoff term in the synthetic template.",
    verificationStatus: "Synthetic demonstration data",
  },
  {
    id: "concept:tx-04",
    name: "TX-04",
    aliases: ["tx-04", "tx 04"],
    description: "A synthetic asset identifier shown in the mock registry.",
    verificationStatus: "Mock record — not operationally verified",
  },
];

function hasPhrase(text: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, "i").test(text);
}

function makeNode(
  node: Omit<KnowledgeGraphNode, "createdAt" | "updatedAt">,
): KnowledgeGraphNode {
  return { ...node, createdAt: null, updatedAt: null };
}

function makeEdge(
  sourceNodeId: string,
  targetNodeId: string,
  relationshipType: GraphRelationshipType,
  evidenceDocumentId: string,
  evidenceExcerpt: string,
  confidenceLabel: string,
  creationMethod: string,
): KnowledgeGraphEdge {
  const relationshipId = [
    "edge",
    sourceNodeId,
    relationshipType,
    targetNodeId,
    evidenceDocumentId,
  ].join(":");
  return {
    relationshipId,
    sourceNodeId,
    targetNodeId,
    relationshipType,
    evidenceReference: evidenceDocumentId,
    evidenceExcerpt,
    confidenceLabel,
    creationMethod,
    timestamp: null,
  };
}

export function buildKnowledgeGraph(
  documents: DemoDocument[],
): KnowledgeGraph {
  const nodes: KnowledgeGraphNode[] = [];
  const edges: KnowledgeGraphEdge[] = [];
  const documentById = new Map(documents.map((document) => [document.id, document]));
  const fullTextById = new Map(
    documents.map((document) => [
      document.id,
      [
        document.title,
        document.description,
        document.content,
        document.sourceLabel,
      ].join(" "),
    ]),
  );

  for (const document of documents) {
    const documentNodeId = `document:${document.id}`;
    const sectionNodeId = `section:${document.id}:whole-record`;
    nodes.push(
      makeNode({
        nodeId: documentNodeId,
        nodeType: "DOCUMENT",
        canonicalName: document.title,
        description: document.description,
        sourceDocumentId: document.id,
        verificationStatus: document.validationStatus,
        metadata: {
          documentKind: document.kind,
          sourceLabel: document.sourceLabel,
        },
      }),
      makeNode({
        nodeId: sectionNodeId,
        nodeType: "SECTION",
        canonicalName: `Whole record — ${document.title}`,
        description:
          "A synthetic whole-record grouping; the source has no parsed section structure.",
        sourceDocumentId: document.id,
        verificationStatus: document.validationStatus,
        metadata: {
          sectionMethod: "synthetic-whole-record",
          documentId: document.id,
        },
      }),
    );
    edges.push(
      makeEdge(
        documentNodeId,
        sectionNodeId,
        "DOCUMENT_CONTAINS_SECTION",
        document.id,
        "Whole synthetic record",
        "source-record",
        "synthetic-whole-record-annotation",
      ),
    );
  }

  for (const seed of conceptSeeds) {
    const sourceDocuments = documents.filter((document) => {
      const text = fullTextById.get(document.id) ?? "";
      return seed.aliases.some((alias) => hasPhrase(text, alias));
    });
    if (!sourceDocuments.length) continue;

    nodes.push(
      makeNode({
        nodeId: seed.id,
        nodeType: "TECHNICAL_CONCEPT",
        canonicalName: seed.name,
        description: seed.description,
        sourceDocumentId: null,
        verificationStatus: seed.verificationStatus,
        metadata: {
          aliases: seed.aliases.join("|"),
          entityResolution: "exact lexical match only",
          sourceDocumentIds: sourceDocuments.map((item) => item.id).join("|"),
        },
      }),
    );

    for (const document of sourceDocuments) {
      const matchedAlias = seed.aliases.find((alias) =>
        hasPhrase(fullTextById.get(document.id) ?? "", alias),
      );
      if (!matchedAlias) continue;
      edges.push(
        makeEdge(
          `section:${document.id}:whole-record`,
          seed.id,
          "SECTION_REFERENCES_CONCEPT",
          document.id,
          matchedAlias,
          "verbatim-source-term",
          "deterministic-phrase-match",
        ),
      );
    }
  }

  const assetDocument = documentById.get("demo-asset-tx04");
  if (assetDocument) {
    const assetText = fullTextById.get(assetDocument.id) ?? "";
    if (hasPhrase(assetText, "TX-04") && hasPhrase(assetText, "transformer")) {
      const assetNodeId = "asset-class:synthetic-transformer-tx04";
      nodes.push(
        makeNode({
          nodeId: assetNodeId,
          nodeType: "ASSET_CLASS",
          canonicalName: "Synthetic transformer (TX-04)",
          description:
            "A mock asset category from the read-only synthetic registry.",
          sourceDocumentId: assetDocument.id,
          verificationStatus: assetDocument.validationStatus,
          metadata: {
            assetId: "TX-04",
            sourceKind: assetDocument.kind,
            operatingState: "not represented",
          },
        }),
      );
      edges.push(
        makeEdge(
          `section:${assetDocument.id}:whole-record`,
          assetNodeId,
          "SECTION_DESCRIBES_ASSET_CLASS",
          assetDocument.id,
          "TX-04 is a demonstration transformer",
          "explicit-synthetic-record",
          "curated-synthetic-source-annotation",
        ),
      );
    }
  }

  const incidentDocument = documentById.get("demo-incident-record");
  if (incidentDocument) {
    const incidentText = fullTextById.get(incidentDocument.id) ?? "";
    if (
      hasPhrase(incidentText, "temperature alarm") &&
      hasPhrase(incidentText, "heatwave")
    ) {
      const incidentNodeId = "incident-category:synthetic-temperature-alarm";
      nodes.push(
        makeNode({
          nodeId: incidentNodeId,
          nodeType: "INCIDENT_CATEGORY",
          canonicalName: "Synthetic temperature alarm during heatwave",
          description:
            "A category label curated from the synthetic incident record.",
          sourceDocumentId: incidentDocument.id,
          verificationStatus: incidentDocument.validationStatus,
          metadata: {
            categoryMethod: "curated-from-explicit-synthetic-record",
          },
        }),
      );
      edges.push(
        makeEdge(
          `section:${incidentDocument.id}:whole-record`,
          incidentNodeId,
          "SECTION_CLASSIFIES_INCIDENT",
          incidentDocument.id,
          "transformer temperature alarm was logged ... during a heatwave",
          "explicit-synthetic-record",
          "curated-synthetic-source-annotation",
        ),
      );
      for (const conceptId of [
        "concept:transformer",
        "concept:temperature-alarm",
        "concept:heatwave",
      ]) {
        if (nodes.some((node) => node.nodeId === conceptId)) {
          edges.push(
            makeEdge(
              incidentNodeId,
              conceptId,
              "INCIDENT_CATEGORY_RELATES_TO_CONCEPT",
              incidentDocument.id,
              "Synthetic incident text names this term",
              "explicit-synthetic-record",
              "curated-synthetic-source-annotation",
            ),
          );
        }
      }
    }
  }

  const regulationDocument = documentById.get("demo-go174-pointer");
  if (regulationDocument) {
    const regulationText = fullTextById.get(regulationDocument.id) ?? "";
    if (
      hasPhrase(regulationText, "GO 174") &&
      hasPhrase(regulationText, "General Order 174")
    ) {
      const regulationNodeId = "regulation:go-174-pointer";
      const goNodeId = "concept:go-174-name";
      const generalOrderNodeId = "concept:general-order-174-name";
      nodes.push(
        makeNode({
          nodeId: regulationNodeId,
          nodeType: "REGULATORY_REFERENCE",
          canonicalName: "CPUC General Order 174 public-source pointer",
          description:
            "A public index pointer only; current text and revision are unvalidated.",
          sourceDocumentId: regulationDocument.id,
          verificationStatus: regulationDocument.validationStatus,
          metadata: {
            validationBoundary: "pointer only; not verified legal text",
          },
        }),
        makeNode({
          nodeId: goNodeId,
          nodeType: "TECHNICAL_CONCEPT",
          canonicalName: "GO 174",
          description: "Exact label used by the synthetic public-source pointer.",
          sourceDocumentId: regulationDocument.id,
          verificationStatus: regulationDocument.validationStatus,
          metadata: { entityResolution: "lexical alias only" },
        }),
        makeNode({
          nodeId: generalOrderNodeId,
          nodeType: "TECHNICAL_CONCEPT",
          canonicalName: "General Order 174",
          description:
            "Exact expanded label used by the same unvalidated public-source pointer.",
          sourceDocumentId: regulationDocument.id,
          verificationStatus: regulationDocument.validationStatus,
          metadata: { entityResolution: "lexical alias only" },
        }),
      );
      edges.push(
        makeEdge(
          `document:${regulationDocument.id}`,
          regulationNodeId,
          "DOCUMENT_REFERENCES_REGULATION",
          regulationDocument.id,
          "Public-source reference pointer",
          "pointer-only-unvalidated",
          "source-metadata",
        ),
        makeEdge(
          `section:${regulationDocument.id}:whole-record`,
          goNodeId,
          "SECTION_REFERENCES_CONCEPT",
          regulationDocument.id,
          "GO 174",
          "verbatim-source-term",
          "deterministic-phrase-match",
        ),
        makeEdge(
          `section:${regulationDocument.id}:whole-record`,
          generalOrderNodeId,
          "SECTION_REFERENCES_CONCEPT",
          regulationDocument.id,
          "CPUC General Order 174",
          "verbatim-source-term",
          "deterministic-phrase-match",
        ),
        makeEdge(
          goNodeId,
          generalOrderNodeId,
          "CONCEPT_HAS_SYNONYM",
          regulationDocument.id,
          "Both labels appear in the same pointer record.",
          "source-cooccurrence-only",
          "curated-lexical-alias",
        ),
      );
    }
  }

  return {
    nodes: nodes.sort((a, b) => a.nodeId.localeCompare(b.nodeId)),
    edges: edges.sort((a, b) => a.relationshipId.localeCompare(b.relationshipId)),
    provenance:
      "Built from the current synthetic corpus using explicit source metadata, curated synthetic labels, and exact phrase matches. No external model or source is used.",
  };
}

export function expandKnowledgeGraph(
  query: string,
  graph: KnowledgeGraph,
  seedDocumentIds: string[],
): GraphExpansion {
  const queryLower = query.toLowerCase();
  const matchedNodes = graph.nodes.filter((node) => {
    if (node.nodeType === "DOCUMENT" || node.nodeType === "SECTION") return false;
    const aliases = node.metadata.aliases?.split("|") ?? [];
    return [node.canonicalName, ...aliases].some((alias) =>
      alias.length > 1 && hasPhrase(queryLower, alias.toLowerCase()),
    );
  });
  const matchedIds = new Set(matchedNodes.map((node) => node.nodeId));
  const traversedEdges = graph.edges.filter(
    (edge) => matchedIds.has(edge.sourceNodeId) || matchedIds.has(edge.targetNodeId),
  );
  const evidenceByDocument = new Map<string, Set<string>>();
  const nodeById = new Map(graph.nodes.map((node) => [node.nodeId, node]));

  for (const edge of traversedEdges) {
    const evidenceDocumentId = edge.evidenceReference;
    if (evidenceDocumentId) {
      const set = evidenceByDocument.get(evidenceDocumentId) ?? new Set<string>();
      set.add(edge.relationshipId);
      evidenceByDocument.set(evidenceDocumentId, set);
    }
    for (const nodeId of [edge.sourceNodeId, edge.targetNodeId]) {
      const documentId = nodeById.get(nodeId)?.sourceDocumentId;
      if (!documentId) continue;
      const set = evidenceByDocument.get(documentId) ?? new Set<string>();
      set.add(edge.relationshipId);
      evidenceByDocument.set(documentId, set);
    }
  }

  const seeds = new Set(seedDocumentIds);
  const rankings = [...evidenceByDocument.entries()]
    .filter(([documentId]) => !seeds.has(documentId))
    .sort(
      (a, b) =>
        b[1].size - a[1].size || a[0].localeCompare(b[0]),
    )
    .slice(0, 5)
    .map(([documentId, edgeIds], index) => ({
      documentId,
      rank: index + 1,
      matchedNodeCount: matchedNodes.length,
      evidenceEdgeIds: [...edgeIds].sort(),
    }));

  return {
    matchedNodeIds: matchedNodes.map((node) => node.nodeId).sort(),
    traversedEdges,
    rankings,
  };
}
