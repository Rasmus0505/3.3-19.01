import { BookOpen, HelpCircle, MousePointer, MessageSquare } from "lucide-react";

export const SCENE_TYPE_ICONS = {
  dictation: BookOpen,
  quiz: HelpCircle,
  interactive: MousePointer,
  discussion: MessageSquare,
};

export const SCENE_TYPE_LABELS = {
  dictation: "听写练习",
  quiz: "知识测验",
  interactive: "互动活动",
  discussion: "AI课堂",
};

export const SCENE_TYPE_EMOJI = {
  dictation: "🎧",
  quiz: "📝",
  interactive: "🎮",
  discussion: "💬",
};

export const SCENE_TYPE_COLORS = {
  dictation: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  quiz: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  interactive: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  discussion: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
};

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

export const CEFR_DESCRIPTIONS = {
  A1: "Beginner",
  A2: "Elementary",
  B1: "Intermediate",
  B2: "Upper Intermediate",
  C1: "Advanced",
  C2: "Proficiency",
};
