import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "../../../lib/utils";

// Avatar image paths (copied from OpenMAIC public/avatars/)
const AVATAR_IMAGES = {
  teacher:   "/avatars/teacher.png",
  assistant: "/avatars/assist.png",
  student:   "/avatars/curious.png",
  user:      "/avatars/user.png",
};

// Waveform bars shown while this bubble is speaking
function WaveformBars({ color = "var(--primary)" }) {
  return (
    <span className="rc-waveform" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="rc-waveform__bar"
          style={{ animationDelay: `${i * 0.11}s`, background: color }}
        />
      ))}
    </span>
  );
}

// Role → visual config
const ROLE_CONFIG = {
  teacher: {
    bubbleClass:  "rc-bubble--teacher",
    rowClass:     "rc-row--left",
    avatarBorder: "#a78bfa",
    waveColor:    "#7c3aed",
  },
  assistant: {
    bubbleClass:  "rc-bubble--assistant",
    rowClass:     "rc-row--left",
    avatarBorder: "#a78bfa",
    waveColor:    "#7c3aed",
  },
  student: {
    bubbleClass:  "rc-bubble--student",
    rowClass:     "rc-row--right",
    avatarBorder: "#60a5fa",
    waveColor:    "#2563eb",
  },
  user: {
    bubbleClass:  "rc-bubble--user",
    rowClass:     "rc-row--right",
    avatarBorder: "#34d399",
    waveColor:    "#059669",
  },
};

function getConfig(role) {
  return ROLE_CONFIG[String(role || "").toLowerCase()] || ROLE_CONFIG.teacher;
}

function getAvatarSrc(role) {
  return AVATAR_IMAGES[String(role || "").toLowerCase()] || AVATAR_IMAGES.teacher;
}

function getDisplayName(message, cast) {
  if (message.name) return message.name;
  const role = String(message.role || "teacher").toLowerCase();
  if (role === "teacher")   return cast?.teacher?.name   || "Coach Mira";
  if (role === "assistant") return cast?.assistant?.name || "Assistant";
  if (role === "user")      return "You";
  const students = Array.isArray(cast?.students) ? cast.students : [];
  return students[0]?.name || "Lily";
}

export function Roundtable({ messages = [], activeSpeechActionId = null, cast = null }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="rc-roundtable rc-roundtable--empty">
        <img src="/avatars/teacher.png" alt="Teacher" className="rc-roundtable__empty-avatar" />
        <p>Press play — the lesson will begin shortly.</p>
      </div>
    );
  }

  return (
    <div className="rc-roundtable">
      <AnimatePresence initial={false}>
        {messages.map((message, index) => {
          const config  = getConfig(message.role);
          const isActive = message.id === activeSpeechActionId;
          const name    = getDisplayName(message, cast);
          const avatarSrc = getAvatarSrc(message.role);

          return (
            <motion.div
              key={message.id || `${message.role}-${index}`}
              className={cn("rc-row", config.rowClass)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: [0.21, 1, 0.36, 1] }}
            >
              {/* Avatar */}
              <div
                className="rc-avatar"
                style={{ borderColor: isActive ? config.avatarBorder : "transparent" }}
              >
                <img src={avatarSrc} alt={name} className="rc-avatar__img" />
                {isActive && <span className="rc-avatar__dot" />}
              </div>

              {/* Bubble */}
              <div className={cn("rc-bubble", config.bubbleClass, isActive && "rc-bubble--speaking")}>
                <span className="rc-bubble__name">
                  {name}
                  {isActive && <WaveformBars color={config.waveColor} />}
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
