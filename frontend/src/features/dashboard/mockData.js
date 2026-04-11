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
  "你的学习输入已经接近高质量 i+1 区间，但输入向输出的转化仍是当前最明显的缺口。",
  "现在最有说服力的不是总时长，而是你已经形成了稳定输入，并且材料难度基本落在可理解输入区间。",
  "这组数据说明你不是在被动刷内容，而是在逐步把输入校准到“可理解但有挑战”的有效习得范围。",
];

export const MOCK_COACH_TEXT = MOCK_COACH_VARIANTS[0];
