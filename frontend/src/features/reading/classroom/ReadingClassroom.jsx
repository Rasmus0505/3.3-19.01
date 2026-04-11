import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  Brain,
  CheckCircle2,
  GraduationCap,
  Lightbulb,
  MessageSquareQuote,
  PenSquare,
  ScrollText,
  Sparkles,
} from "lucide-react";
import { Badge, Button, Card, Progress, Textarea } from "../../../shared/ui";
import { cn } from "../../../lib/utils";
import { normalizeReadingCourse } from "../readingCourse";
import { saveReadingCourseToRecord } from "../readingRewriteDB";

function getSceneIcon(type) {
  switch (type) {
    case "intro":
      return GraduationCap;
    case "warmup":
      return Sparkles;
    case "close_reading":
      return BookOpenText;
    case "explanation":
      return Lightbulb;
    case "quiz":
      return Brain;
    case "output":
      return PenSquare;
    case "wrap_up":
      return MessageSquareQuote;
    default:
      return ScrollText;
  }
}

function getPrimaryText(sourceTexts = {}) {
  return sourceTexts.rewrittenText || sourceTexts.originalText || "";
}

function scoreQuestion(question, answer) {
  if (!question) return false;
  if (question.type === "mcq") {
    return answer === question.answer;
  }
  if (question.type === "fill") {
    return String(answer || "").trim().toLowerCase() === String(question.answer || "").trim().toLowerCase();
  }
  if (question.type === "order") {
    return JSON.stringify(answer || []) === JSON.stringify(question.correct_order || []);
  }
  return false;
}

function SceneRail({ scenes, runtime, onJumpToScene }) {
  const completed = new Set(runtime?.completedSceneIds || []);
  const activeIndex = runtime?.activeSceneIndex || 0;

  return (
    <div className="reading-classroom__rail">
      {scenes.map((scene, index) => {
        const Icon = getSceneIcon(scene.type);
        const done = completed.has(scene.id);
        const active = index === activeIndex;
        const unlocked = index <= activeIndex || done;

        return (
          <button
            key={scene.id}
            type="button"
            className={cn(
              "reading-classroom__rail-item",
              active && "reading-classroom__rail-item--active",
              done && "reading-classroom__rail-item--done",
            )}
            onClick={() => unlocked && onJumpToScene(index)}
            disabled={!unlocked}
          >
            <span className="reading-classroom__rail-icon">
              {done ? <CheckCircle2 className="size-4" /> : <Icon className="size-4" />}
            </span>
            <span className="reading-classroom__rail-copy">
              <span className="reading-classroom__rail-title">{scene.title}</span>
              <span className="reading-classroom__rail-goal">{scene.goal}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SceneShell({ scene, teacher, children, footer }) {
  const Icon = getSceneIcon(scene.type);
  return (
    <section className="reading-classroom__scene">
      <div className="reading-classroom__scene-head">
        <div className="reading-classroom__scene-kicker">
          <span className="reading-classroom__scene-mark">
            <Icon className="size-4" />
          </span>
          <div>
            <p className="reading-classroom__scene-eyebrow">{teacher?.name || "Reading Coach"}</p>
            <h2 className="reading-classroom__scene-title">{scene.title}</h2>
          </div>
        </div>
        <Badge variant="outline" className="reading-classroom__goal-badge">
          {scene.goal}
        </Badge>
      </div>
      <div className="reading-classroom__scene-body">{children}</div>
      <div className="reading-classroom__scene-footer">{footer}</div>
    </section>
  );
}

function IntroScene({ scene }) {
  const content = scene.content || {};
  return (
    <div className="reading-classroom__stack">
      <Card className="reading-classroom__hero-card">
        <p className="reading-classroom__hero-hook">{content.hook}</p>
        <p className="reading-classroom__hero-open">{content.teacher_opening}</p>
      </Card>
      <div className="reading-classroom__objective-grid">
        {(content.objectives || []).map((item) => (
          <Card key={item} className="reading-classroom__objective-card">
            <CheckCircle2 className="size-4 text-emerald-600" />
            <span>{item}</span>
          </Card>
        ))}
      </div>
    </div>
  );
}

function WarmupScene({ scene }) {
  const content = scene.content || {};
  return (
    <div className="reading-classroom__stack">
      <Card className="reading-classroom__message-card">
        <p>{content.preview}</p>
      </Card>
      <div className="reading-classroom__keyword-grid">
        {(content.keywords || []).map((item) => (
          <Card key={item.word} className="reading-classroom__keyword-card">
            <div className="reading-classroom__keyword-head">
              <strong>{item.word}</strong>
              <Badge variant="outline">watchword</Badge>
            </div>
            <p>{item.reason}</p>
            <p className="reading-classroom__muted">{item.tip}</p>
          </Card>
        ))}
      </div>
      {content.check_in ? (
        <Card className="reading-classroom__message-card reading-classroom__message-card--accent">
          <p>{content.check_in}</p>
        </Card>
      ) : null}
    </div>
  );
}

function CloseReadingScene({ scene }) {
  const segments = scene.content?.segments || [];
  return (
    <div className="reading-classroom__stack">
      {segments.map((segment) => (
        <Card key={segment.id} className="reading-classroom__segment-card">
          <div className="reading-classroom__segment-head">
            <div>
              <h3>{segment.heading}</h3>
              <p>{segment.focus}</p>
            </div>
            <Badge variant="outline">i+1 first</Badge>
          </div>
          <div className="reading-classroom__segment-columns">
            <div className="reading-classroom__segment-pane reading-classroom__segment-pane--primary">
              <span className="reading-classroom__segment-label">Main Reading</span>
              <p>{segment.rewritten_text}</p>
            </div>
            {segment.original_text ? (
              <div className="reading-classroom__segment-pane">
                <span className="reading-classroom__segment-label">Original Support</span>
                <p>{segment.original_text}</p>
              </div>
            ) : null}
          </div>
          <div className="reading-classroom__segment-notes">
            <Card className="reading-classroom__message-card">
              <p>{segment.teacher_note}</p>
            </Card>
            <Card className="reading-classroom__message-card reading-classroom__message-card--accent">
              <p>{segment.question}</p>
            </Card>
          </div>
        </Card>
      ))}
    </div>
  );
}

function ExplanationScene({ scene }) {
  const points = scene.content?.points || [];
  return (
    <div className="reading-classroom__explanation-grid">
      {points.map((point) => (
        <Card key={point.label} className="reading-classroom__explanation-card">
          <div className="reading-classroom__explanation-head">
            <strong>{point.label}</strong>
            <Lightbulb className="size-4 text-amber-500" />
          </div>
          <p>{point.explanation}</p>
          {point.example ? <p className="reading-classroom__muted">{point.example}</p> : null}
        </Card>
      ))}
    </div>
  );
}

function QuizScene({ scene, quizState, onAnswer, onSubmit }) {
  const questions = scene.content?.questions || [];
  const score = quizState?.score;

  return (
    <div className="reading-classroom__stack">
      <Card className="reading-classroom__message-card">
        <p>{scene.content?.instructions}</p>
      </Card>
      {questions.map((question, index) => (
        <Card key={`${scene.id}-${index}`} className="reading-classroom__quiz-card">
          <div className="reading-classroom__quiz-head">
            <Badge variant="outline">Q{index + 1}</Badge>
            <span className="reading-classroom__muted">{question.type}</span>
          </div>
          <h3 className="reading-classroom__quiz-question">
            {question.question || question.sentence || "Question"}
          </h3>

          {question.type === "mcq" ? (
            <div className="reading-classroom__quiz-options">
              {(question.options || []).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={cn(
                    "reading-classroom__quiz-option",
                    quizState?.answers?.[index] === option && "reading-classroom__quiz-option--selected",
                  )}
                  onClick={() => onAnswer(index, option)}
                >
                  {option}
                </button>
              ))}
            </div>
          ) : null}

          {question.type === "fill" ? (
            <Textarea
              value={quizState?.answers?.[index] || ""}
              onChange={(event) => onAnswer(index, event.target.value)}
              placeholder="Type your answer"
              className="reading-classroom__textarea"
            />
          ) : null}

          {question.type === "order" ? (
            <div className="reading-classroom__order-list">
              {(question.sentences || []).map((sentence, sentenceIndex) => {
                const current = quizState?.answers?.[index] || [];
                const present = current.includes(sentenceIndex);
                return (
                  <button
                    key={`${sentence}-${sentenceIndex}`}
                    type="button"
                    className={cn(
                      "reading-classroom__quiz-option",
                      present && "reading-classroom__quiz-option--selected",
                    )}
                    onClick={() => {
                      const next = present
                        ? current.filter((item) => item !== sentenceIndex)
                        : [...current, sentenceIndex];
                      onAnswer(index, next);
                    }}
                  >
                    <span>{present ? current.indexOf(sentenceIndex) + 1 : "?"}</span>
                    <span>{sentence}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </Card>
      ))}
      {questions.length > 0 ? (
        <div className="reading-classroom__quiz-submit">
          <Button onClick={onSubmit}>提交理解检查</Button>
          {typeof score === "number" ? (
            <span className="reading-classroom__quiz-score">Score {score}%</span>
          ) : null}
        </div>
      ) : (
        <Card className="reading-classroom__message-card">
          <p>这节课没有生成可评分题目，可以直接继续。</p>
        </Card>
      )}
    </div>
  );
}

function OutputScene({ scene, outputState, onDraftChange, onEvaluate }) {
  const evaluation = outputState?.evaluation;

  return (
    <div className="reading-classroom__stack">
      <Card className="reading-classroom__message-card reading-classroom__message-card--accent">
        <p>{scene.content?.prompt}</p>
      </Card>
      {scene.content?.guidance ? (
        <Card className="reading-classroom__message-card">
          <p>{scene.content.guidance}</p>
          {(scene.content.checklist || []).length > 0 ? (
            <div className="reading-classroom__checklist">
              {scene.content.checklist.map((item) => (
                <span key={item} className="reading-classroom__check">
                  <CheckCircle2 className="size-3.5" />
                  {item}
                </span>
              ))}
            </div>
          ) : null}
        </Card>
      ) : null}

      <Textarea
        value={outputState?.draft || ""}
        onChange={(event) => onDraftChange(event.target.value)}
        placeholder="Write your response here..."
        className="reading-classroom__textarea reading-classroom__textarea--large"
      />

      <div className="reading-classroom__quiz-submit">
        <Button onClick={onEvaluate} disabled={!String(outputState?.draft || "").trim()}>
          提交并获取反馈
        </Button>
        {outputState?.status === "evaluating" ? (
          <span className="reading-classroom__muted">正在生成反馈…</span>
        ) : null}
      </div>

      {outputState?.error ? (
        <Card className="reading-classroom__message-card">
          <p>{outputState.error}</p>
        </Card>
      ) : null}

      {evaluation ? (
        <div className="reading-classroom__feedback-grid">
          <Card className="reading-classroom__feedback-score">
            <span>Writing Score</span>
            <strong>{evaluation.score ?? "--"}</strong>
            <p>{evaluation.feedback}</p>
          </Card>
          {(evaluation.corrections || []).length > 0 ? (
            <Card className="reading-classroom__feedback-card">
              <h3>Corrections</h3>
              {(evaluation.corrections || []).map((item, index) => (
                <div key={`${item.original}-${index}`} className="reading-classroom__feedback-row">
                  <span>{item.original}</span>
                  <span className="reading-classroom__feedback-arrow">→</span>
                  <span>{item.corrected}</span>
                </div>
              ))}
            </Card>
          ) : null}
          {(evaluation.i1_suggestions || []).length > 0 ? (
            <Card className="reading-classroom__feedback-card">
              <h3>I+1 Suggestions</h3>
              {(evaluation.i1_suggestions || []).map((item, index) => (
                <div key={`${item.suggested_word}-${index}`} className="reading-classroom__feedback-row">
                  <span>{item.original_word}</span>
                  <span className="reading-classroom__feedback-arrow">→</span>
                  <span>{item.suggested_word}</span>
                </div>
              ))}
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function WrapUpScene({ scene, runtime }) {
  const completedCount = (runtime?.completedSceneIds || []).length;
  return (
    <div className="reading-classroom__stack">
      <Card className="reading-classroom__hero-card">
        <p className="reading-classroom__hero-open">{scene.content?.teacher_closing}</p>
      </Card>
      <div className="reading-classroom__objective-grid">
        {(scene.content?.takeaways || []).map((item) => (
          <Card key={item} className="reading-classroom__objective-card">
            <CheckCircle2 className="size-4 text-emerald-600" />
            <span>{item}</span>
          </Card>
        ))}
      </div>
      <Card className="reading-classroom__message-card reading-classroom__message-card--accent">
        <p>{scene.content?.next_step}</p>
      </Card>
      <div className="reading-classroom__completion">
        <strong>{completedCount}</strong>
        <span>scenes completed</span>
      </div>
    </div>
  );
}

export function ReadingClassroom({
  articleId,
  course,
  sourceTexts,
  apiCall,
  onExit,
}) {
  const [liveCourse, setLiveCourse] = useState(() => normalizeReadingCourse(course));

  useEffect(() => {
    setLiveCourse(normalizeReadingCourse(course));
  }, [course]);

  const persistCourse = useCallback(
    async (nextCourse) => {
      setLiveCourse(nextCourse);
      if (articleId) {
        await saveReadingCourseToRecord(articleId, nextCourse);
      }
    },
    [articleId],
  );

  const runtime = liveCourse?.runtime || {};
  const scenes = liveCourse?.scenes || [];
  const teacher = liveCourse?.teacher || {};
  const progressPercent = scenes.length > 0
    ? Math.round(((runtime.completedSceneIds || []).length / scenes.length) * 100)
    : 0;
  const activeScene = scenes[runtime.activeSceneIndex || 0] || null;

  const updateRuntime = useCallback(
    async (updater) => {
      if (!liveCourse) return;
      const nextRuntime = updater(liveCourse.runtime || {});
      await persistCourse({
        ...liveCourse,
        runtime: {
          ...(liveCourse.runtime || {}),
          ...nextRuntime,
          totalScenes: liveCourse.scenes.length,
          lastViewedAt: Date.now(),
        },
      });
    },
    [liveCourse, persistCourse],
  );

  const handleJumpToScene = useCallback(
    (index) => {
      updateRuntime((current) => ({
        ...current,
        activeSceneIndex: index,
      }));
    },
    [updateRuntime],
  );

  const handleAdvanceScene = useCallback(async () => {
    if (!activeScene) return;
    await updateRuntime((current) => {
      const completed = new Set(current.completedSceneIds || []);
      completed.add(activeScene.id);
      const nextIndex = Math.min((current.activeSceneIndex || 0) + 1, scenes.length - 1);
      const allDone = completed.size >= scenes.length;
      return {
        ...current,
        activeSceneIndex: nextIndex,
        completedSceneIds: Array.from(completed),
        completedAt: allDone ? new Date().toISOString() : current.completedAt || null,
      };
    });
  }, [activeScene, scenes.length, updateRuntime]);

  const quizState = useMemo(() => {
    return activeScene ? runtime?.quiz?.[activeScene.id] || { answers: {} } : { answers: {} };
  }, [activeScene, runtime]);

  const handleQuizAnswer = useCallback(
    async (questionIndex, answer) => {
      if (!activeScene) return;
      await updateRuntime((current) => ({
        ...current,
        quiz: {
          ...(current.quiz || {}),
          [activeScene.id]: {
            ...((current.quiz || {})[activeScene.id] || {}),
            answers: {
              ...(((current.quiz || {})[activeScene.id] || {}).answers || {}),
              [questionIndex]: answer,
            },
          },
        },
      }));
    },
    [activeScene, updateRuntime],
  );

  const handleQuizSubmit = useCallback(async () => {
    if (!activeScene) return;
    const questions = activeScene.content?.questions || [];
    if (questions.length === 0) {
      await handleAdvanceScene();
      return;
    }
    const answers = quizState?.answers || {};
    const correct = questions.filter((question, index) => scoreQuestion(question, answers[index])).length;
    const score = Math.round((correct / questions.length) * 100);
    await updateRuntime((current) => ({
      ...current,
      quiz: {
        ...(current.quiz || {}),
        [activeScene.id]: {
          ...((current.quiz || {})[activeScene.id] || {}),
          answers,
          submitted: true,
          score,
        },
      },
    }));
  }, [activeScene, handleAdvanceScene, quizState?.answers, updateRuntime]);

  const outputState = useMemo(() => {
    return activeScene ? runtime?.output?.[activeScene.id] || { draft: "", status: "idle" } : { draft: "", status: "idle" };
  }, [activeScene, runtime]);

  const handleOutputDraftChange = useCallback(
    async (draft) => {
      if (!activeScene) return;
      await updateRuntime((current) => ({
        ...current,
        output: {
          ...(current.output || {}),
          [activeScene.id]: {
            ...((current.output || {})[activeScene.id] || {}),
            draft,
            status: "editing",
            error: null,
          },
        },
      }));
    },
    [activeScene, updateRuntime],
  );

  const handleOutputEvaluate = useCallback(async () => {
    if (!activeScene || !apiCall) return;
    const draft = String(outputState?.draft || "").trim();
    if (!draft) return;

    await updateRuntime((current) => ({
      ...current,
      output: {
        ...(current.output || {}),
        [activeScene.id]: {
          ...((current.output || {})[activeScene.id] || {}),
          draft,
          status: "evaluating",
          error: null,
        },
      },
    }));

    try {
      const response = await apiCall("/api/llm/writing/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          article_text: getPrimaryText(sourceTexts),
          writing_prompt: activeScene.content?.prompt || "Summarize the article in your own words.",
          user_response: draft,
          target_level: liveCourse?.target_level || "B1",
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || "写作反馈生成失败");
      }

      const payload = await response.json();
      await updateRuntime((current) => ({
        ...current,
        output: {
          ...(current.output || {}),
          [activeScene.id]: {
            ...((current.output || {})[activeScene.id] || {}),
            draft,
            status: "completed",
            evaluation: payload.evaluation,
            error: null,
          },
        },
      }));
    } catch (error) {
      await updateRuntime((current) => ({
        ...current,
        output: {
          ...(current.output || {}),
          [activeScene.id]: {
            ...((current.output || {})[activeScene.id] || {}),
            draft,
            status: "editing",
            error: error?.message || "写作反馈生成失败",
          },
        },
      }));
    }
  }, [activeScene, apiCall, liveCourse?.target_level, outputState?.draft, sourceTexts, updateRuntime]);

  if (!liveCourse || !activeScene) {
    return null;
  }

  const footer = (
    <div className="reading-classroom__footer-actions">
      <Button variant="ghost" onClick={onExit} className="gap-2">
        <ArrowLeft className="size-4" />
        返回材料
      </Button>
      {activeScene.type === "quiz" && (activeScene.content?.questions || []).length > 0 && quizState?.submitted ? (
        <Button onClick={handleAdvanceScene} className="gap-2">
          继续
          <ArrowRight className="size-4" />
        </Button>
      ) : null}
      {activeScene.type === "output" && outputState?.evaluation ? (
        <Button onClick={handleAdvanceScene} className="gap-2">
          收下反馈并继续
          <ArrowRight className="size-4" />
        </Button>
      ) : null}
      {!["quiz", "output"].includes(activeScene.type) ? (
        <Button onClick={handleAdvanceScene} className="gap-2">
          完成本场景
          <ArrowRight className="size-4" />
        </Button>
      ) : null}
      {activeScene.type === "quiz" && (activeScene.content?.questions || []).length === 0 ? (
        <Button onClick={handleAdvanceScene} className="gap-2">
          继续
          <ArrowRight className="size-4" />
        </Button>
      ) : null}
    </div>
  );

  return (
    <div className="reading-classroom">
      <aside className="reading-classroom__sidebar">
        <div className="reading-classroom__teacher-card">
          <div className="reading-classroom__teacher-badge">
            <GraduationCap className="size-5" />
          </div>
          <div>
            <p className="reading-classroom__teacher-role">Reading Classroom</p>
            <h1 className="reading-classroom__teacher-name">{teacher.name}</h1>
            <p className="reading-classroom__teacher-persona">{teacher.persona}</p>
          </div>
        </div>

        <Card className="reading-classroom__progress-card">
          <div className="reading-classroom__progress-head">
            <span>{liveCourse.article_title}</span>
            <Badge variant="outline">{liveCourse.target_level}</Badge>
          </div>
          <Progress value={progressPercent} className="reading-classroom__progress" />
          <p className="reading-classroom__muted">{progressPercent}% completed</p>
        </Card>

        <SceneRail scenes={scenes} runtime={runtime} onJumpToScene={handleJumpToScene} />
      </aside>

      <main className="reading-classroom__main">
        <div className="reading-classroom__stage">
          {activeScene.type === "intro" ? (
            <SceneShell scene={activeScene} teacher={teacher} footer={footer}>
              <IntroScene scene={activeScene} />
            </SceneShell>
          ) : null}

          {activeScene.type === "warmup" ? (
            <SceneShell scene={activeScene} teacher={teacher} footer={footer}>
              <WarmupScene scene={activeScene} />
            </SceneShell>
          ) : null}

          {activeScene.type === "close_reading" ? (
            <SceneShell scene={activeScene} teacher={teacher} footer={footer}>
              <CloseReadingScene scene={activeScene} />
            </SceneShell>
          ) : null}

          {activeScene.type === "explanation" ? (
            <SceneShell scene={activeScene} teacher={teacher} footer={footer}>
              <ExplanationScene scene={activeScene} />
            </SceneShell>
          ) : null}

          {activeScene.type === "quiz" ? (
            <SceneShell scene={activeScene} teacher={teacher} footer={footer}>
              <QuizScene
                scene={activeScene}
                quizState={quizState}
                onAnswer={handleQuizAnswer}
                onSubmit={handleQuizSubmit}
              />
            </SceneShell>
          ) : null}

          {activeScene.type === "output" ? (
            <SceneShell scene={activeScene} teacher={teacher} footer={footer}>
              <OutputScene
                scene={activeScene}
                outputState={outputState}
                onDraftChange={handleOutputDraftChange}
                onEvaluate={handleOutputEvaluate}
              />
            </SceneShell>
          ) : null}

          {activeScene.type === "wrap_up" ? (
            <SceneShell scene={activeScene} teacher={teacher} footer={footer}>
              <WrapUpScene scene={activeScene} runtime={runtime} />
            </SceneShell>
          ) : null}
        </div>
      </main>
    </div>
  );
}
