const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1"];

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function round(value) {
  return Math.round(Number(value) || 0);
}

function normalize(value, max) {
  if (!max) return 0;
  return clamp((Number(value) || 0) / max, 0, 1);
}

function getRecentWindow(activity = [], days, offset = 0) {
  const ordered = [...activity].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const end = Math.max(0, ordered.length - offset);
  const start = Math.max(0, end - days);
  return ordered.slice(start, end);
}

function sumBy(items = [], key) {
  return items.reduce((total, item) => total + (Number(item?.[key]) || 0), 0);
}

function countActive(items = []) {
  return items.filter((item) => (Number(item.minutes) || 0) > 0).length;
}

function getCefrDistribution(vocabularyByLevel = {}) {
  const total = CEFR_LEVELS.reduce((sum, level) => sum + (Number(vocabularyByLevel[level]) || 0), 0);
  const items = CEFR_LEVELS.map((level) => {
    const count = Number(vocabularyByLevel[level]) || 0;
    return {
      level,
      count,
      share: total > 0 ? count / total : 0,
    };
  });

  return { total, items };
}

function getInputFit(stats, completionAvg) {
  const distribution = getCefrDistribution(stats?.vocabulary_by_level);
  const stretchShare = (stats?.vocabulary_by_level?.B1 || 0) + (stats?.vocabulary_by_level?.B2 || 0);
  const stretchRatio = distribution.total > 0 ? stretchShare / distribution.total : 0;
  const overloadRatio = distribution.total > 0 ? (stats?.vocabulary_by_level?.C1 || 0) / distribution.total : 0;
  const foundationRatio = distribution.total > 0 ? ((stats?.vocabulary_by_level?.A1 || 0) + (stats?.vocabulary_by_level?.A2 || 0)) / distribution.total : 0;
  const balanceScore = clamp(1 - Math.abs(stretchRatio - 0.52) / 0.52, 0, 1);
  const overloadSafety = clamp(1 - overloadRatio * 3.2, 0, 1);
  const score = round((balanceScore * 0.42 + completionAvg * 0.36 + overloadSafety * 0.22) * 100);

  let label = "待校准";
  let insight = "材料层级已经开始爬升，但 i+1 区间还不够稳定。";
  if (stretchRatio >= 0.38 && overloadRatio <= 0.08 && completionAvg >= 0.68) {
    label = "高命中";
    insight = "大部分输入落在“可理解但有挑战”的区间，符合 Krashen 的 i+1 原则。";
  } else if (foundationRatio >= 0.72) {
    label = "偏易";
    insight = "输入可理解性很高，但挑战梯度偏小，容易停留在 i+0。";
  } else if (overloadRatio >= 0.14) {
    label = "偏难";
    insight = "高阶输入比例偏高，超出可理解输入区间，可能触发理解负担。";
  }

  return {
    score,
    label,
    insight,
    theory: "Krashen · Comprehensible Input",
    stretchRatio: round(stretchRatio * 100),
    overloadRatio: round(overloadRatio * 100),
    completionRate: round(completionAvg * 100),
    bands: distribution.items.map((item) => ({
      ...item,
      sharePercent: round(item.share * 100),
    })),
  };
}

function getInputIntensity(stats) {
  const recent14 = getRecentWindow(stats?.daily_activity, 14, 0);
  const previous14 = getRecentWindow(stats?.daily_activity, 14, 14);
  const recentMinutes = sumBy(recent14, "minutes");
  const recentUnits = sumBy(recent14, "lessons") + sumBy(recent14, "readings");
  const activeDays = countActive(recent14);
  const previousMinutes = sumBy(previous14, "minutes");
  const trendDelta = previousMinutes > 0 ? round(((recentMinutes - previousMinutes) / previousMinutes) * 100) : 0;
  const score = round(
    (normalize(recentMinutes, 420) * 0.52
      + normalize(activeDays, 10) * 0.3
      + normalize(recentUnits, 18) * 0.18) * 100,
  );

  let label = "不足";
  let insight = "近阶段输入频率还不够高，难以稳定驱动习得。";
  if (score >= 78) {
    label = "高密度";
    insight = "你正在稳定接触高频输入，具备形成习得曲线的强度。";
  } else if (score >= 60) {
    label = "有效";
    insight = "输入强度已进入有效区间，但仍有继续加密的空间。";
  }

  return {
    score,
    label,
    insight,
    theory: "Exposure · Sustained Comprehensible Input",
    activeDays,
    recentMinutes,
    trendDelta,
    bars: recent14.map((item) => ({
      date: item.date,
      minutes: Number(item.minutes) || 0,
      intensity: normalize(item.minutes, Math.max(...recent14.map((entry) => Number(entry.minutes) || 0), 1)),
    })),
  };
}

function getConversion(stats, completionAvg) {
  const vocabularyScore = normalize(stats?.vocabulary_count, 900);
  const outputEvidence = stats?.avg_soe_score ? normalize(stats.avg_soe_score, 100) : 0;
  const outputMissing = !stats?.avg_soe_score;
  const score = round((completionAvg * 0.45 + vocabularyScore * 0.3 + outputEvidence * 0.25) * 100);

  let label = "偏弱";
  let insight = "目前更像“接触了输入”，还没有充分证明输入已经被稳固转化。";
  if (score >= 75 && !outputMissing) {
    label = "闭环较强";
    insight = "输入、完成和输出证据已经连成闭环，具备较强说服力。";
  } else if (score >= 58) {
    label = outputMissing ? "证据不足" : "正在转化";
    insight = outputMissing
      ? "已有理解与词汇沉淀，但缺少明确输出证据，闭环说服力受限。"
      : "输入已经在向词汇沉淀和输出迁移，但闭环还不够扎实。";
  }

  return {
    score,
    label,
    insight,
    theory: "Swain + Schmidt · Output & Noticing",
    outputMissing,
    stages: [
      { label: "接触输入", value: 100 },
      { label: "完成理解", value: round(completionAvg * 100) },
      { label: "词汇沉淀", value: round(vocabularyScore * 100) },
      { label: "输出验证", value: outputMissing ? 22 : round(stats.avg_soe_score) },
    ],
  };
}

function buildVerdictLine(inputFit, inputIntensity, conversion) {
  if (inputFit.score >= 75 && inputIntensity.score >= 72 && conversion.score < 62) {
    return "你的学习输入已经接近高质量 i+1 区间，但输入向输出的转化仍是当前最明显的缺口。";
  }
  if (inputFit.score < 60) {
    return "现在最需要先校准的是材料难度，让输入重新回到“可理解但有挑战”的 i+1 区间。";
  }
  if (inputIntensity.score < 60) {
    return "你已经接近有效输入区间，但输入频率还不够稳定，理论上的习得强度仍显不足。";
  }
  if (conversion.outputMissing) {
    return "输入质量和强度都不错，但缺少输出证据，整页的理论说服力会停在“学过”而不是“内化了”。";
  }
  return "这组数据已经能证明你不是在堆时长，而是在接近“有效输入驱动习得”的状态。";
}

function buildVerdictSupport(inputFit, inputIntensity, conversion) {
  return `${inputFit.theory} · ${inputIntensity.theory} · ${conversion.theory}`;
}

function buildHeaderSummary(stats, inputFit) {
  const minutes = Number(stats?.total_study_minutes) || 0;
  return `用现有学习记录推导可理解输入质量，而不是展示普通总量统计。当前累计 ${minutes} 分钟输入，i+1 命中率 ${inputFit.score} 分。`;
}

export function deriveBattleReport(stats) {
  const safeStats = stats || {};
  const completionAvg = (((Number(safeStats.lesson_completion_rate) || 0) + (Number(safeStats.reading_completion_rate) || 0)) / 2);
  const inputFit = getInputFit(safeStats, completionAvg);
  const inputIntensity = getInputIntensity(safeStats);
  const conversion = getConversion(safeStats, completionAvg);

  return {
    headerSummary: buildHeaderSummary(safeStats, inputFit),
    verdictLine: buildVerdictLine(inputFit, inputIntensity, conversion),
    verdictSupport: buildVerdictSupport(inputFit, inputIntensity, conversion),
    predictedLevel: inputFit.score >= 82 ? "B2 Input" : inputFit.score >= 68 ? "B1+ Input" : inputFit.score >= 54 ? "B1 Input" : "A2 Input",
    inputFit,
    inputIntensity,
    conversion,
  };
}
