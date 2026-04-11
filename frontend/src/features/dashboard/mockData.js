/**
 * Mock dashboard data for demo / preview mode.
 */

function generateDailyActivity() {
  const days = [];
  const today = new Date();
  for (let i = 89; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayOfWeek = d.getDay();
    // Weekdays more active, weekends lighter
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
    const base = isWeekday ? 25 : 10;
    const variance = isWeekday ? 50 : 25;
    // Some days off
    const skip = Math.random() < 0.15;
    const minutes = skip ? 0 : Math.round(base + Math.random() * variance);
    const lessons = minutes > 30 ? Math.ceil(Math.random() * 3) : minutes > 0 ? 1 : 0;
    const readings = minutes > 20 ? Math.ceil(Math.random() * 2) : 0;
    days.push({ date: dateStr, minutes, lessons, readings });
  }
  return days;
}

export const MOCK_STATS = {
  total_lessons: 47,
  total_reading_packs: 23,
  total_study_minutes: 1860,
  streak_days: 14,
  vocabulary_count: 682,
  avg_soe_score: 78.5,
  lesson_completion_rate: 0.72,
  reading_completion_rate: 0.65,
  vocabulary_by_level: {
    A1: 185,
    A2: 210,
    B1: 168,
    B2: 89,
    C1: 30,
  },
  daily_activity: generateDailyActivity(),
  skill_scores: {
    listening: 76,
    reading: 82,
    vocabulary: 71,
    grammar: 58,
    speaking: 69,
  },
};

export const MOCK_COACH_TEXT = `📊 学习概况分析

你已经累计学习了 47 节听力课程和 23 篇阅读材料，总学习时长超过 31 小时，非常不错！连续打卡 14 天，说明你的学习习惯正在稳步形成。

💪 优势领域
• 阅读能力（82 分）是你的最强项，继续保持！
• 听力（76 分）也在稳步提升，建议增加精听练习
• 词汇量 682 个，B1 以上占比 42%，词汇深度不错

⚡ 重点突破
• 语法（58 分）是目前的短板，建议每天花 10 分钟做语法专项
• 口语均分 78.5，流利度有提升空间，多做跟读练习
• 建议把 B2 词汇（89 个）作为下一阶段重点突破目标

🎯 下周建议
1. 每天至少完成 1 节精听 + 1 篇泛读
2. 周末安排 2 次跟读打分练习
3. 尝试用新学的 B1/B2 词汇写 3-5 个句子

Keep going! 你的进步有目共睹 🚀`;
