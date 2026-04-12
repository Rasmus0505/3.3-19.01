/**
 * Roundtable — the bottom stage bar, modelled after OpenMAIC's 192px roundtable.
 * Layout: [Teacher 90px] | [Speech bubble flex-1] | [Students 140px]
 */
import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "../../../lib/utils";

// ─── Breathing bars (shown while a participant is speaking) ───────────────────

function BreathingBars({ color = "#7c3aed" }) {
  return (
    <div className="rt-bars" aria-hidden="true">
      {[
        { dur: 0.6, delay: 0 },
        { dur: 0.4, delay: 0.1 },
        { dur: 0.5, delay: 0.05 },
      ].map(({ dur, delay }, i) => (
        <motion.div
          key={i}
          className="rt-bars__bar"
          style={{ background: color }}
          animate={{ height: ["20%", "100%", "20%"] }}
          transition={{ repeat: Infinity, duration: dur, delay, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

// ─── Role configuration ───────────────────────────────────────────────────────

const ROLE_CFG = {
  teacher:   { avatar: "/avatars/teacher.png",  accent: "#7c3aed", side: "left"  },
  assistant: { avatar: "/avatars/assist.png",   accent: "#7c3aed", side: "left"  },
  student:   { avatar: "/avatars/curious.png",  accent: "#2563eb", side: "right" },
  user:      { avatar: "/avatars/user.png",     accent: "#059669", side: "right" },
};

function resolvePublicAssetUrl(path) {
  const base =
    typeof import.meta !== "undefined" && import.meta.env && import.meta.env.BASE_URL
      ? String(import.meta.env.BASE_URL)
      : "/";
  return `${base.replace(/\/?$/, "/")}${String(path || "").replace(/^\/+/, "")}`;
}

function cfg(role) {
  const config = ROLE_CFG[String(role || "").toLowerCase()] || ROLE_CFG.teacher;
  return {
    ...config,
    avatar: resolvePublicAssetUrl(config.avatar),
  };
}

function getDisplayName(msg, cast) {
  if (msg.name) return msg.name;
  const r = String(msg.role || "teacher").toLowerCase();
  if (r === "teacher")   return cast?.teacher?.name   || "Coach Mira";
  if (r === "assistant") return cast?.assistant?.name || "Assistant";
  if (r === "user")      return "You";
  return Array.isArray(cast?.students) && cast.students[0]?.name || "Lily";
}

// ─── Teacher column (left, 90px) ─────────────────────────────────────────────

function TeacherColumn({ cast, activeSpeaker, messages }) {
  const isActive = activeSpeaker === "teacher" || activeSpeaker === "assistant";
  const name = cast?.teacher?.name || "Coach Mira";
  // Show latest teacher message as subtitle
  const latestTeacher = [...messages].reverse().find(
    (m) => m.role === "teacher" || m.role === "assistant"
  );

  return (
    <div className="rt-teacher">
      <div className={cn("rt-teacher__avatar-wrap", isActive && "rt-teacher__avatar-wrap--active")}>
        <img src={resolvePublicAssetUrl("/avatars/teacher.png")} alt={name} className="rt-teacher__avatar" />
        {isActive && <span className="rt-teacher__dot" />}
      </div>
      <span className="rt-teacher__name">{name}</span>
    </div>
  );
}

// ─── Speech bubble (center) ───────────────────────────────────────────────────

function SpeechBubble({ message, isActive }) {
  if (!message) return (
    <div className="rt-bubble rt-bubble--idle">
      <p className="rt-bubble__idle-text">Press play to begin the lesson…</p>
    </div>
  );

  const c = cfg(message.role);
  const isTeacher = message.role === "teacher" || message.role === "assistant";

  return (
    <motion.div
      key={message.id}
      className={cn("rt-bubble", isTeacher ? "rt-bubble--teacher" : "rt-bubble--student")}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.21, 1, 0.36, 1] }}
    >
      {/* Small avatar badge on bubble */}
      <div
        className="rt-bubble__avatar"
        style={{ borderColor: c.accent }}
      >
        <img src={c.avatar} alt={message.role} />
      </div>

      <div className="rt-bubble__body">
        <div className="rt-bubble__name-row">
          <span className="rt-bubble__name" style={{ color: c.accent }}>
            {message.name || message.role}
          </span>
          {isActive && <BreathingBars color={c.accent} />}
        </div>
        <p className="rt-bubble__text">{message.content}</p>
      </div>
    </motion.div>
  );
}

// ─── Students column (right, 140px) ──────────────────────────────────────────

function StudentsColumn({ messages, activeSpeakerId, cast }) {
  const students = [
    {
      id: "student-lily",
      name: Array.isArray(cast?.students) ? cast.students[0]?.name || "Lily" : "Lily",
      avatar: resolvePublicAssetUrl("/avatars/curious.png"),
    },
    {
      id: "student-max",
      name: Array.isArray(cast?.students) ? cast.students[1]?.name || "Max" : "Max",
      avatar: resolvePublicAssetUrl("/avatars/thinker.png"),
    },
  ];

  // Last student message
  const latestStudent = [...messages].reverse().find(
    (m) => m.role === "student"
  );

  return (
    <div className="rt-students">
      {/* Student avatars row */}
      <div className="rt-students__row">
        {students.map((s) => {
          const isActive = latestStudent?.role === "student" && activeSpeakerId && s.id === "student";
          return (
            <div
              key={s.id}
              className={cn("rt-students__avatar-wrap", isActive && "rt-students__avatar-wrap--active")}
              title={s.name}
            >
              <img src={s.avatar} alt={s.name} className="rt-students__avatar" />
              {isActive && <span className="rt-students__dot" />}
            </div>
          );
        })}
      </div>

      {/* Latest student speech */}
      {latestStudent && (
        <p className="rt-students__latest">{latestStudent.content}</p>
      )}

      {/* User avatar (bottom) */}
      <div className="rt-students__user-wrap">
        <img src={resolvePublicAssetUrl("/avatars/user.png")} alt="You" className="rt-students__user-avatar" />
        <span className="rt-students__user-label">You</span>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function Roundtable({ messages = [], activeSpeechActionId = null, cast = null }) {
  // Determine who is currently speaking based on activeSpeechActionId
  const activeMsg = activeSpeechActionId
    ? messages.find((m) => m.id === activeSpeechActionId)
    : null;
  const activeSpeaker = activeMsg?.role || null;

  // The bubble shows the most recent message overall
  const latestMessage = messages.length > 0
    ? { ...messages[messages.length - 1], name: getDisplayName(messages[messages.length - 1], cast) }
    : null;

  const isLatestActive = latestMessage && latestMessage.id === activeSpeechActionId;

  return (
    <div className="rt-stage">
      <TeacherColumn cast={cast} activeSpeaker={activeSpeaker} messages={messages} />

      <div className="rt-center">
        <AnimatePresence mode="wait">
          {latestMessage && (
            <SpeechBubble
              key={latestMessage.id}
              message={latestMessage}
              isActive={isLatestActive}
            />
          )}
          {!latestMessage && (
            <div key="idle" className="rt-bubble rt-bubble--idle">
              <p className="rt-bubble__idle-text">Press play to begin the lesson…</p>
            </div>
          )}
        </AnimatePresence>

        {/* Scrollable message history (older messages, compact) */}
        {messages.length > 1 && (
          <div className="rt-history">
            {messages.slice(0, -1).map((m, i) => (
              <span key={m.id || i} className="rt-history__item">
                <b>{getDisplayName(m, cast)}:</b> {m.content}
              </span>
            ))}
          </div>
        )}
      </div>

      <StudentsColumn messages={messages} activeSpeakerId={activeSpeechActionId} cast={cast} />
    </div>
  );
}
