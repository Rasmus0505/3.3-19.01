import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "../../../lib/utils";
import { GraduationCap, User, Bot } from "lucide-react";

// Waveform bars shown while the active speech action is playing
function WaveformBars() {
  return (
    <span className="rc-waveform" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="rc-waveform__bar" style={{ animationDelay: `${i * 0.1}s` }} />
      ))}
    </span>
  );
}

// Role → visual config
const ROLE_CONFIG = {
  teacher: {
    icon: GraduationCap,
    bubbleClass: "rc-bubble--teacher",
    rowClass: "rc-row--left",
  },
  assistant: {
    icon: Bot,
    bubbleClass: "rc-bubble--assistant",
    rowClass: "rc-row--left",
  },
  student: {
    icon: User,
    bubbleClass: "rc-bubble--student",
    rowClass: "rc-row--right",
  },
  user: {
    icon: User,
    bubbleClass: "rc-bubble--user",
    rowClass: "rc-row--right",
  },
};

function getConfig(role) {
  return ROLE_CONFIG[String(role || "").toLowerCase()] || ROLE_CONFIG.teacher;
}

// Resolve display name from message, then cast, then role label defaults
function getDisplayName(message, cast) {
  if (message.name) return message.name;
  const role = String(message.role || "teacher").toLowerCase();
  if (role === "teacher") return cast?.teacher?.name || "Teacher";
  if (role === "assistant") return cast?.assistant?.name || "Assistant";
  if (role === "user") return "You";
  // Student — try to match by index or name in cast.students
  const students = Array.isArray(cast?.students) ? cast.students : [];
  if (students.length > 0) return students[0].name;
  return "Student";
}

export function Roundtable({ messages = [], activeSpeechActionId = null, cast = null }) {
  const bottomRef = useRef(null);

  // Auto-scroll to newest message
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="rc-roundtable rc-roundtable--empty">
        <p>Press play — the classroom conversation will appear here.</p>
      </div>
    );
  }

  return (
    <div className="rc-roundtable">
      <AnimatePresence initial={false}>
        {messages.map((message, index) => {
          const config = getConfig(message.role);
          const Icon = config.icon;
          const isActive = message.id === activeSpeechActionId;
          const displayName = getDisplayName(message, cast);

          return (
            <motion.div
              key={message.id || `${message.role}-${index}`}
              className={cn("rc-row", config.rowClass)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: [0.21, 1, 0.36, 1] }}
            >
              <div className="rc-avatar">
                <Icon className="size-4" />
                {isActive && <span className="rc-avatar__dot" />}
              </div>
              <div className={cn("rc-bubble", config.bubbleClass, isActive && "rc-bubble--speaking")}>
                <span className="rc-bubble__name">
                  {displayName}
                  {isActive && <WaveformBars />}
                </span>
                <p className="rc-bubble__text">{message.content}</p>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
      <div ref={bottomRef} />
    </div>
  );
}
