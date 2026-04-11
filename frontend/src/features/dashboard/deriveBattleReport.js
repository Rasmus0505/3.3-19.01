const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1"];

const ABILITY_META = {
  listening: {
    label: "听力",
    strong: "输入捕捉效率高，适合继续做高频精听。",
    weak: "需要稳定的高质量输入，避免练习断档。",
  },
  reading: {
    label: "阅读",
    strong: "阅读吸收速度快，适合承担进阶材料。",
    weak: "阅读密度偏低，当前还没形成持续积累。",
  },
  vocabulary: {
    label: "词汇",
    strong: "词汇层级在抬升，已经具备向上突破的基础。",
    weak: "词汇储备还在搭框架，建议强化层级积累。",
  },
  grammar: {
    label: "语法",
    strong: "结构感正在成型，适合结合例句继续打磨。",
    weak: "结构稳定性不足，容易拖慢输出质量。",
  },
  speaking: {
    label: "口语",
    strong: "输出状态不错，可以增加实战表达比例。",
    weak: "输出维度偏弱，需要增加跟读和开口反馈。",
  },
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function round(value) {
  return Math.round(Number(value) || 0);
}

function formatPercent(value) {
  return `${round((Number(value) || 0) * 100)}%`;
}

function formatHours(minutes) {
  const hours = (Number(minutes) || 0) / 60;
  return `${hours >= 10 ? round(hours) : hours.toFixed(1)}h`;
}

function getRecentWindow(activity = [], days, offset = 0) {
  const ordered = [...activity].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const end = Math.max(0, ordered.length - offset);
  const start = Math.max(0, end - days);
  return ordered.slice(start, end);
}

function sumMinutes(items = []) {
  return items.reduce((total, item) => total + (Number(item.minutes) || 0), 0);
}

function countActiveDays(items = []) {
  return items.filter((item) => (Number(item.minutes) || 0) > 0).length;
}

function getMomentum(activity = [], streakDays = 0) {
  const recent14 = getRecentWindow(activity, 14, 0);
  const previous14 = getRecentWindow(activity, 14, 14);
  const recentMinutes = sumMinutes(recent14);
  const previousMinutes = sumMinutes(previous14);
  const activeDays = countActiveDays(recent14);
  const trendRatio = previousMinutes > 0 ? (recentMinutes - previousMinutes) / previousMinutes : 1;
  const trendDelta = round(trendRatio * 100);
  const score = clamp(round(recentMinutes / 7 + activeDays * 4 + streakDays * 1.8), 18, 99);

  let label = "稳定蓄力";
  let direction = "flat";
  if (trendRatio > 0.18) {
    label = "持续升温";
    direction = "up";
  } else if (trendRatio < -0.18) {
    label = "需要回拉";
    direction = "down";
  }

  return {
    score,
    label,
    direction,
    recentMinutes,
    activeDays,
    trendDelta,
  };
}

function getStage(totalMinutes = 0, streakDays = 0, momentumScore = 0) {
  if (totalMinutes >= 1800 || momentumScore >= 80) {
    return {
      label: "冲刺突破期",
      description: "学习密度和节奏已经具备比赛展示张力，重点是把优势放大成成果。",
      badge: "SHOWCASE MODE",
    };
  }
  if (totalMinutes >= 720 || streakDays >= 10 || momentumScore >= 60) {
    return {
      label: "稳定进阶期",
      description: "学习闭环基本形成，最适合通过聚焦突破口拉开与普通用户的差距。",
      badge: "GROWTH MODE",
    };
  }
  return {
    label: "基础建模期",
    description: "底层能力正在搭框架，需要用更高密度的完成记录来形成清晰曲线。",
    badge: "BOOT MODE",
  };
}

function getAverageSkill(skillScores = {}) {
  const values = Object.values(skillScores).map((value) => Number(value) || 0);
  if (!values.length) return 0;
  return round(values.reduce((total, value) => total + value, 0) / values.length);
}

function getFocusMix(stats) {
  const lessons = Number(stats?.total_lessons) || 0;
  const readings = Number(stats?.total_reading_packs) || 0;
  if (lessons >= readings * 1.35) {
    return { label: "听力驱动", detail: "输入训练占主导，适合继续拉高精听上限。" };
  }
  if (readings >= lessons * 1.2) {
    return { label: "阅读驱动", detail: "阅读吸收更强，适合强化材料难度与词汇穿透。" };
  }
  return { label: "双栖推进", detail: "听读比例均衡，适合做闭环式进阶展示。" };
}

function pickSkillExtremes(skillScores = {}) {
  const ranked = Object.entries(skillScores)
    .map(([key, value]) => ({ key, value: Number(value) || 0 }))
    .sort((a, b) => b.value - a.value);
  return {
    strongest: ranked[0] || { key: "reading", value: 0 },
    weakest: ranked[ranked.length - 1] || { key: "speaking", value: 0 },
    ranked,
  };
}

function predictCefr(stats, overallScore) {
  const levels = stats?.vocabulary_by_level || {};
  const b2Plus = (levels.B2 || 0) + (levels.C1 || 0);
  const b1Plus = b2Plus + (levels.B1 || 0);

  if (overallScore >= 82 || b2Plus >= 120) return "B2";
  if (overallScore >= 68 || b1Plus >= 180) return "B1+";
  if (overallScore >= 55 || (levels.A2 || 0) + (levels.B1 || 0) >= 120) return "B1";
  if (overallScore >= 40 || (levels.A1 || 0) + (levels.A2 || 0) >= 80) return "A2";
  return "A1";
}

function getMission(stats, weakestSkillKey, predictedLevel) {
  const lessons = Number(stats?.total_lessons) || 0;
  const readings = Number(stats?.total_reading_packs) || 0;
  const levels = stats?.vocabulary_by_level || {};
  const nextLevel = predictedLevel.startsWith("A") ? "B1" : predictedLevel.startsWith("B1") ? "B2" : "C1";

  if (weakestSkillKey === "speaking") {
    return {
      title: "补强口语输出",
      detail: "把口语打分与跟读复盘拉进日常任务，形成输入到输出的闭环。",
    };
  }
  if (weakestSkillKey === "grammar") {
    return {
      title: "校准语法结构",
      detail: "用短句改写和高频句型复用，解决结构稳定性问题。",
    };
  }
  if ((levels[nextLevel] || 0) < 60) {
    return {
      title: `冲击 ${nextLevel} 词汇层`,
      detail: `当前最适合把词汇重心抬到 ${nextLevel}，让展示不止停留在基础层。`,
    };
  }
  if (lessons >= readings) {
    return {
      title: "抬高阅读难度",
      detail: "听力底盘已经足够，下一步应该用更高层材料放大阅读表现。",
    };
  }
  return {
    title: "加密精听频率",
    detail: "阅读吸收不错，补上高频精听能让综合能力更有压迫感。",
  };
}

function buildCoachLead(stage, strongestSkill, weakestSkill, mission, momentum, predictedLevel) {
  const strongestLabel = ABILITY_META[strongestSkill.key]?.label || "优势维度";
  const weakestLabel = ABILITY_META[weakestSkill.key]?.label || "短板维度";
  return `我把你当前的学习状态定义为「${stage.label}」。最近 14 天你有 ${momentum.activeDays} 天保持活跃，整体节奏${momentum.label}。现在最值得放大的优势是${strongestLabel}，最需要立即回补的是${weakestLabel}。如果下一阶段围绕「${mission.title}」推进，你的展示层级有机会从现在的 ${predictedLevel} 再向上拔高。`;
}

function buildHeroSummary(stage, mission, momentum, strongestSkillLabel) {
  return `你的学习曲线已经进入「${stage.label}」，当前最有比赛冲击力的打法是以 ${strongestSkillLabel} 为亮点，围绕 ${mission.title} 做一次明显的阶段性拉升。`;
}

function buildHeroMetrics(stats, predictedLevel, momentum, completionRate) {
  return [
    {
      label: "总学习时长",
      value: formatHours(stats?.total_study_minutes),
      detail: `${stats?.total_study_minutes || 0} 分钟累积`,
    },
    {
      label: "连续打卡",
      value: `${stats?.streak_days || 0}天`,
      detail: momentum.label,
    },
    {
      label: "任务闭环",
      value: `${completionRate}%`,
      detail: `听力 ${formatPercent(stats?.lesson_completion_rate)} · 阅读 ${formatPercent(stats?.reading_completion_rate)}`,
    },
    {
      label: "能力段位",
      value: predictedLevel,
      detail: `${stats?.vocabulary_count || 0} 词在库`,
    },
  ];
}

function buildPulseBars(activity = []) {
  const window = getRecentWindow(activity, 28, 0);
  const maxMinutes = Math.max(...window.map((item) => Number(item.minutes) || 0), 1);
  return window.map((item, index) => ({
    ...item,
    index,
    intensity: clamp((Number(item.minutes) || 0) / maxMinutes, 0.05, 1),
    hotspot: (Number(item.minutes) || 0) >= maxMinutes * 0.75,
  }));
}

function buildCefrItems(levels = {}) {
  const total = CEFR_LEVELS.reduce((sum, level) => sum + (Number(levels[level]) || 0), 0);
  const peakLevel = CEFR_LEVELS.reduce(
    (best, level) => ((levels[level] || 0) > (levels[best] || 0) ? level : best),
    "A1",
  );

  return {
    total,
    peakLevel,
    items: CEFR_LEVELS.map((level, index) => {
      const count = Number(levels[level]) || 0;
      const share = total > 0 ? round((count / total) * 100) : 0;
      return {
        level,
        count,
        share,
        unlocked: count > 0,
        target: index > 1 && count < 40,
      };
    }),
  };
}

export function deriveBattleReport(stats) {
  const safeStats = stats || {};
  const momentum = getMomentum(safeStats.daily_activity, safeStats.streak_days);
  const stage = getStage(safeStats.total_study_minutes, safeStats.streak_days, momentum.score);
  const overallScore = getAverageSkill(safeStats.skill_scores);
  const { strongest, weakest, ranked } = pickSkillExtremes(safeStats.skill_scores);
  const strongestSkillLabel = ABILITY_META[strongest.key]?.label || "优势能力";
  const weakestSkillLabel = ABILITY_META[weakest.key]?.label || "短板能力";
  const predictedLevel = predictCefr(safeStats, overallScore);
  const mission = getMission(safeStats, weakest.key, predictedLevel);
  const focusMix = getFocusMix(safeStats);
  const completionRate = round((((Number(safeStats.lesson_completion_rate) || 0) + (Number(safeStats.reading_completion_rate) || 0)) / 2) * 100);
  const cefr = buildCefrItems(safeStats.vocabulary_by_level || {});

  return {
    overallScore,
    stage,
    momentum,
    predictedLevel,
    mission,
    focusMix,
    strongestSkillLabel,
    weakestSkillLabel,
    heroSummary: buildHeroSummary(stage, mission, momentum, strongestSkillLabel),
    heroMetrics: buildHeroMetrics(safeStats, predictedLevel, momentum, completionRate),
    coachLead: buildCoachLead(stage, strongest, weakest, mission, momentum, predictedLevel),
    coachSections: [
      {
        label: "阶段判断",
        value: stage.label,
        description: stage.description,
      },
      {
        label: "当前优势",
        value: strongestSkillLabel,
        description: ABILITY_META[strongest.key]?.strong || "",
      },
      {
        label: "最大短板",
        value: weakestSkillLabel,
        description: ABILITY_META[weakest.key]?.weak || "",
      },
      {
        label: "下一步策略",
        value: mission.title,
        description: mission.detail,
      },
      {
        label: "CEFR 预测",
        value: predictedLevel,
        description: `综合得分 ${overallScore}，词汇层峰值在 ${cefr.peakLevel}。`,
      },
    ],
    signals: [
      {
        label: "学习势能",
        value: `${momentum.score}/100`,
        caption: `近 14 天 ${momentum.activeDays} 天活跃，${momentum.label}`,
      },
      {
        label: "能力总评",
        value: `${overallScore} 分`,
        caption: `最强 ${strongestSkillLabel} · 待补 ${weakestSkillLabel}`,
      },
      {
        label: "学习重心",
        value: focusMix.label,
        caption: focusMix.detail,
      },
      {
        label: "突破任务",
        value: mission.title,
        caption: mission.detail,
      },
    ],
    pulseBars: buildPulseBars(safeStats.daily_activity),
    capabilityItems: ranked.map((item, index) => ({
      key: item.key,
      label: ABILITY_META[item.key]?.label || item.key,
      score: item.value,
      rank: index + 1,
      summary: item.value >= 70 ? ABILITY_META[item.key]?.strong : ABILITY_META[item.key]?.weak,
    })),
    cefr,
  };
}
