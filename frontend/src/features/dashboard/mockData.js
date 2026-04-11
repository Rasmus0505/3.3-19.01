/**
 * Curated demo data for the showcase dashboard.
 * The dataset is deterministic so screenshots remain stable.
 */

const WEEK_PATTERN = [0, 34, 48, 56, 42, 64, 26];
const SPRINT_WINDOWS = new Set([9, 10, 11, 22, 23, 24, 36, 37, 48, 49, 50, 63, 64, 65, 77, 78, 79]);

function generateDailyActivity() {
  const days = [];
  const today = new Date();

  for (let i = 89; i >= 0; i -= 1) {
    const current = new Date(today);
    current.setDate(current.getDate() - i);
    const dateStr = current.toISOString().slice(0, 10);
    const weekday = current.getDay();
    const normalizedWeekday = weekday === 0 ? 6 : weekday - 1;
    const patternValue = WEEK_PATTERN[(89 - i) % WEEK_PATTERN.length];
    const sprintBoost = SPRINT_WINDOWS.has(89 - i) ? 24 : 0;
    const recencyBoost = i < 18 ? 12 : i < 36 ? 6 : 0;
    const restDay = patternValue === 0 && !SPRINT_WINDOWS.has(89 - i);
    const minutes = restDay ? 0 : patternValue + sprintBoost + recencyBoost + (normalizedWeekday === 5 ? 8 : 0);
    const lessons = minutes >= 70 ? 2 : minutes >= 38 ? 1 : 0;
    const readings = minutes >= 52 ? 1 : minutes >= 28 && normalizedWeekday >= 2 ? 1 : 0;

    days.push({
      date: dateStr,
      minutes,
      lessons,
      readings,
    });
  }

  return days;
}

export const MOCK_STATS = {
  total_lessons: 58,
  total_reading_packs: 31,
  total_study_minutes: 2485,
  streak_days: 18,
  vocabulary_count: 936,
  avg_soe_score: 83.2,
  lesson_completion_rate: 0.84,
  reading_completion_rate: 0.71,
  vocabulary_by_level: {
    A1: 186,
    A2: 274,
    B1: 251,
    B2: 171,
    C1: 54,
  },
  daily_activity: generateDailyActivity(),
  skill_scores: {
    listening: 88,
    reading: 81,
    vocabulary: 76,
    grammar: 64,
    speaking: 72,
  },
};

export const MOCK_COACH_VARIANTS = [
  "我把你最近这一段学习状态定义为“高势能推进期”。连续 18 天没有掉线，说明你已经从偶尔学习，切换到了有节奏地经营自己的能力曲线。现在最值得在比赛里放大的亮点是听力输入和整体完成密度，它们会让评委第一眼就感受到你的训练强度。下一步不要再平均发力，建议把突破口集中在 B2 词汇层和语法结构稳定性上，用更高一级的材料把曲线抬起来。",
  "这组数据最打动人的地方，不是单个指标高，而是“连续性 + 完成度 + 层级词汇”已经开始形成合力。你的听力和阅读都具备不错的底盘，但真正能把页面拉开差距的，是把这些输入成果转成更清晰的输出能力信号。我的建议是保留现在的高频学习节奏，同时增加一条明确主线，例如每周固定做一次高质量口语打分复盘，让展示从‘学了很多’升级成‘已经有突破结果’。",
  "如果把这页当成比赛战报，你现在最强的一点是成长曲线非常清楚。近阶段活跃密度高，词汇层级也不再停留在基础档，这会比传统的“总时长”更有说服力。接下来不要继续堆普通统计，而是要把目标收窄到一件能明显提升观感的事上: 用更难的阅读与精听材料，换来更高一档的能力标签，让评委看到你不是在使用工具，而是在被系统性地训练。 ",
];

export const MOCK_COACH_TEXT = MOCK_COACH_VARIANTS[0];
