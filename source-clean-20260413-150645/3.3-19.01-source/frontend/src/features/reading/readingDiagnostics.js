export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

export const EMPTY_LEVEL_COUNTS = {
  A1: 0,
  A2: 0,
  B1: 0,
  B2: 0,
  C1: 0,
  C2: 0,
  SUPER: 0,
};

export function getCefrLevelIndex(level) {
  return CEFR_LEVELS.indexOf(level);
}

export function clampCefrLevel(level, fallback = "B1") {
  return CEFR_LEVELS.includes(level) ? level : fallback;
}

export function getNextCefrLevel(level) {
  const index = getCefrLevelIndex(level);
  if (index === -1) {
    return "B2";
  }
  return CEFR_LEVELS[Math.min(index + 1, CEFR_LEVELS.length - 1)];
}

export function getRecommendedTargetLevel(userLevel, materialDifficulty) {
  const safeUserLevel = clampCefrLevel(userLevel);
  const safeMaterialLevel = clampCefrLevel(materialDifficulty, safeUserLevel);
  const userIndex = getCefrLevelIndex(safeUserLevel);
  const materialIndex = getCefrLevelIndex(safeMaterialLevel);

  if (materialIndex <= userIndex) {
    return safeUserLevel;
  }
  return getNextCefrLevel(safeUserLevel);
}

export function splitDiagnosticText(text) {
  const normalized = String(text || "").trim();
  if (!normalized) {
    return [];
  }
  return normalized
    .split(/\n+/)
    .flatMap((block) => block.split(/(?<=[.!?])\s+/))
    .map((line) => line.trim())
    .filter(Boolean);
}

export function deriveTargetMetrics(levelCounts, totalWords, targetLevel) {
  const safeTargetLevel = clampCefrLevel(targetLevel);
  const targetIndex = getCefrLevelIndex(safeTargetLevel);
  const counts = { ...EMPTY_LEVEL_COUNTS, ...(levelCounts || {}) };

  const preservedI1Count = counts[safeTargetLevel] || 0;
  const aboveI1Count = Object.entries(counts).reduce((sum, [level, count]) => {
    const index = level === "SUPER" ? Number.POSITIVE_INFINITY : getCefrLevelIndex(level);
    if (index > targetIndex) {
      return sum + (count || 0);
    }
    return sum;
  }, 0);

  const simplificationImpactPercent = totalWords > 0
    ? Math.round((aboveI1Count / totalWords) * 100)
    : 0;

  return {
    preservedI1Count,
    aboveI1Count,
    simplificationImpactPercent,
  };
}

export function estimateDiagnosticSeconds(estimatedTokens, text) {
  const tokenBased = Number.isFinite(estimatedTokens) ? Math.round(8 + estimatedTokens / 120) : null;
  if (tokenBased) {
    return Math.max(8, Math.min(45, tokenBased));
  }
  const textLength = String(text || "").trim().length;
  if (!textLength) {
    return 8;
  }
  return Math.max(8, Math.min(30, Math.round(6 + textLength / 180)));
}

export function formatEstimateTime(seconds) {
  if (!Number.isFinite(seconds)) {
    return "约 10 秒";
  }
  if (seconds < 60) {
    return `约 ${seconds} 秒`;
  }
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `约 ${minutes} 分钟`;
}

export function buildDiagnosticSnapshot({
  text,
  userLevel,
  report,
  selectedTargetLevel,
  estimatedTokens = null,
  estimatedChargeYuan = null,
  diagnosedAt = Date.now(),
}) {
  const safeUserLevel = clampCefrLevel(userLevel);
  const levelCounts = { ...EMPTY_LEVEL_COUNTS, ...(report?.levelCounts || {}) };
  const totalWords = Number(report?.totalWords || 0);
  const materialDifficulty = clampCefrLevel(report?.overallGrade, safeUserLevel);
  const recommendedTargetLevel = getRecommendedTargetLevel(safeUserLevel, materialDifficulty);
  const safeSelectedTargetLevel = clampCefrLevel(selectedTargetLevel, recommendedTargetLevel);
  const targetMetrics = deriveTargetMetrics(levelCounts, totalWords, safeSelectedTargetLevel);
  const estimatedSeconds = estimateDiagnosticSeconds(estimatedTokens, text);

  return {
    userLevel: safeUserLevel,
    materialDifficulty,
    recommendedTargetLevel,
    selectedTargetLevel: safeSelectedTargetLevel,
    totalWords,
    levelCounts,
    fitMessage: report?.userAdaptability?.message || "",
    fitScore: report?.userAdaptability?.score ?? null,
    estimatedTokens,
    estimatedChargeYuan,
    estimatedSeconds,
    diagnosedAt,
    ...targetMetrics,
  };
}

export function updateDiagnosticTarget(snapshot, targetLevel) {
  if (!snapshot) {
    return null;
  }
  const safeTargetLevel = clampCefrLevel(targetLevel, snapshot.recommendedTargetLevel || snapshot.userLevel);
  const targetMetrics = deriveTargetMetrics(snapshot.levelCounts, snapshot.totalWords, safeTargetLevel);
  return {
    ...snapshot,
    selectedTargetLevel: safeTargetLevel,
    ...targetMetrics,
  };
}
