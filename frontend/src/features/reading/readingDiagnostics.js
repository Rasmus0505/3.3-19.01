export const COLLINS_LEVELS = [5, 4, 3, 2, 1];

export const EMPTY_LEVEL_COUNTS = {
  5: 0,
  4: 0,
  3: 0,
  2: 0,
  1: 0,
  unrated: 0,
};

export function clampCollinsLevel(level, fallback = 3) {
  const normalized = Number(level);
  if (COLLINS_LEVELS.includes(normalized)) {
    return normalized;
  }
  return fallback;
}

export function getNextCollinsTarget(level) {
  const normalized = clampCollinsLevel(level, 3);
  return Math.max(1, normalized - 1);
}

export function getRecommendedTargetLevel(userLevel, materialDifficulty) {
  const safeUserLevel = clampCollinsLevel(userLevel);
  const safeMaterialLevel = clampCollinsLevel(materialDifficulty, safeUserLevel);
  if (safeMaterialLevel >= safeUserLevel) {
    return safeUserLevel;
  }
  return getNextCollinsTarget(safeUserLevel);
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
  const safeTargetLevel = clampCollinsLevel(targetLevel);
  const counts = { ...EMPTY_LEVEL_COUNTS, ...(levelCounts || {}) };

  const preservedI1Count = counts[String(safeTargetLevel)] || counts[safeTargetLevel] || 0;
  const aboveI1Count = COLLINS_LEVELS
    .filter((level) => level < safeTargetLevel)
    .reduce((sum, level) => sum + (counts[String(level)] || counts[level] || 0), 0);

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

function normalizeMaterialDifficulty(levelCounts, userLevel) {
  const counts = { ...EMPTY_LEVEL_COUNTS, ...(levelCounts || {}) };
  const total = COLLINS_LEVELS.reduce((sum, level) => sum + (counts[String(level)] || counts[level] || 0), 0);
  if (total <= 0) {
    return userLevel;
  }
  const score = COLLINS_LEVELS.reduce((sum, level) => sum + level * (counts[String(level)] || counts[level] || 0), 0) / total;
  return clampCollinsLevel(Math.round(score), userLevel);
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
  const safeUserLevel = clampCollinsLevel(userLevel);
  const levelCounts = { ...EMPTY_LEVEL_COUNTS, ...(report?.levelCounts || {}) };
  const totalWords = Number(report?.totalWords || 0);
  const materialDifficulty = normalizeMaterialDifficulty(levelCounts, safeUserLevel);
  const recommendedTargetLevel = getRecommendedTargetLevel(safeUserLevel, materialDifficulty);
  const safeSelectedTargetLevel = clampCollinsLevel(selectedTargetLevel, recommendedTargetLevel);
  const targetMetrics = deriveTargetMetrics(levelCounts, totalWords, safeSelectedTargetLevel);
  const estimatedSeconds = estimateDiagnosticSeconds(estimatedTokens, text);

  return {
    userLevel: safeUserLevel,
    materialDifficulty,
    recommendedTargetLevel,
    selectedTargetLevel: safeSelectedTargetLevel,
    totalWords,
    levelCounts,
    fitMessage: report?.fitMessage || "",
    fitScore: report?.fitScore ?? null,
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
  const safeTargetLevel = clampCollinsLevel(targetLevel, snapshot.recommendedTargetLevel || snapshot.userLevel);
  const targetMetrics = deriveTargetMetrics(snapshot.levelCounts, snapshot.totalWords, safeTargetLevel);
  return {
    ...snapshot,
    selectedTargetLevel: safeTargetLevel,
    ...targetMetrics,
  };
}


