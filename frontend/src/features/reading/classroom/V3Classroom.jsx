/**
 * V3Classroom — main controller for schema_version: 3 courses.
 *
 * Each section walks through four phases:
 *   read → explain → quiz → discuss
 *
 * Phase "read":   ReadingSection (silent, user reads)
 * Phase "explain": ExplainSection (spotlight + TTS)
 * Phase "quiz":   QuizSection
 * Phase "discuss": DiscussSection
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
// Volume controls moved to PlaybackToolbar
import { Button } from "../../../shared/ui";
import { cn } from "../../../lib/utils";
import { saveReadingCourseToRecord } from "../readingRewriteDB";
import { SectionProgress } from "./SectionProgress";
import { PlaybackToolbar } from "./PlaybackToolbar";
import { Roundtable } from "./Roundtable";
import { ReadingSection } from "./sections/ReadingSection";
import { ExplainSection } from "./sections/ExplainSection";

const PLAYBACK_SPEEDS = [1, 1.25, 1.5, 2];

const PHASES = ["read", "explain", "quiz", "discuss"];

function resolvePublicUrl(path) {
  const base =
    typeof import.meta !== "undefined" && import.meta.env?.BASE_URL
      ? String(import.meta.env.BASE_URL)
      : "/";
  return `${base.replace(/\/?$/, "/")}${String(path || "").replace(/^\/+/, "")}`;
}

// ── Minimal Roundtable wrapper (56px) for read/quiz phases ───────────────────

function MiniRoundtable({ teacherName, hint }) {
  return (
    <div className="v3-mini-rt">
      <img
        src={resolvePublicUrl("/avatars/teacher.png")}
        alt={teacherName}
        className="v3-mini-rt__avatar"
      />
      <span className="v3-mini-rt__hint">{hint}</span>
    </div>
  );
}

// ── QuizSection (inline for Phase 1 scope) ───────────────────────────────────

function QuizSection({ section, onComplete, onSkip }) {
  const questions = section?.quiz || [];
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);

  const score = useMemo(() => {
    if (!submitted) return null;
    const correct = questions.filter((q, i) => {
      const answer = answers[i];
      return answer === (q.answer || q.correct_answer);
    }).length;
    return Math.round((correct / Math.max(questions.length, 1)) * 100);
  }, [submitted, answers, questions]);

  if (questions.length === 0) {
    return (
      <div className="v3-quiz v3-quiz--empty">
        <p>本节暂无题目</p>
        <Button onClick={onComplete}>继续</Button>
      </div>
    );
  }

  return (
    <div className="v3-quiz">
      {questions.map((q, qi) => (
        <div key={qi} className="v3-quiz__question">
          <p className="v3-quiz__q-text">
            <span className="v3-quiz__q-num">Q{qi + 1}</span>
            {q.question}
          </p>
          <div className="v3-quiz__options">
            {(q.options || []).map((opt) => {
              const val = typeof opt === "object" ? opt.value : opt;
              const label = typeof opt === "object" ? opt.label : opt;
              const selected = answers[qi] === val;
              const isCorrect = submitted && val === (q.answer || q.correct_answer);
              const isWrong = submitted && selected && !isCorrect;
              return (
                <button
                  key={val}
                  type="button"
                  disabled={submitted}
                  className={cn(
                    "v3-quiz__option",
                    selected && "v3-quiz__option--selected",
                    isCorrect && "v3-quiz__option--correct",
                    isWrong && "v3-quiz__option--wrong",
                  )}
                  onClick={() => !submitted && setAnswers((a) => ({ ...a, [qi]: val }))}
                >
                  <span className="v3-quiz__option-key">{val}</span>
                  {label}
                </button>
              );
            })}
          </div>
          {submitted && q.analysis && (
            <p className="v3-quiz__analysis">{q.analysis}</p>
          )}
        </div>
      ))}

      <div className="v3-quiz__footer">
        {!submitted ? (
          <>
            <Button
              onClick={() => setSubmitted(true)}
              disabled={Object.keys(answers).length < questions.length}
            >
              提交
            </Button>
            <Button variant="ghost" onClick={onSkip}>跳过</Button>
          </>
        ) : (
          <>
            <span className="v3-quiz__score">得分 {score}%</span>
            <Button onClick={onComplete}>继续</Button>
          </>
        )}
      </div>
    </div>
  );
}

// ── DiscussSection (inline for Phase 1 scope) ─────────────────────────────────

// DiscussSection renders only the compose bar — messages go into shared Roundtable via onMessage
function DiscussSection({ section, course, apiCall, onMessage, onComplete, onSkip, loading: parentLoading }) {
  const [draft, setDraft] = useState("");

  const send = () => onMessage?.(draft);

  return (
    <div className="v3-discuss-compose-only">
      <p className="v3-discuss__hint">有问题尽管问，或者跳过继续下一节</p>
      <div className="v3-discuss__compose">
        <textarea
          className="v3-discuss__input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="问老师任何问题… (Ctrl+Enter 发送)"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              if (draft.trim() && !parentLoading) { send(); setDraft(""); }
            }
          }}
        />
        <div className="v3-discuss__actions">
          <Button
            size="sm"
            onClick={() => { send(); setDraft(""); }}
            disabled={!draft.trim() || parentLoading}
          >
            {parentLoading ? "回复中…" : "发送"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onSkip}>跳过，下一节</Button>
          <Button size="sm" variant="outline" onClick={onComplete}>结束，下一节</Button>
        </div>
      </div>
    </div>
  );
}

// ── Main V3Classroom ──────────────────────────────────────────────────────────

export function V3Classroom({ articleId, course, apiCall, onExit }) {
  const [runtime, setRuntime] = useState(() => ({
    activeSectionIndex: Number(course.runtime?.activeSectionIndex) || 0,
    activePhase: course.runtime?.activePhase || "read",
    completedSections: Array.isArray(course.runtime?.completedSections)
      ? course.runtime.completedSections
      : [],
    confusedWordsBySection: course.runtime?.confusedWordsBySection || {},
    quizResultsBySection: course.runtime?.quizResultsBySection || {},
  }));
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [isPaused, setIsPaused] = useState(false);
  const [confusedWords, setConfusedWords] = useState([]);
  const [roundtableMessages, setRoundtableMessages] = useState([]);
  const [activeSpeechId, setActiveSpeechId] = useState(null);
  const courseRef = useRef(course);
  const explainRef = useRef(null); // ref to ExplainSection imperative handle

  const sections = course.sections || [];
  const activeSection = sections[runtime.activeSectionIndex] || null;
  const teacher = course.participants?.find((p) => p.role === "teacher") || { name: "Coach Mira" };

  const persistRuntime = useCallback(
    async (nextRuntime) => {
      setRuntime(nextRuntime);
      if (articleId) {
        await saveReadingCourseToRecord(articleId, {
          ...courseRef.current,
          runtime: nextRuntime,
        });
      }
    },
    [articleId],
  );

  const advancePhase = useCallback(() => {
    const currentPhaseIndex = PHASES.indexOf(runtime.activePhase);
    const nextPhaseIndex = currentPhaseIndex + 1;

    if (nextPhaseIndex >= PHASES.length) {
      // Move to next section
      const nextSectionIndex = runtime.activeSectionIndex + 1;
      if (nextSectionIndex >= sections.length) {
        // Course complete
        persistRuntime({
          ...runtime,
          activePhase: "complete",
        });
        return;
      }
      persistRuntime({
        ...runtime,
        activeSectionIndex: nextSectionIndex,
        activePhase: "read",
        completedSections: [...runtime.completedSections, activeSection?.id].filter(Boolean),
      });
      setConfusedWords([]);
      return;
    }

    persistRuntime({
      ...runtime,
      activePhase: PHASES[nextPhaseIndex],
    });
  }, [runtime, sections.length, activeSection, persistRuntime]);

  const handlePlayPause = useCallback(() => {
    if (isPaused) {
      explainRef.current?.resume();
      setIsPaused(false);
    } else {
      explainRef.current?.pause();
      setIsPaused(true);
    }
  }, [isPaused]);

  const handleCycleSpeed = useCallback(() => {
    setSpeed((cur) => {
      const idx = PLAYBACK_SPEEDS.indexOf(cur);
      return PLAYBACK_SPEEDS[(idx + 1) % PLAYBACK_SPEEDS.length];
    });
  }, []);

  // Space bar shortcut for play/pause during explain phase
  useEffect(() => {
    if (runtime.activePhase !== "explain") return;
    const handler = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        handlePlayPause();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [runtime.activePhase, handlePlayPause]);

  const handleMarkConfused = useCallback((word) => {
    setConfusedWords((prev) => {
      if (prev.includes(word)) return prev;
      return [...prev, word];
    });
  }, []);

  const handleAddToWordbook = useCallback((word) => {
    // TODO: integrate with existing wordbook API
    console.info("[V3] Add to wordbook:", word);
  }, []);

  // Called by ExplainSection when each speech action fires
  const handleSpeechLine = useCallback((text, speaker, speechId) => {
    const cast = course?.participants || [];
    const participant = cast.find((p) => p.role === speaker || p.id === speaker);
    const role = speaker === "teacher" || speaker === "assistant" ? "teacher" : "student";
    const name = participant?.name || (role === "teacher" ? "Coach Mira" : speaker);

    setActiveSpeechId(speechId);
    setRoundtableMessages((prev) => [
      ...prev.slice(-4),
      { id: speechId, role, content: text, name },
    ]);
  }, [course?.participants]);

  // Called when TTS finishes — precisely clears the active speech indicator
  const handleSpeechEnd = useCallback((speechId) => {
    setActiveSpeechId((cur) => cur === speechId ? null : cur);
  }, []);

  // Discuss phase: send user message → AI reply → add both to Roundtable
  const [discussLoading, setDiscussLoading] = useState(false);
  const discussHistoryRef = useRef([]);

  const handleDiscussMessage = useCallback(async (text) => {
    if (!text?.trim() || !apiCall) return;
    const userMsg = text.trim();
    const teacherName = teacher?.name || "Coach Mira";

    const userId = `user-${Date.now()}`;
    setRoundtableMessages((prev) => [...prev, { id: userId, role: "user", content: userMsg, name: "You" }]);
    discussHistoryRef.current = [...discussHistoryRef.current, { role: "user", content: userMsg }];
    setDiscussLoading(true);

    try {
      const res = await apiCall("/api/llm/reading-course/discussion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course,
          scene_id: activeSection?.id || "",
          message: userMsg,
          history: discussHistoryRef.current.slice(-8),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const replyId = `reply-${Date.now()}`;
        setRoundtableMessages((prev) => [...prev, { id: replyId, role: "teacher", content: data.reply, name: teacherName }]);
        discussHistoryRef.current = [...discussHistoryRef.current, { role: "assistant", content: data.reply }];
      }
    } catch {
      // silent
    } finally {
      setDiscussLoading(false);
    }
  }, [apiCall, course, activeSection, teacher]);

  // Reset roundtable when phase changes
  const prevPhaseRef = useRef(runtime.activePhase);
  if (prevPhaseRef.current !== runtime.activePhase) {
    prevPhaseRef.current = runtime.activePhase;
    if (runtime.activePhase === "explain" || runtime.activePhase === "discuss") {
      setRoundtableMessages([]);
      setActiveSpeechId(null);
      discussHistoryRef.current = [];
    }
  }

  const isComplete = runtime.activePhase === "complete";

  // Roundtable state based on phase
  const rtState = {
    read:    "mini",
    explain: "expanded",
    quiz:    "mini",
    discuss: "full",
  }[runtime.activePhase] || "mini";

  return (
    <div className="v3-shell">
      {/* Header */}
      <header className="v3-header">
        <SectionProgress
          sectionIndex={runtime.activeSectionIndex}
          totalSections={sections.length}
          phase={runtime.activePhase}
        />
        <div className="v3-header__actions">
          <button type="button" className="v3-header__exit-btn" onClick={onExit}>
            <ArrowLeft className="size-4" />
            <span>返回</span>
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="v3-main">
        <AnimatePresence mode="wait">
          {isComplete ? (
            <motion.div
              key="complete"
              className="v3-complete"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <img src={resolvePublicUrl("/avatars/teacher.png")} alt="teacher" className="v3-complete__avatar" />
              <h2>课程完成！</h2>
              <p>你已经完成了这篇文章的全部 {sections.length} 个章节。</p>
              <Button onClick={onExit}>返回材料页</Button>
            </motion.div>
          ) : (
            <motion.div
              key={`${runtime.activeSectionIndex}-${runtime.activePhase}`}
              className="v3-content"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {runtime.activePhase === "read" && activeSection && (
                <ReadingSection
                  section={activeSection}
                  rewriteMappings={course.rewrite_mappings}
                  confusedWords={confusedWords}
                  spotlitWord={null}
                  onWordClick={() => {}}
                  onMarkConfused={handleMarkConfused}
                  onAddToWordbook={handleAddToWordbook}
                  apiCall={apiCall}
                  targetLevel={course.target_level}
                />
              )}

              {runtime.activePhase === "explain" && activeSection && (
                <ExplainSection
                  ref={explainRef}
                  section={activeSection}
                  course={course}
                  confusedWords={confusedWords}
                  apiCall={apiCall}
                  ttsEnabled={ttsEnabled}
                  speed={speed}
                  onSpeechLine={handleSpeechLine}
                  onSpeechEnd={handleSpeechEnd}
                  onPauseChange={setIsPaused}
                  onComplete={advancePhase}
                />
              )}

              {runtime.activePhase === "quiz" && activeSection && (
                <QuizSection
                  section={activeSection}
                  onComplete={advancePhase}
                  onSkip={advancePhase}
                />
              )}

              {runtime.activePhase === "discuss" && activeSection && (
                <DiscussSection
                  section={activeSection}
                  course={course}
                  apiCall={apiCall}
                  onMessage={handleDiscussMessage}
                  loading={discussLoading}
                  onComplete={advancePhase}
                  onSkip={advancePhase}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom: Roundtable (explain/discuss) or mini bar (read/quiz) */}
      <motion.div
        className={cn("v3-bottom", `v3-bottom--${rtState}`)}
        layout
        transition={{ duration: 0.25, ease: [0.21, 1, 0.36, 1] }}
      >
        {/* Playback control toolbar — only shown during explain/discuss */}
        {rtState !== "mini" && !isComplete && (
          <PlaybackToolbar
            isPlaying={runtime.activePhase === "explain"}
            isPaused={isPaused}
            speed={speed}
            ttsEnabled={ttsEnabled}
            sectionIndex={runtime.activeSectionIndex}
            totalSections={sections.length}
            onPlayPause={handlePlayPause}
            onPrev={() => {
              if (runtime.activeSectionIndex > 0) {
                persistRuntime({
                  ...runtime,
                  activeSectionIndex: runtime.activeSectionIndex - 1,
                  activePhase: "read",
                });
              }
            }}
            onNext={advancePhase}
            onCycleSpeed={handleCycleSpeed}
            onToggleTTS={() => setTtsEnabled((v) => !v)}
          />
        )}

        {rtState === "mini" ? (
          <MiniRoundtable
            teacherName={teacher.name}
            hint={
              runtime.activePhase === "read"
                ? "阅读完成后点击「开始讲解」"
                : "完成题目后继续"
            }
          />
        ) : (
          <Roundtable
            messages={roundtableMessages}
            activeSpeechActionId={activeSpeechId}
            isPaused={isPaused}
            cast={{
              teacher: { name: teacher.name },
              students: course.participants?.filter((p) => p.role === "student") || [],
            }}
          />
        )}

        {/* Phase action buttons */}
        {!isComplete && (
          <div className="v3-phase-actions">
            {runtime.activePhase === "read" && (
              <Button onClick={advancePhase} className="v3-phase-actions__primary">
                开始讲解 →
              </Button>
            )}
            {runtime.activePhase === "explain" && (
              <>
                <Button variant="outline" size="sm" onClick={advancePhase}>
                  跳过讲解
                </Button>
                <Button size="sm" onClick={advancePhase} className="v3-phase-actions__primary">
                  进入做题 →
                </Button>
              </>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
