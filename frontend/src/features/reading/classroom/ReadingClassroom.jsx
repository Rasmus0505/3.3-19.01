import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  GraduationCap,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Badge, Button, Card, Progress, Textarea } from "../../../shared/ui";
import { cn } from "../../../lib/utils";
import { normalizeReadingCourse } from "../readingCourse";
import { saveReadingCourseToRecord } from "../readingRewriteDB";
import { getReadingDerivedState } from "./readingDerivedState";
import { ProactiveCard } from "./ProactiveCard";
import { Roundtable } from "./Roundtable";
import { useReadingPlaybackEngine } from "./useReadingPlaybackEngine";

// ─── Quiz helpers ────────────────────────────────────────────────────────────

function scoreQuestion(question, answer) {
  if (!question) return false;
  if (question.type === "mcq") return answer === question.answer;
  if (question.type === "fill")
    return String(answer || "").trim().toLowerCase() ===
      String(question.answer || "").trim().toLowerCase();
  if (question.type === "order")
    return JSON.stringify(answer || []) === JSON.stringify(question.correct_order || []);
  return false;
}

// ─── Canvas content renderer (spotlight panel) ───────────────────────────────

function SpotlightPanel({ action, supportOpen, onToggleSupport }) {
  if (!action?.panel) {
    return (
      <div className="rc-canvas__placeholder">
        <GraduationCap className="size-8 opacity-20" />
        <p>Content will appear here as the lesson plays.</p>
      </div>
    );
  }

  const { panel } = action;

  if (panel.kind === "bullet_list") {
    return (
      <Card className="rc-canvas__card">
        {action.title && <h3 className="rc-canvas__heading">{action.title}</h3>}
        <ul className="rc-canvas__bullets">
          {(panel.items || []).map((item) => (
            <li key={item} className="rc-canvas__bullet">
              <CheckCircle2 className="size-4 shrink-0 text-primary" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </Card>
    );
  }

  if (panel.kind === "keyword_grid") {
    return (
      <Card className="rc-canvas__card">
        {action.title && <h3 className="rc-canvas__heading">{action.title}</h3>}
        <div className="rc-canvas__keyword-grid">
          {(panel.keywords || []).map((kw) => (
            <article key={kw.word} className="rc-canvas__keyword-card">
              <strong>{kw.word}</strong>
              {kw.reason && <p>{kw.reason}</p>}
              {kw.tip && <span className="rc-canvas__keyword-tip">{kw.tip}</span>}
            </article>
          ))}
        </div>
      </Card>
    );
  }

  if (panel.kind === "explanation_grid") {
    return (
      <Card className="rc-canvas__card">
        {action.title && <h3 className="rc-canvas__heading">{action.title}</h3>}
        <div className="rc-canvas__explain-grid">
          {(panel.points || []).map((pt) => (
            <article key={pt.label} className="rc-canvas__explain-card">
              <strong>{pt.label}</strong>
              <p>{pt.explanation}</p>
              {pt.example && <span className="rc-canvas__explain-example">{pt.example}</span>}
            </article>
          ))}
        </div>
      </Card>
    );
  }

  if (panel.kind === "reading_segment") {
    const seg = panel.segment || {};
    const key = action.id;
    const isOpen = Boolean(supportOpen?.[key]);
    return (
      <Card className="rc-canvas__card rc-canvas__card--segment">
        <div className="rc-canvas__segment-head">
          <Badge variant="outline">Main Reading</Badge>
          <h3 className="rc-canvas__heading">{seg.heading || action.title}</h3>
        </div>
        {panel.aside && <p className="rc-canvas__segment-focus">{panel.aside}</p>}
        <div className="rc-canvas__segment-text rc-canvas__segment-text--primary">
          <span className="rc-canvas__segment-label">i+1 version</span>
          <p>{seg.rewritten_text}</p>
        </div>
        {seg.original_text && (
          <div className="rc-canvas__segment-support">
            <button
              type="button"
              className="rc-canvas__support-toggle"
              onClick={() => onToggleSupport(key)}
            >
              {isOpen ? "Hide original" : "Show original text"}
            </button>
            <AnimatePresence>
              {isOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="rc-canvas__segment-text"
                >
                  <span className="rc-canvas__segment-label">Original</span>
                  <p>{seg.original_text}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
        {seg.question && <p className="rc-canvas__segment-question">{seg.question}</p>}
      </Card>
    );
  }

  return (
    <Card className="rc-canvas__card">
      {action.title && <h3 className="rc-canvas__heading">{action.title}</h3>}
      <p className="text-muted-foreground text-sm">Content ready.</p>
    </Card>
  );
}

// ─── SceneCanvas — always-visible content based on scene type ────────────────
// Renders immediately when scene loads, no need to wait for spotlight actions.

function SceneCanvas({ scene, supportOpen, onToggleSupport }) {
  const type = scene?.type;
  const beats = scene?.beats || [];

  // entry / wrap_up → objectives / takeaways slide
  if (type === "entry" || type === "wrap_up") {
    const heroBeat = beats.find((b) => b.type === "hero");
    const bulletBeat = beats.find((b) => b.type === "bullet_list");
    const teacherBeat = beats.find((b) => b.type === "teacher_talk");
    return (
      <div className="sc-slide">
        <div className="sc-slide__kicker">{type === "entry" ? "进入课堂" : "课堂收束"}</div>
        <h2 className="sc-slide__title">{heroBeat?.title || scene.title}</h2>
        {(heroBeat?.text || teacherBeat?.text) && (
          <p className="sc-slide__subtitle">{heroBeat?.text || teacherBeat?.text}</p>
        )}
        {bulletBeat?.items?.length > 0 && (
          <ul className="sc-slide__bullets">
            {bulletBeat.items.map((item) => (
              <li key={item} className="sc-slide__bullet">
                <CheckCircle2 className="size-4 shrink-0 text-primary" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // preview → keyword grid
  if (type === "preview") {
    const kwBeat = beats.find((b) => b.type === "keyword_grid");
    const teacherBeat = beats.find((b) => b.type === "teacher_talk");
    return (
      <div className="sc-slide">
        <div className="sc-slide__kicker">本课关键词</div>
        {teacherBeat?.text && <p className="sc-slide__subtitle sc-slide__subtitle--sm">{teacherBeat.text}</p>}
        {kwBeat?.keywords?.length > 0 && (
          <div className="sc-kw-grid">
            {kwBeat.keywords.map((kw) => (
              <article key={kw.word} className="sc-kw-card">
                <strong>{kw.word}</strong>
                {kw.reason && <p>{kw.reason}</p>}
                {kw.tip && <span>{kw.tip}</span>}
              </article>
            ))}
          </div>
        )}
      </div>
    );
  }

  // guided_reading → reading segments
  if (type === "guided_reading") {
    const segBeats = beats.filter((b) => b.type === "reading_segment");
    if (segBeats.length > 0) {
      return (
        <div className="sc-reading">
          {segBeats.map((beat) => {
            const seg = beat.segment || {};
            const key = beat.id;
            const isOpen = Boolean(supportOpen?.[key]);
            return (
              <div key={key} className="sc-reading__segment">
                <div className="sc-reading__head">
                  <Badge variant="outline">{seg.heading || beat.title || "Part"}</Badge>
                  {seg.focus && <span className="sc-reading__focus">{seg.focus}</span>}
                </div>
                <div className="sc-reading__text sc-reading__text--primary">
                  <span className="sc-reading__label">i+1 版本</span>
                  <p>{seg.rewritten_text}</p>
                </div>
                {seg.original_text && (
                  <>
                    <button type="button" className="rc-canvas__support-toggle" onClick={() => onToggleSupport(key)}>
                      {isOpen ? "收起原文" : "查看原文"}
                    </button>
                    <AnimatePresence>
                      {isOpen && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="sc-reading__text"
                        >
                          <span className="sc-reading__label">原文</span>
                          <p>{seg.original_text}</p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </>
                )}
                {seg.question && <p className="sc-reading__question">{seg.question}</p>}
              </div>
            );
          })}
        </div>
      );
    }
  }

  // deep_explain → explanation grid
  if (type === "deep_explain") {
    const exBeat = beats.find((b) => b.type === "explanation_grid");
    return (
      <div className="sc-slide">
        <div className="sc-slide__kicker">难点拆解</div>
        {exBeat?.points?.length > 0 && (
          <div className="sc-ex-grid">
            {exBeat.points.map((pt) => (
              <article key={pt.label} className="sc-ex-card">
                <strong>{pt.label}</strong>
                <p>{pt.explanation}</p>
                {pt.example && <span>{pt.example}</span>}
              </article>
            ))}
          </div>
        )}
      </div>
    );
  }

  // discussion → show the conversation beats as a preview
  if (type === "discussion") {
    const convBeat = beats.find((b) => b.type === "conversation");
    const teacherBeat = beats.find((b) => b.type === "teacher_talk");
    return (
      <div className="sc-slide">
        <div className="sc-slide__kicker">课堂讨论</div>
        {teacherBeat?.text && <p className="sc-slide__subtitle">{teacherBeat.text}</p>}
        {convBeat?.messages?.length > 0 && (
          <div className="sc-conv">
            {convBeat.messages.slice(0, 3).map((msg, i) => (
              <div key={i} className={`sc-conv__line sc-conv__line--${msg.speaker || "teacher"}`}>
                <span className="sc-conv__speaker">{msg.speaker || "Teacher"}</span>
                <span className="sc-conv__text">{msg.text || msg.content}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Fallback: generic slide from first teacher_talk or hero beat
  const fallbackBeat = beats.find((b) => b.type === "hero" || b.type === "teacher_talk");
  return (
    <div className="sc-slide">
      <div className="sc-slide__kicker">{scene.goal || scene.title}</div>
      {fallbackBeat?.title && <h2 className="sc-slide__title">{fallbackBeat.title}</h2>}
      {fallbackBeat?.text && <p className="sc-slide__subtitle">{fallbackBeat.text}</p>}
    </div>
  );
}

// ─── Quiz panel ──────────────────────────────────────────────────────────────

function QuizPanel({ scene, quizState, onSetAnswer, onSubmit }) {
  const questions = scene.task?.questions || [];
  const submitted = Boolean(quizState.submitted);
  return (
    <Card className="rc-canvas__card">
      <div className="rc-canvas__task-head">
        <h3 className="rc-canvas__heading">理解检查</h3>
        <Badge variant="outline">{questions.length} questions</Badge>
      </div>
      {scene.task?.instructions && (
        <p className="rc-canvas__task-copy">{scene.task.instructions}</p>
      )}
      <div className="rc-canvas__question-stack">
        {questions.map((q, qi) => (
          <article key={`${scene.id}-q${qi}`} className="rc-canvas__question">
            <p className="rc-canvas__question-text">
              <Badge variant="outline" className="mr-2">Q{qi + 1}</Badge>
              {q.question || q.sentence}
            </p>
            {q.type === "mcq" && (
              <div className="rc-canvas__option-list">
                {(q.options || []).map((opt) => {
                  const val = typeof opt === "object" ? opt.value || opt.label : opt;
                  const label = typeof opt === "object" ? opt.label : opt;
                  const selected = quizState.answers?.[qi] === val;
                  const correct = submitted && scoreQuestion(q, val);
                  const wrong = submitted && selected && !correct;
                  return (
                    <button
                      key={val}
                      type="button"
                      disabled={submitted}
                      className={cn(
                        "rc-canvas__option",
                        selected && "rc-canvas__option--selected",
                        correct && "rc-canvas__option--correct",
                        wrong && "rc-canvas__option--wrong",
                      )}
                      onClick={() => !submitted && onSetAnswer(qi, val)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
            {q.type === "fill" && (
              <Textarea
                value={quizState.answers?.[qi] || ""}
                disabled={submitted}
                onChange={(e) => onSetAnswer(qi, e.target.value)}
                placeholder="Type your answer…"
                className="rc-canvas__textarea"
              />
            )}
            {submitted && q.analysis && (
              <p className="rc-canvas__question-analysis">{q.analysis}</p>
            )}
          </article>
        ))}
      </div>
      <div className="rc-canvas__task-actions">
        {!submitted ? (
          <Button onClick={onSubmit}>Submit</Button>
        ) : (
          <p className="rc-canvas__score">Score: {quizState.score ?? 0}%</p>
        )}
      </div>
    </Card>
  );
}

// ─── Output panel ─────────────────────────────────────────────────────────────

function OutputPanel({ scene, outputState, onSetDraft, onEvaluate }) {
  const busy = outputState.status === "evaluating";
  const done = Boolean(outputState.evaluation);
  return (
    <Card className="rc-canvas__card">
      <div className="rc-canvas__task-head">
        <h3 className="rc-canvas__heading">你的输出</h3>
        <Badge variant="outline">Writing</Badge>
      </div>
      {scene.task?.prompt && <p className="rc-canvas__task-copy">{scene.task.prompt}</p>}
      {scene.task?.guidance && (
        <p className="rc-canvas__task-copy rc-canvas__task-copy--muted">{scene.task.guidance}</p>
      )}
      {(scene.task?.checklist || []).length > 0 && (
        <ul className="rc-canvas__bullets rc-canvas__bullets--small">
          {scene.task.checklist.map((item) => (
            <li key={item} className="rc-canvas__bullet">
              <CheckCircle2 className="size-3.5 shrink-0 text-primary" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
      <Textarea
        value={outputState.draft || ""}
        onChange={(e) => onSetDraft(e.target.value)}
        placeholder="Write your response here…"
        className="rc-canvas__textarea rc-canvas__textarea--large"
        disabled={busy || done}
      />
      <div className="rc-canvas__task-actions">
        {!done && (
          <Button
            onClick={onEvaluate}
            disabled={busy || !String(outputState.draft || "").trim()}
          >
            {busy ? "Generating feedback…" : "Submit for feedback"}
          </Button>
        )}
        {outputState.error && (
          <span className="rc-canvas__error">{outputState.error}</span>
        )}
      </div>
      {done && outputState.evaluation && (
        <div className="rc-canvas__feedback">
          <div className="rc-canvas__feedback-score">
            <span>Score</span>
            <strong>{outputState.evaluation.score ?? "–"}</strong>
          </div>
          {outputState.evaluation.feedback && (
            <p className="rc-canvas__feedback-text">{outputState.evaluation.feedback}</p>
          )}
        </div>
      )}
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ReadingClassroom({ articleId, course, sourceTexts, apiCall, onExit }) {
  const [liveCourse, setLiveCourse] = useState(() => normalizeReadingCourse(course));
  const courseRef = useRef(liveCourse);
  const [supportOpen, setSupportOpen] = useState({});
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    const normalized = normalizeReadingCourse(course);
    setLiveCourse(normalized);
    courseRef.current = normalized;
  }, [course]);

  const persistCourse = useCallback(
    async (nextCourse) => {
      const normalized = normalizeReadingCourse(nextCourse);
      setLiveCourse(normalized);
      courseRef.current = normalized;
      if (articleId && normalized) {
        await saveReadingCourseToRecord(articleId, normalized);
      }
    },
    [articleId],
  );

  const persistRuntime = useCallback(
    async (runtimePatch) => {
      const current = courseRef.current;
      if (!current) return;
      await persistCourse({
        ...current,
        runtime: {
          ...(current.runtime || {}),
          ...runtimePatch,
          totalScenes: current.scenes.length,
          lastViewedAt: Date.now(),
        },
      });
    },
    [persistCourse],
  );

  const { playbackState, actions: playbackActions } = useReadingPlaybackEngine({
    course: liveCourse,
    apiCall,
    onPersistPlayback: persistRuntime,
  });

  const runtime = liveCourse?.runtime || {};
  const derived = useMemo(
    () => getReadingDerivedState(liveCourse, playbackState, runtime),
    [liveCourse, playbackState, runtime],
  );

  // Auto-start playback 800ms after entering a new course
  useEffect(() => {
    if (!liveCourse?.article_id) return;
    const timer = setTimeout(() => {
      playbackActions.start();
    }, 800);
    return () => clearTimeout(timer);
  }, [liveCourse?.article_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeScene = derived?.activeScene || null;
  const activeSceneId = activeScene?.id;

  const quizState = activeSceneId
    ? runtime.quiz?.[activeSceneId] || { answers: {} }
    : { answers: {} };
  const outputState = activeSceneId
    ? runtime.output?.[activeSceneId] || { draft: "", status: "idle" }
    : { draft: "", status: "idle" };
  const discussionState = activeSceneId
    ? runtime.discussion?.[activeSceneId] || { draft: "", messages: [], status: "idle" }
    : { draft: "", messages: [], status: "idle" };

  // ── Runtime updater ───────────────────────────────────────────────────────

  const updateRuntime = useCallback(
    async (updater) => {
      const current = courseRef.current;
      if (!current) return;
      const nextRuntime = updater(current.runtime || {});
      await persistCourse({
        ...current,
        runtime: {
          ...(current.runtime || {}),
          ...nextRuntime,
          totalScenes: current.scenes.length,
          lastViewedAt: Date.now(),
        },
      });
    },
    [persistCourse],
  );

  // ── Scene advance ─────────────────────────────────────────────────────────

  const markSceneCompleteAndAdvance = useCallback(async () => {
    if (!activeScene) return;
    const nextIndex = Math.min(
      (runtime.activeSceneIndex || 0) + 1,
      (liveCourse?.scenes || []).length - 1,
    );
    await updateRuntime((cur) => {
      const completed = new Set(cur.completedSceneIds || []);
      completed.add(activeScene.id);
      return {
        ...cur,
        completedSceneIds: Array.from(completed),
        activeSceneIndex: nextIndex,
        completedAt:
          completed.size >= (liveCourse?.scenes || []).length
            ? new Date().toISOString()
            : cur.completedAt || null,
      };
    });
    // After completing an interactive scene, dispatch GO_TO_SCENE directly with playing mode
    const nextScene = liveCourse?.scenes?.[nextIndex];
    if (nextScene) {
      // Use internal dispatch via start after goToScene resets the cursor
      playbackActions.goToScene(nextIndex, nextScene.id);
      // Small delay to let state settle, then auto-start
      setTimeout(() => playbackActions.start(), 300);
    }
  }, [activeScene, liveCourse, playbackActions, runtime.activeSceneIndex, updateRuntime]);

  // ── Quiz handlers ─────────────────────────────────────────────────────────

  const setQuizAnswer = (qi, val) => {
    if (!activeSceneId) return;
    updateRuntime((cur) => ({
      ...cur,
      quiz: {
        ...(cur.quiz || {}),
        [activeSceneId]: {
          ...((cur.quiz || {})[activeSceneId] || {}),
          answers: {
            ...((cur.quiz || {})[activeSceneId]?.answers || {}),
            [qi]: val,
          },
        },
      },
    }));
  };

  const submitQuiz = () => {
    if (!activeSceneId || !activeScene?.task) return;
    const questions = activeScene.task.questions || [];
    const answers = quizState.answers || {};
    const score = questions.length
      ? Math.round(
          (questions.filter((q, i) => scoreQuestion(q, answers[i])).length / questions.length) *
            100,
        )
      : 100;
    updateRuntime((cur) => ({
      ...cur,
      quiz: {
        ...(cur.quiz || {}),
        [activeSceneId]: {
          ...((cur.quiz || {})[activeSceneId] || {}),
          answers,
          submitted: true,
          score,
        },
      },
    }));
  };

  // ── Output handlers ───────────────────────────────────────────────────────

  const setOutputDraft = (draft) => {
    if (!activeSceneId) return;
    updateRuntime((cur) => ({
      ...cur,
      output: {
        ...(cur.output || {}),
        [activeSceneId]: {
          ...((cur.output || {})[activeSceneId] || {}),
          draft,
          status: "editing",
          error: null,
        },
      },
    }));
  };

  const evaluateOutput = async () => {
    if (!activeSceneId || !apiCall || !String(outputState.draft || "").trim()) return;
    const draft = String(outputState.draft).trim();
    await updateRuntime((cur) => ({
      ...cur,
      output: {
        ...(cur.output || {}),
        [activeSceneId]: {
          ...((cur.output || {})[activeSceneId] || {}),
          draft,
          status: "evaluating",
          error: null,
        },
      },
    }));
    try {
      const res = await apiCall("/api/llm/writing/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          article_text: sourceTexts?.rewrittenText || sourceTexts?.originalText || "",
          writing_prompt: activeScene?.task?.prompt || "Summarize the article in your own words.",
          user_response: draft,
          target_level: liveCourse?.target_level || "B1",
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || "反馈生成失败");
      const payload = await res.json();
      await updateRuntime((cur) => ({
        ...cur,
        output: {
          ...(cur.output || {}),
          [activeSceneId]: {
            ...((cur.output || {})[activeSceneId] || {}),
            draft,
            status: "completed",
            evaluation: payload.evaluation,
            error: null,
          },
        },
      }));
    } catch (err) {
      await updateRuntime((cur) => ({
        ...cur,
        output: {
          ...(cur.output || {}),
          [activeSceneId]: {
            ...((cur.output || {})[activeSceneId] || {}),
            draft,
            status: "editing",
            error: err?.message || "反馈生成失败",
          },
        },
      }));
    }
  };

  // ── Discussion handlers ───────────────────────────────────────────────────

  const setDiscussionDraft = (draft) => {
    if (!activeSceneId) return;
    updateRuntime((cur) => ({
      ...cur,
      discussion: {
        ...(cur.discussion || {}),
        [activeSceneId]: {
          ...((cur.discussion || {})[activeSceneId] || {}),
          draft,
          error: null,
        },
      },
    }));
  };

  const sendDiscussion = async (preset = "") => {
    if (!activeSceneId || !apiCall) return;
    const draft = String(preset || discussionState.draft || "").trim();
    if (!draft) return;
    playbackActions.enterLive(activeSceneId);
    const prevMessages = discussionState.messages || [];
    const nextMessages = [...prevMessages, { role: "user", content: draft }];
    await updateRuntime((cur) => ({
      ...cur,
      discussion: {
        ...(cur.discussion || {}),
        [activeSceneId]: {
          ...((cur.discussion || {})[activeSceneId] || {}),
          draft: "",
          messages: nextMessages,
          status: "loading",
          error: null,
        },
      },
    }));
    try {
      const res = await apiCall("/api/llm/reading-course/discussion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course: courseRef.current,
          scene_id: activeSceneId,
          message: draft,
          history: nextMessages,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || "讨论回复失败");
      const payload = await res.json();
      await updateRuntime((cur) => ({
        ...cur,
        discussion: {
          ...(cur.discussion || {}),
          [activeSceneId]: {
            ...((cur.discussion || {})[activeSceneId] || {}),
            messages: [...nextMessages, { role: "assistant", content: payload.reply }],
            status: "idle",
            error: null,
            draft: "",
          },
        },
      }));
    } catch (err) {
      await updateRuntime((cur) => ({
        ...cur,
        discussion: {
          ...(cur.discussion || {}),
          [activeSceneId]: {
            ...((cur.discussion || {})[activeSceneId] || {}),
            messages: nextMessages,
            status: "idle",
            error: err?.message || "讨论回复失败",
            draft,
          },
        },
      }));
    }
  };

  // ── Render guards ─────────────────────────────────────────────────────────

  if (!derived || !activeScene) return null;

  // ── Canvas content decision ───────────────────────────────────────────────
  // Always show scene-appropriate content from the moment the scene loads.
  // Don't wait for spotlight actions — the canvas should never be empty.

  let canvasContent;

  if (activeScene.type === "checkpoint") {
    canvasContent = (
      <QuizPanel
        scene={activeScene}
        quizState={quizState}
        onSetAnswer={setQuizAnswer}
        onSubmit={submitQuiz}
      />
    );
  } else if (activeScene.type === "output") {
    canvasContent = (
      <OutputPanel
        scene={activeScene}
        outputState={outputState}
        onSetDraft={setOutputDraft}
        onEvaluate={evaluateOutput}
      />
    );
  } else {
    // For all other scene types, render content derived from the scene beats directly.
    // This replaces the empty spotlight placeholder with real content immediately.
    canvasContent = (
      <SceneCanvas
        scene={activeScene}
        supportOpen={supportOpen}
        onToggleSupport={(key) =>
          setSupportOpen((prev) => ({ ...prev, [key]: !prev[key] }))
        }
      />
    );
  }

  const showDiscussion =
    derived.isLiveMode ||
    (derived.discussionAction && derived.allActionsRevealed);

  const isLastScene =
    playbackState.activeSceneIndex === (liveCourse?.scenes || []).length - 1;

  // ── Layout ────────────────────────────────────────────────────────────────

  return (
    <div className="rc-shell">
      {/* Sidebar */}
      <AnimatePresence initial={false}>
        {sidebarOpen && (
          <motion.aside
            className="rc-sidebar"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 220, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.21, 1, 0.36, 1] }}
          >
            <div className="rc-sidebar__inner">
              {/* Course overview */}
              <div className="rc-sidebar__overview">
                <div className="rc-sidebar__teacher">
                  <GraduationCap className="size-4" />
                  <span>{liveCourse.cast?.teacher?.name || "Teacher"}</span>
                </div>
                <p className="rc-sidebar__title">{liveCourse.article_title}</p>
                <div className="rc-sidebar__meta">
                  <Badge variant="outline">{liveCourse.target_level}</Badge>
                  <span>{derived.progressPercent}%</span>
                </div>
                <Progress value={derived.progressPercent} className="rc-sidebar__progress" />
              </div>

              {/* Scene rail */}
              <nav className="rc-sidebar__rail">
                {derived.scenes.map((scene, index) => {
                  const isActive = index === playbackState.activeSceneIndex;
                  const isDone = runtime.completedSceneIds?.includes(scene.id);
                  return (
                    <button
                      key={scene.id}
                      type="button"
                      className={cn(
                        "rc-sidebar__item",
                        isActive && "rc-sidebar__item--active",
                        isDone && "rc-sidebar__item--done",
                      )}
                      onClick={() => playbackActions.goToScene(index, scene.id)}
                    >
                      <span className="rc-sidebar__item-num">{index + 1}</span>
                      <span className="rc-sidebar__item-title">{scene.title}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main */}
      <div className="rc-main">
        {/* Header */}
        <header className="rc-header">
          <div className="rc-header__left">
            <button
              type="button"
              className="rc-header__icon-btn"
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label="Toggle sidebar"
            >
              <ChevronLeft
                className={cn("size-4 transition-transform", !sidebarOpen && "rotate-180")}
              />
            </button>
            <Badge variant="outline" className="rc-header__scene-num">
              {playbackState.activeSceneIndex + 1} / {derived.scenes.length}
            </Badge>
            <span className="rc-header__scene-title">{activeScene.title}</span>
          </div>
          <div className="rc-header__right">
            <button
              type="button"
              className="rc-header__icon-btn"
              onClick={() => playbackActions.toggleTTS()}
              aria-label="Toggle TTS"
            >
              {playbackState.ttsEnabled ? (
                <Volume2 className="size-4" />
              ) : (
                <VolumeX className="size-4" />
              )}
            </button>
            <button
              type="button"
              className="rc-header__exit-btn"
              onClick={onExit}
            >
              <ArrowLeft className="size-4" />
              <span>返回</span>
            </button>
          </div>
        </header>

        {/* Stage: canvas + roundtable */}
        <div className="rc-stage">
          {/* 16:9 canvas */}
          <div className="rc-canvas">
            <AnimatePresence mode="wait">
              <motion.div
                key={`${activeSceneId}-canvas`}
                className="rc-canvas__inner"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
              >
                {canvasContent}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Roundtable — fixed 192px bottom stage bar */}
          <div className="rc-roundtable-wrap">
            <Roundtable
              messages={derived.roundtableMessages}
              activeSpeechActionId={playbackState.activeSpeechActionId}
              cast={liveCourse.cast}
            />

            {/* Live discussion compose */}
            <AnimatePresence>
              {showDiscussion && (
                <motion.div
                  className="rc-discussion-compose"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.2 }}
                >
                  {!derived.isLiveMode ? (
                    <ProactiveCard
                      action={derived.discussionAction}
                      liveActive={false}
                      onJoin={sendDiscussion}
                      onSkip={() => playbackActions.exitLive("paused")}
                    />
                  ) : (
                    <div className="rc-discussion-input">
                      <Textarea
                        value={discussionState.draft || ""}
                        onChange={(e) => setDiscussionDraft(e.target.value)}
                        placeholder="Ask the teacher anything about this reading…"
                        className="rc-discussion-input__textarea"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                            e.preventDefault();
                            sendDiscussion();
                          }
                        }}
                      />
                      <div className="rc-discussion-input__actions">
                        <Button
                          size="sm"
                          onClick={() => sendDiscussion()}
                          disabled={
                            !String(discussionState.draft || "").trim() ||
                            discussionState.status === "loading"
                          }
                        >
                          {discussionState.status === "loading" ? "Thinking…" : "Send"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => playbackActions.exitLive("paused")}
                        >
                          End discussion
                        </Button>
                      </div>
                      {discussionState.error && (
                        <p className="rc-discussion-input__error">{discussionState.error}</p>
                      )}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Footer controls */}
        <footer className="rc-footer">
          <div className="rc-footer__left">
            {/* Play button only shown if truly idle (auto-start hasn't fired yet) */}
            {derived.isIdle && (
              <Button onClick={playbackActions.start} className="gap-1.5">
                <Play className="size-4" />
                开始
              </Button>
            )}
            {derived.canPause && (
              <Button variant="outline" onClick={playbackActions.pause} className="gap-1.5">
                <Pause className="size-4" />
                暂停
              </Button>
            )}
            {derived.isPaused && !derived.isIdle && (
              <Button onClick={playbackActions.resume} className="gap-1.5">
                <Play className="size-4" />
                继续播放
              </Button>
            )}
          </div>
          <div className="rc-footer__right">
            {/* Only show manual advance for interactive scenes (quiz/output) after task done */}
            {derived.canAdvanceScene && derived.taskAction && (
              <Button onClick={markSceneCompleteAndAdvance} className="gap-1.5">
                {isLastScene ? "完成课程" : "下一场景"}
                <ArrowRight className="size-4" />
              </Button>
            )}
            {derived.isLiveMode && (
              <span className="rc-footer__hint">讨论结束后课程自动继续</span>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
