import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, GraduationCap, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { Badge, Button, Card, Progress, Textarea } from "../../../shared/ui";
import { normalizeReadingCourse } from "../readingCourse";
import { saveReadingCourseToRecord } from "../readingRewriteDB";
import { getReadingDerivedState } from "./readingDerivedState";
import { ProactiveCard } from "./ProactiveCard";
import { Roundtable } from "./Roundtable";
import { useReadingPlaybackEngine } from "./useReadingPlaybackEngine";

function scoreQuestion(question, answer) {
  if (!question) return false;
  if (question.type === "mcq") return answer === question.answer;
  if (question.type === "fill") return String(answer || "").trim().toLowerCase() === String(question.answer || "").trim().toLowerCase();
  if (question.type === "order") return JSON.stringify(answer || []) === JSON.stringify(question.correct_order || []);
  return false;
}

function renderSpotlightPanel(action, supportOpen, setSupportOpen) {
  if (!action?.panel) {
    return (
      <Card className="reading-classroom-v2__canvas-card reading-classroom-v2__canvas-card--empty">
        <p>The teacher will spotlight key material here as playback progresses.</p>
      </Card>
    );
  }

  const panel = action.panel;

  if (panel.kind === "bullet_list") {
    return (
      <Card className="reading-classroom-v2__canvas-card">
        <h3>{action.title}</h3>
        <div className="reading-classroom-v2__bullet-list">
          {(panel.items || []).map((item) => (
            <div key={item} className="reading-classroom-v2__bullet-item">
              <CheckCircle2 className="size-4" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (panel.kind === "keyword_grid") {
    return (
      <Card className="reading-classroom-v2__canvas-card">
        <h3>{action.title}</h3>
        <div className="reading-classroom-v2__keyword-grid">
          {(panel.keywords || []).map((item) => (
            <article key={item.word} className="reading-classroom-v2__keyword-card">
              <div className="reading-classroom-v2__keyword-top">
                <strong>{item.word}</strong>
                <Badge variant="outline">watch</Badge>
              </div>
              <p>{item.reason}</p>
              {item.tip ? <span>{item.tip}</span> : null}
            </article>
          ))}
        </div>
      </Card>
    );
  }

  if (panel.kind === "explanation_grid") {
    return (
      <Card className="reading-classroom-v2__canvas-card">
        <h3>{action.title}</h3>
        <div className="reading-classroom-v2__explain-grid">
          {(panel.points || []).map((point) => (
            <article key={point.label} className="reading-classroom-v2__explain-card">
              <strong>{point.label}</strong>
              <p>{point.explanation}</p>
              {point.example ? <span>{point.example}</span> : null}
            </article>
          ))}
        </div>
      </Card>
    );
  }

  if (panel.kind === "reading_segment") {
    const key = action.id;
    const segment = panel.segment || {};
    return (
      <Card className="reading-classroom-v2__canvas-card">
        <div className="reading-classroom-v2__segment-head">
          <div>
            <Badge variant="outline">Main Reading</Badge>
            <h3>{segment.heading || action.title}</h3>
          </div>
          <Badge variant="outline">i+1 first</Badge>
        </div>
        {panel.aside ? <p className="reading-classroom-v2__segment-focus">{panel.aside}</p> : null}
        <div className="reading-classroom-v2__segment-pane reading-classroom-v2__segment-pane--primary">
          <span>Rewritten</span>
          <p>{segment.rewritten_text}</p>
        </div>
        {segment.original_text ? (
          <div className="reading-classroom-v2__segment-support">
            <Button variant="ghost" size="sm" className="reading-classroom-v2__support-toggle" onClick={() => setSupportOpen((current) => ({ ...current, [key]: !current[key] }))}>
              {supportOpen[key] ? "Hide original support" : "Show original support"}
            </Button>
            {supportOpen[key] ? (
              <div className="reading-classroom-v2__segment-pane">
                <span>Original Support</span>
                <p>{segment.original_text}</p>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="reading-classroom-v2__segment-notes">
          {segment.question ? <strong>{segment.question}</strong> : null}
        </div>
      </Card>
    );
  }

  return (
    <Card className="reading-classroom-v2__canvas-card">
      <h3>{action.title}</h3>
      <p>Spotlight content ready.</p>
    </Card>
  );
}

export function ReadingClassroom({ articleId, course, sourceTexts, apiCall, onExit }) {
  const [liveCourse, setLiveCourse] = useState(() => normalizeReadingCourse(course));
  const courseRef = useRef(liveCourse);
  const [supportOpen, setSupportOpen] = useState({});

  useEffect(() => {
    const normalized = normalizeReadingCourse(course);
    setLiveCourse(normalized);
    courseRef.current = normalized;
  }, [course]);

  const persistCourse = useCallback(async (nextCourse) => {
    const normalized = normalizeReadingCourse(nextCourse);
    setLiveCourse(normalized);
    courseRef.current = normalized;
    if (articleId && normalized) {
      await saveReadingCourseToRecord(articleId, normalized);
    }
  }, [articleId]);

  const persistRuntime = useCallback(async (runtimePatch) => {
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
  }, [persistCourse]);

  const { playbackState, actions: playbackActions } = useReadingPlaybackEngine({
    course: liveCourse,
    onPersistPlayback: persistRuntime,
  });

  const runtime = liveCourse?.runtime || {};
  const derived = useMemo(() => getReadingDerivedState(liveCourse, playbackState, runtime), [liveCourse, playbackState, runtime]);

  const activeScene = derived?.activeScene || null;
  const activeSceneId = activeScene?.id;
  const quizState = activeSceneId ? runtime.quiz?.[activeSceneId] || { answers: {} } : { answers: {} };
  const outputState = activeSceneId ? runtime.output?.[activeSceneId] || { draft: "", status: "idle" } : { draft: "", status: "idle" };
  const discussionState = activeSceneId ? runtime.discussion?.[activeSceneId] || { draft: "", messages: [], status: "idle", error: null } : { draft: "", messages: [], status: "idle", error: null };

  const updateRuntime = useCallback(async (updater) => {
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
  }, [persistCourse]);

  const markSceneCompleteAndAdvance = useCallback(async () => {
    if (!activeScene) return;
    await updateRuntime((current) => {
      const completed = new Set(current.completedSceneIds || []);
      completed.add(activeScene.id);
      const nextIndex = Math.min((current.activeSceneIndex || 0) + 1, (liveCourse?.scenes || []).length - 1);
      return {
        ...current,
        completedSceneIds: Array.from(completed),
        activeSceneIndex: nextIndex,
        completedAt: completed.size >= (liveCourse?.scenes || []).length ? new Date().toISOString() : current.completedAt || null,
      };
    });
    playbackActions.goToScene(Math.min((runtime.activeSceneIndex || 0) + 1, (liveCourse?.scenes || []).length - 1), liveCourse?.scenes?.[Math.min((runtime.activeSceneIndex || 0) + 1, (liveCourse?.scenes || []).length - 1)]?.id);
  }, [activeScene, liveCourse?.scenes, playbackActions, runtime.activeSceneIndex, updateRuntime]);

  const setQuizAnswer = async (questionIndex, answer) => activeSceneId && updateRuntime((current) => ({ ...current, quiz: { ...(current.quiz || {}), [activeSceneId]: { ...((current.quiz || {})[activeSceneId] || {}), answers: { ...(((current.quiz || {})[activeSceneId] || {}).answers || {}), [questionIndex]: answer } } } }));
  const submitQuiz = async () => {
    if (!activeSceneId || !activeScene?.task) return;
    const questions = activeScene.task.questions || [];
    const answers = quizState.answers || {};
    const score = questions.length ? Math.round((questions.filter((question, index) => scoreQuestion(question, answers[index])).length / questions.length) * 100) : 100;
    await updateRuntime((current) => ({ ...current, quiz: { ...(current.quiz || {}), [activeSceneId]: { ...((current.quiz || {})[activeSceneId] || {}), answers, submitted: true, score } } }));
  };

  const setOutputDraft = async (draft) => activeSceneId && updateRuntime((current) => ({ ...current, output: { ...(current.output || {}), [activeSceneId]: { ...((current.output || {})[activeSceneId] || {}), draft, status: "editing", error: null } } }));
  const evaluateOutput = async () => {
    if (!activeSceneId || !apiCall || !String(outputState.draft || "").trim()) return;
    const draft = String(outputState.draft).trim();
    await updateRuntime((current) => ({ ...current, output: { ...(current.output || {}), [activeSceneId]: { ...((current.output || {})[activeSceneId] || {}), draft, status: "evaluating", error: null } } }));
    try {
      const response = await apiCall("/api/llm/writing/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          article_text: sourceTexts?.rewrittenText || sourceTexts?.originalText || "",
          writing_prompt: activeScene?.task?.prompt || "Summarize the article in your own words.",
          user_response: draft,
          target_level: liveCourse?.target_level || "B1",
        }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail || "写作反馈生成失败");
      const payload = await response.json();
      await updateRuntime((current) => ({ ...current, output: { ...(current.output || {}), [activeSceneId]: { ...((current.output || {})[activeSceneId] || {}), draft, status: "completed", evaluation: payload.evaluation, error: null } } }));
    } catch (error) {
      await updateRuntime((current) => ({ ...current, output: { ...(current.output || {}), [activeSceneId]: { ...((current.output || {})[activeSceneId] || {}), draft, status: "editing", error: error?.message || "写作反馈生成失败" } } }));
    }
  };

  const setDiscussionDraft = async (draft) => activeSceneId && updateRuntime((current) => ({ ...current, discussion: { ...(current.discussion || {}), [activeSceneId]: { ...((current.discussion || {})[activeSceneId] || {}), draft, error: null } } }));
  const sendDiscussion = async (preset = "") => {
    if (!activeSceneId || !apiCall) return;
    const draft = String(preset || discussionState.draft || "").trim();
    if (!draft) return;
    playbackActions.enterLive(activeSceneId);
    const nextMessages = [...(discussionState.messages || []), { role: "user", content: draft }];
    await updateRuntime((current) => ({ ...current, discussion: { ...(current.discussion || {}), [activeSceneId]: { ...((current.discussion || {})[activeSceneId] || {}), draft: "", messages: nextMessages, status: "loading", error: null } } }));
    try {
      const response = await apiCall("/api/llm/reading-course/discussion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ course: courseRef.current, scene_id: activeSceneId, message: draft, history: nextMessages }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail || "讨论回复生成失败");
      const payload = await response.json();
      await updateRuntime((current) => ({ ...current, discussion: { ...(current.discussion || {}), [activeSceneId]: { ...((current.discussion || {})[activeSceneId] || {}), messages: [...nextMessages, { role: "assistant", content: payload.reply }], status: "idle", error: null, draft: "" } } }));
    } catch (error) {
      await updateRuntime((current) => ({ ...current, discussion: { ...(current.discussion || {}), [activeSceneId]: { ...((current.discussion || {})[activeSceneId] || {}), messages: nextMessages, status: "idle", error: error?.message || "讨论回复生成失败", draft } } }));
    }
  };

  if (!derived || !activeScene) return null;

  const shouldShowDiscussionCard =
    derived.isLiveMode ||
    derived.currentVisibleAction?.type === "discussion";

  const spotlightContent = derived.taskAction?.type === "quiz"
    ? (
      <Card className="reading-classroom-v2__canvas-card">
        <div className="reading-classroom-v2__task-head"><h3>理解检查</h3><Badge variant="outline">{(activeScene.task?.questions || []).length} questions</Badge></div>
        <p className="reading-classroom-v2__task-copy">{activeScene.task?.instructions}</p>
        <div className="reading-classroom-v2__task-stack">
          {(activeScene.task?.questions || []).map((question, index) => (
            <article key={`${activeScene.id}-${index}`} className="reading-classroom-v2__question">
              <div className="reading-classroom-v2__question-top"><Badge variant="outline">Q{index + 1}</Badge><span>{question.type}</span></div>
              <h4>{question.question || question.sentence}</h4>
              {question.type === "mcq" ? <div className="reading-classroom-v2__option-list">{(question.options || []).map((option) => <button key={option} type="button" className={`reading-classroom-v2__option ${quizState.answers?.[index] === option ? "reading-classroom-v2__option--selected" : ""}`} onClick={() => setQuizAnswer(index, option)}>{option}</button>)}</div> : null}
              {question.type === "fill" ? <Textarea value={quizState.answers?.[index] || ""} onChange={(event) => setQuizAnswer(index, event.target.value)} placeholder="Type your answer" className="reading-classroom-v2__textarea" /> : null}
              {question.type === "order" ? <div className="reading-classroom-v2__option-list">{(question.sentences || []).map((sentence, sentenceIndex) => { const current = quizState.answers?.[index] || []; const present = current.includes(sentenceIndex); const nextValue = present ? current.filter((item) => item !== sentenceIndex) : [...current, sentenceIndex]; return <button key={`${sentence}-${sentenceIndex}`} type="button" className={`reading-classroom-v2__option ${present ? "reading-classroom-v2__option--selected" : ""}`} onClick={() => setQuizAnswer(index, nextValue)}><strong>{present ? current.indexOf(sentenceIndex) + 1 : "?"}</strong><span>{sentence}</span></button>; })}</div> : null}
            </article>
          ))}
        </div>
        <div className="reading-classroom-v2__task-actions"><Button onClick={submitQuiz}>提交理解检查</Button>{typeof quizState.score === "number" ? <span>Score {quizState.score}%</span> : null}</div>
      </Card>
    )
    : derived.taskAction?.type === "output"
      ? (
        <Card className="reading-classroom-v2__canvas-card">
          <div className="reading-classroom-v2__task-head"><h3>你的输出</h3><Badge variant="outline">Writing</Badge></div>
          <p className="reading-classroom-v2__task-copy">{activeScene.task?.prompt}</p>
          {activeScene.task?.guidance ? <p className="reading-classroom-v2__task-copy reading-classroom-v2__task-copy--muted">{activeScene.task.guidance}</p> : null}
          <div className="reading-classroom-v2__bullet-list">{(activeScene.task?.checklist || []).map((item) => <div key={item} className="reading-classroom-v2__bullet-item"><CheckCircle2 className="size-4" /><span>{item}</span></div>)}</div>
          <Textarea value={outputState.draft || ""} onChange={(event) => setOutputDraft(event.target.value)} placeholder="Write your response here..." className="reading-classroom-v2__textarea reading-classroom-v2__textarea--large" />
          <div className="reading-classroom-v2__task-actions"><Button onClick={evaluateOutput} disabled={!String(outputState.draft || "").trim() || outputState.status === "evaluating"}>{outputState.status === "evaluating" ? "Generating feedback..." : "提交并获取反馈"}</Button>{outputState.error ? <span className="reading-classroom-v2__error">{outputState.error}</span> : null}</div>
          {outputState.evaluation ? <div className="reading-classroom-v2__feedback-grid"><article className="reading-classroom-v2__feedback-card"><span>Writing Score</span><strong>{outputState.evaluation.score ?? "--"}</strong><p>{outputState.evaluation.feedback}</p></article></div> : null}
        </Card>
      )
      : shouldShowDiscussionCard && derived.discussionAction
        ? <ProactiveCard action={derived.discussionAction} liveActive={derived.isLiveMode} onJoin={sendDiscussion} onSkip={() => playbackActions.exitLive("paused")} />
        : renderSpotlightPanel(derived.spotlightAction, supportOpen, setSupportOpen);

  return (
    <div className="reading-classroom-v2">
      <aside className="reading-classroom-v2__sidebar">
        <Card className="reading-classroom-v2__coach">
          <div className="reading-classroom-v2__coach-badge"><GraduationCap className="size-5" /></div>
          <div><p>Reading Classroom Engine</p><h1>{liveCourse.cast?.teacher?.name}</h1><span>{liveCourse.cast?.teacher?.persona}</span></div>
        </Card>
        <Card className="reading-classroom-v2__overview">
          <div className="reading-classroom-v2__overview-head"><div><span>{liveCourse.courseMeta?.coverKicker}</span><h2>{liveCourse.article_title}</h2></div><Badge variant="outline">{liveCourse.target_level}</Badge></div>
          <p>{liveCourse.courseMeta?.summary}</p>
          <Progress value={derived.progressPercent} />
          <div className="reading-classroom-v2__overview-foot"><span>{derived.progressPercent}% completed</span><span>{liveCourse.courseMeta?.estimatedMinutes} min</span></div>
        </Card>
        <div className="reading-classroom-v2__rail">
          {derived.scenes.map((scene, index) => (
            <button key={scene.id} type="button" className={`reading-classroom-v2__rail-item ${index === playbackState.activeSceneIndex ? "reading-classroom-v2__rail-item--active" : ""}`} onClick={() => playbackActions.goToScene(index, scene.id)}>
              <strong>{scene.title}</strong>
              <span>{scene.goal}</span>
            </button>
          ))}
        </div>
      </aside>

      <main className="reading-classroom-v2__main">
        <header className="reading-classroom-v2__header">
          <div><Badge variant="outline">{playbackState.activeSceneIndex + 1} / {derived.scenes.length}</Badge><h2>{activeScene.title}</h2><p>{activeScene.goal}</p></div>
          <div className="reading-classroom-v2__header-actions">
            <Button variant="ghost" onClick={() => playbackActions.toggleTTS()} className="gap-2">{playbackState.ttsEnabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}{playbackState.ttsEnabled ? "TTS On" : "TTS Off"}</Button>
            <Button variant="ghost" onClick={onExit} className="gap-2"><ArrowLeft className="size-4" />返回材料</Button>
          </div>
        </header>

        <section className="reading-classroom-v2__stage">
          <div className="reading-classroom-v2__canvas-shell">
            <div className="reading-classroom-v2__canvas">
              <div className="reading-classroom-v2__canvas-stage">{spotlightContent}</div>
              <div className="reading-classroom-v2__canvas-roundtable">
                <Roundtable messages={derived.roundtableMessages} activeSpeechActionId={playbackState.activeSpeechActionId} />
                {derived.discussionAction ? (
                  <div className="reading-classroom-v2__discussion-compose">
                    <Textarea value={discussionState.draft || ""} onChange={(event) => setDiscussionDraft(event.target.value)} placeholder="Ask one focused question about this scene..." className="reading-classroom-v2__textarea" />
                    <div className="reading-classroom-v2__task-actions">
                      <Button onClick={() => sendDiscussion()} disabled={!String(discussionState.draft || "").trim() || discussionState.status === "loading"}>{discussionState.status === "loading" ? "Thinking..." : "Ask"}</Button>
                      {derived.isLiveMode ? <Button variant="ghost" onClick={() => playbackActions.exitLive("paused")}>Finish discussion</Button> : null}
                    </div>
                    {discussionState.error ? <p className="reading-classroom-v2__error">{discussionState.error}</p> : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <footer className="reading-classroom-v2__footer">
            <div className="reading-classroom-v2__footer-left">
              {derived.canStart ? <Button onClick={playbackActions.start} className="gap-2"><Play className="size-4" />Play scene</Button> : null}
              {derived.canPause ? <Button onClick={playbackActions.pause} variant="outline" className="gap-2"><Pause className="size-4" />Pause</Button> : null}
              {derived.canResume ? <Button onClick={playbackActions.resume} variant="outline" className="gap-2"><Play className="size-4" />Resume</Button> : null}
            </div>
            <div className="reading-classroom-v2__footer-right">
              {derived.hasMoreActions && !derived.isPlaying ? <Button variant="ghost" onClick={() => playbackActions.revealNext(activeScene.id, derived.sceneActions.length)}>Reveal next action</Button> : null}
              {derived.canAdvanceScene ? <Button onClick={markSceneCompleteAndAdvance} className="gap-2">{playbackState.activeSceneIndex === derived.scenes.length - 1 ? "完成课程" : "进入下一场景"}<ArrowRight className="size-4" /></Button> : <span className="reading-classroom-v2__footer-note">{derived.isLiveMode ? "Finish the live discussion to continue." : "Playback or current task is still in progress."}</span>}
            </div>
          </footer>
        </section>
      </main>
    </div>
  );
}
