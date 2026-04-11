/**
 * DiscussionBubble — A single Teacher or Student chat bubble.
 */
import { cn } from "../../../lib/utils";
import { GraduationCap, User } from "lucide-react";

const ROLE_CONFIG = {
  teacher: {
    label: "Teacher",
    icon: GraduationCap,
    bubbleClass: "bg-blue-50 dark:bg-blue-950/60 border-blue-200/60 dark:border-blue-800/60 text-foreground rounded-bl-sm",
    avatarClass: "bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300",
    align: "items-start",
  },
  student: {
    label: "Student",
    icon: User,
    bubbleClass: "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200/60 dark:border-emerald-800/60 text-foreground rounded-br-sm",
    avatarClass: "bg-emerald-100 dark:bg-emerald-900 text-emerald-600 dark:text-emerald-300",
    align: "items-end",
  },
};

export function DiscussionBubble({ role, content, isActive, index = 0 }) {
  const config = ROLE_CONFIG[role] || ROLE_CONFIG.student;
  const Icon = config.icon;
  const isTeacher = role === "teacher";

  return (
    <div
      className={cn("flex gap-3 max-w-[85%] discussion-bubble-enter", isTeacher ? "self-start" : "self-end flex-row-reverse")}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Avatar — floats at bubble edge */}
      <div className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm border-2 border-background",
        config.avatarClass,
      )}>
        <Icon className="w-4 h-4" />
      </div>

      {/* Bubble with backdrop blur */}
      <div className={cn(
        "relative px-4 py-2.5 rounded-2xl border text-sm leading-relaxed transition-all backdrop-blur-sm",
        config.bubbleClass,
        isActive && "discussion-bubble--active ring-2 ring-primary/30",
      )}>
        <span className="text-[10px] font-semibold text-muted-foreground block mb-0.5">
          {config.label}
        </span>
        <p className="whitespace-pre-wrap">{content}</p>
      </div>
    </div>
  );
}
