function trimSentence(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

export function splitPackSentences(text) {
  return String(text || "")
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .flatMap((block) => block.split(/(?<=[.!?])\s+/))
    .map(trimSentence)
    .filter(Boolean);
}

export function buildDiagnosticSummary(snapshot) {
  if (!snapshot) {
    return {
      materialDifficulty: null,
      preservedI1Count: 0,
      aboveI1Count: 0,
    };
  }

  return {
    materialDifficulty: snapshot.materialDifficulty || null,
    preservedI1Count: Number(snapshot.preservedI1Count || 0),
    aboveI1Count: Number(snapshot.aboveI1Count || 0),
  };
}

function findMatchingMappings(sentence, mappings) {
  const source = sentence.toLowerCase();
  return (Array.isArray(mappings) ? mappings : []).filter((mapping) => {
    const original = String(mapping?.original || "").toLowerCase();
    const rewritten = String(mapping?.rewritten || "").toLowerCase();
    return (original && source.includes(original)) || (rewritten && source.includes(rewritten));
  });
}

export function buildComparisonCards({ originalText, rewrittenText, mappings = [] }) {
  const originalSentences = splitPackSentences(originalText);
  const rewrittenSentences = splitPackSentences(rewrittenText);
  const total = Math.max(originalSentences.length, rewrittenSentences.length);

  return Array.from({ length: total }, (_, index) => {
    const originalSentence = originalSentences[index] || "";
    const rewrittenSentence = rewrittenSentences[index] || "";
    const matchingMappings = findMatchingMappings(
      `${originalSentence} ${rewrittenSentence}`,
      mappings,
    ).map((mapping) => ({
      original: String(mapping?.original || ""),
      rewritten: String(mapping?.rewritten || ""),
      confirmed: Boolean(mapping?.confirmed),
      finalLevel: mapping?.finalLevel || null,
    }));

    return {
      id: `comparison-${index + 1}`,
      index,
      originalText: originalSentence,
      rewrittenText: rewrittenSentence,
      changed: originalSentence !== rewrittenSentence,
      mappings: matchingMappings,
    };
  }).filter((card) => card.originalText || card.rewrittenText);
}

export function buildReadingPack({
  articleId,
  originalText,
  rewrittenText,
  mappings = [],
  diagnosticSnapshot = null,
  wordLevels = {},
  validI1Words = [],
  validAboveI1Words = [],
  removedWords = [],
  assembledAt = Date.now(),
}) {
  const targetLevel = diagnosticSnapshot?.selectedTargetLevel || diagnosticSnapshot?.recommendedTargetLevel || null;

  return {
    articleId,
    status: "completed",
    assembledAt,
    targetLevel,
    originalText: String(originalText || ""),
    rewrittenText: String(rewrittenText || ""),
    mappings: Array.isArray(mappings) ? mappings : [],
    wordLevels: { ...(wordLevels || {}) },
    validI1Words: Array.isArray(validI1Words) ? [...validI1Words] : [],
    validAboveI1Words: Array.isArray(validAboveI1Words) ? [...validAboveI1Words] : [],
    removedWords: Array.isArray(removedWords) ? [...removedWords] : [],
    diagnosticSummary: buildDiagnosticSummary(diagnosticSnapshot),
    comparisonCards: buildComparisonCards({
      originalText,
      rewrittenText,
      mappings,
    }),
  };
}


