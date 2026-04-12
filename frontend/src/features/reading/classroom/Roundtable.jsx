/**
 * Roundtable — bottom stage bar, OpenMAIC style.
 * Three-column: [Teacher 90px] | [Speech bubble flex-1] | [Students 80px]
 *
 * Props:
 *   messages          — array of {id, role, content, name, avatarKey?}
 *   activeSpeechActionId — id of currently speaking message
 *   isPaused          — if true, waveform bars stop → show Play icon
 *   cast              — { teacher: {name}, students: [{name}] }
 */
import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Play } from "lucide-react";
import { cn } from "../../../lib/utils";

// ─── Breathing bars / paused indicator ───────────────────────────────────────

function BreathingBars({ color = "#7c3aed", isPaused = false }) {
  if (isPaused) {
    return (
      <Play
        className="rt-bars__paused-icon"
        style={{ color }}
        aria-hidden="true"
      />
    );
  }
  return (
    <div className="rt-bars" aria-hidden="true">
      <div className="rt-bars__bar rt-bars__bar--1" style={{ background: color }} />
      <div className="rt-bars__bar rt-bars__bar--2" style={{ background: color }} />
      <div className="rt-bars__bar rt-bars__bar--3" style={{ background: color }} />
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolvePublicAssetUrl(path) {
  const base =
    typeof import.meta !== "undefined" && import.meta.env?.BASE_URL
      ? String(import.meta.env.BASE_URL)
      : "/";
  return `${base.replace(/\/?$/, "/")}${String(path || "").replace(/^\/+/, "")}`;
}

const ROLE_CFG = {
  teacher:           { avatar: "/avatars/teacher.png",  accent: "#7c3aed" },
  assistant:         { avatar: "/avatars/assist.png",   accent: "#8b5cf6" },
  student:           { avatar: "/avatars/curious.png",  accent: "#2563eb" },
  "student-curious": { avatar: "/avatars/curious.png",  accent: "#2563eb" },
  "student-thinker": { avatar: "/avatars/thinker.png",  accent: "#1d4ed8" },
  user:              { avatar: "/avatars/user.png",      accent: "#059669" },
};

function normalizeAvatarKey(role, avatarKey) {
  const explicit = String(avatarKey || "").trim().toLowerCase();
  if (explicit) return explicit;
  const r = String(role || "").trim().toLowerCase();
  if (r === "assistant" || r === "user") return r;
  if (r === "student") return "student-curious";
  return "teacher";
}

function cfgFor(role, avatarKey) {
  const key = normalizeAvatarKey(role, avatarKey);
  const base = ROLE_CFG[key] || ROLE_CFG.teacher;
  return { ...base, avatar: resolvePublicAssetUrl(base.avatar) };
}

function buildStudentRoster(cast) {
  const configured = Array.isArray(cast?.students) ? cast.students : [];
  const defaults = [
    { avatarKey: "student-curious", name: "Lily", avatar: resolvePublicAssetUrl("/avatars/curious.png") },
    { avatarKey: "student-thinker", name: "Max",  avatar: resolvePublicAssetUrl("/avatars/thinker.png") },
  ];
  return defaults.map((fallback, i) => {
    const s = configured[i] || {};
    return {
      id: fallback.avatarKey,
      avatarKey: fallback.avatarKey,
      name: String(s.name || fallback.name),
      avatar: fallback.avatar,
    };
  });
}

function getDisplayName(msg, cast) {
  if (msg.name) return msg.name;
  const key = normalizeAvatarKey(msg.role, msg.avatarKey);
  if (key === "teacher")   return cast?.teacher?.name || "Coach Mira";
  if (key === "assistant") return cast?.assistant?.name || "Assistant";
  if (key === "user")      return "You";
  const s = buildStudentRoster(cast).find((x) => x.avatarKey === key);
  return s?.name || "Student";
}

// ─── Teacher column (90px, left) ─────────────────────────────────────────────

function TeacherColumn({ cast, isTeacherActive, isPaused }) {
  const name = cast?.teacher?.name || "Coach Mira";
  return (
    <div className="rt-teacher">
      <div className={cn("rt-teacher__avatar-wrap", isTeacherActive && "rt-teacher__avatar-wrap--active")}>
        <img
          src={resolvePublicAssetUrl("/avatars/teacher.png")}
          alt={name}
          className="rt-teacher__avatar"
        />
        {isTeacherActive && !isPaused && <span className="rt-teacher__dot" />}
      </div>
      <span className="rt-teacher__name">{name}</span>
    </div>
  );
}

// ─── Speech bubble (center, flex-1) ──────────────────────────────────────────

function SpeechBubble({ message, isActive, isPaused, cast }) {
  const c = cfgFor(message?.role, message?.avatarKey);
  const isTeacher = !message || message.role === "teacher" || message.role === "assistant";
  const name = message ? getDisplayName(message, cast) : null;

  if (!message) {
    return (
      <div className="rt-bubble rt-bubble--idle">
        <p className="rt-bubble__idle-text">准备好了就按播放…</p>
      </div>
    );
  }

  return (
    <motion.div
      key={message.id}
      className={cn("rt-bubble", isTeacher ? "rt-bubble--teacher" : "rt-bubble--student")}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.21, 1, 0.36, 1] }}
    >
      <div className="rt-bubble__avatar" style={{ borderColor: c.accent }}>
        <img src={c.avatar} alt={message.role} />
      </div>
      <div className="rt-bubble__body">
        <div className="rt-bubble__name-row">
          <span className="rt-bubble__name" style={{ color: c.accent }}>
            {name?.toUpperCase()}
          </span>
          {isActive && <BreathingBars color={c.accent} isPaused={isPaused} />}
        </div>
        <p className="rt-bubble__text">{message.content}</p>
      </div>
    </motion.div>
  );
}

// ─── Students column (80px, right) ───────────────────────────────────────────

function StudentsColumn({ messages, activeSpeechActionId, cast }) {
  const students = buildStudentRoster(cast);
  const activeMsg = activeSpeechActionId
    ? messages.find((m) => m.id === activeSpeechActionId)
    : null;
  const activeKey = normalizeAvatarKey(activeMsg?.role, activeMsg?.avatarKey);

  return (
    <div className="rt-students">
      {/* Student avatars — vertical stack */}
      <div className="rt-students__list">
        {students.map((s) => {
          const isActive = activeKey === s.avatarKey;
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

      {/* Spacer */}
      <div className="rt-students__spacer" />

      {/* User avatar — bottom */}
      <div className="rt-students__user-wrap" title="You">
        <img
          src={resolvePublicAssetUrl("/avatars/user.png")}
          alt="You"
          className="rt-students__user-avatar"
        />
        <span className="rt-students__user-label">YOU</span>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function Roundtable({
  messages = [],
  activeSpeechActionId = null,
  isPaused = false,
  cast = null,
}) {
  const activeMsg = activeSpeechActionId
    ? messages.find((m) => m.id === activeSpeechActionId)
    : null;
  const isTeacherActive =
    activeMsg?.role === "teacher" || activeMsg?.role === "assistant";

  const latestMessage = messages.length > 0
    ? { ...messages[messages.length - 1], name: getDisplayName(messages[messages.length - 1], cast) }
    : null;
  const isLatestActive = latestMessage?.id === activeSpeechActionId;

  return (
    <div className="rt-stage">
      <TeacherColumn cast={cast} isTeacherActive={isTeacherActive} isPaused={isPaused} />

      <div className="rt-center">
        <AnimatePresence mode="wait">
          {latestMessage ? (
            <SpeechBubble
              key={latestMessage.id}
              message={latestMessage}
              isActive={isLatestActive}
              isPaused={isPaused}
              cast={cast}
            />
          ) : (
            <SpeechBubble key="idle" message={null} isActive={false} isPaused={false} cast={cast} />
          )}
        </AnimatePresence>

        {/* Compact history */}
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

      <StudentsColumn
        messages={messages}
        activeSpeechActionId={activeSpeechActionId}
        cast={cast}
      />
    </div>
  );
}
