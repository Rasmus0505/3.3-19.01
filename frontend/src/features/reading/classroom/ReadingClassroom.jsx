import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronRight, GraduationCap, Mic, MicOff } from "lucide-react";
import { Badge, Button, Card, Progress, Textarea } from "../../../shared/ui";
import { cn } from "../../../lib/utils";
import { normalizeReadingCourse } from "../readingCourse";
import { saveReadingCourseToRecord } from "../readingRewriteDB";

function scoreQuestion(question, answer) {
  if (!question) return false;
  if (question.type === "mcq") return answer === question.answer;
  if (question.type === "fill") return String(answer || "").trim().toLowerCase() === String(question.answer || "").trim().toLowerCase();
  if (question.type === "order") return JSON.stringify(answer || []) === JSON.stringify(question.correct_order || []);
  return false;
}

function tag(role) {
  if (role === "assistant") return "Assistant";
  if (role === "student") return "Student";
  if (role === "user") return "You";
  return "Teacher";
}

function sceneLabel(type) {
  return {
    entry: "进入课堂",
    preview: "预热与关键词",
    guided_reading: "老师带读",
    deep_explain: "讲透难点",
    checkpoint: "理解检查",
    discussion: "课堂讨论",
    output: "你的输出",
    wrap_up: "收束与下一步",
  }[type] || "Reading";
}

export function ReadingClassroom({ articleId, course, sourceTexts, apiCall, onExit }) {
  const [liveCourse, setLiveCourse] = useState(() => normalizeReadingCourse(course));
  const courseRef = useRef(liveCourse);
  const [supportOpen, setSupportOpen] = useState({});
  const [speechId, setSpeechId] = useState(null);
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    const normalized = normalizeReadingCourse(course);
    setLiveCourse(normalized);
    courseRef.current = normalized;
  }, [course]);

  useEffect(() => () => {
    if (canSpeak) window.speechSynthesis.cancel();
  }, [canSpeak]);

  const persist = useCallback(async (nextCourse) => {
    const normalized = normalizeReadingCourse(nextCourse);
    setLiveCourse(normalized);
    courseRef.current = normalized;
    if (articleId && normalized) await saveReadingCourseToRecord(articleId, normalized);
  }, [articleId]);

  const updateRuntime = useCallback(async (updater) => {
    const current = courseRef.current;
    if (!current) return;
    const nextRuntime = updater(current.runtime || {});
    await persist({ ...current, runtime: { ...(current.runtime || {}), ...nextRuntime, totalScenes: current.scenes.length, lastViewedAt: Date.now() } });
  }, [persist]);

  const scenes = liveCourse?.scenes || [];
  const runtime = liveCourse?.runtime || {};
  const activeIndex = runtime.activeSceneIndex || 0;
  const activeScene = scenes[activeIndex];
  const revealedCount = activeScene ? Math.max(runtime.revealCountsByScene?.[activeScene.id] || 0, activeIndex === 0 ? 1 : 0) : 0;
  const allBeatsRevealed = activeScene ? revealedCount >= activeScene.beats.length : false;
  const quizState = activeScene ? runtime.quiz?.[activeScene.id] || { answers: {} } : { answers: {} };
  const outputState = activeScene ? runtime.output?.[activeScene.id] || { draft: "", status: "idle" } : { draft: "", status: "idle" };
  const discussionState = activeScene ? runtime.discussion?.[activeScene.id] || { draft: "", messages: [], status: "idle", error: null } : { draft: "", messages: [], status: "idle", error: null };
  const progress = scenes.length ? Math.round(((runtime.completedSceneIds || []).length / scenes.length) * 100) : 0;

  const canAdvance = useMemo(() => {
    if (!activeScene || !allBeatsRevealed) return false;
    if (activeScene.type === "checkpoint") return !(activeScene.task?.questions || []).length || quizState.submitted;
    if (activeScene.type === "output") return Boolean(outputState.evaluation);
    return true;
  }, [activeScene, allBeatsRevealed, outputState.evaluation, quizState.submitted]);

  const jumpToScene = useCallback(async (index) => {
    const scene = scenes[index];
    if (!scene) return;
    await updateRuntime((current) => ({ ...current, activeSceneIndex: index, revealCountsByScene: { ...(current.revealCountsByScene || {}), [scene.id]: Math.max(1, Number(current.revealCountsByScene?.[scene.id]) || 0) } }));
  }, [scenes, updateRuntime]);

  const revealNextBeat = useCallback(async () => {
    if (!activeScene) return;
    await updateRuntime((current) => ({ ...current, revealCountsByScene: { ...(current.revealCountsByScene || {}), [activeScene.id]: Math.min(activeScene.beats.length, (current.revealCountsByScene?.[activeScene.id] || 0) + 1) } }));
  }, [activeScene, updateRuntime]);

  const advanceScene = useCallback(async () => {
    if (!activeScene) return;
    await updateRuntime((current) => {
      const completed = new Set(current.completedSceneIds || []);
      completed.add(activeScene.id);
      const nextIndex = Math.min((current.activeSceneIndex || 0) + 1, scenes.length - 1);
      const nextScene = scenes[nextIndex];
      return { ...current, completedSceneIds: Array.from(completed), activeSceneIndex: nextIndex, revealCountsByScene: { ...(current.revealCountsByScene || {}), ...(nextScene ? { [nextScene.id]: Math.max(1, Number(current.revealCountsByScene?.[nextScene.id]) || 0) } : {}) }, completedAt: completed.size >= scenes.length ? new Date().toISOString() : current.completedAt || null };
    });
  }, [activeScene, scenes, updateRuntime]);

  const speak = useCallback((id, text) => {
    if (!canSpeak || !text) return;
    if (speechId === id) {
      window.speechSynthesis.cancel();
      setSpeechId(null);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.96;
    utterance.onend = () => setSpeechId(null);
    utterance.onerror = () => setSpeechId(null);
    setSpeechId(id);
    window.speechSynthesis.speak(utterance);
  }, [canSpeak, speechId]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const tagName = event.target?.tagName;
      if (tagName === "TEXTAREA" || tagName === "INPUT") return;
      if (event.key === "ArrowRight" || event.key === " ") {
        event.preventDefault();
        if (!allBeatsRevealed) revealNextBeat();
        else if (canAdvance) advanceScene();
      }
      if (event.key === "ArrowLeft" && activeIndex > 0) {
        event.preventDefault();
        jumpToScene(activeIndex - 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, advanceScene, allBeatsRevealed, canAdvance, jumpToScene, revealNextBeat]);

  const setQuizAnswer = async (questionIndex, answer) => activeScene && updateRuntime((current) => ({ ...current, quiz: { ...(current.quiz || {}), [activeScene.id]: { ...((current.quiz || {})[activeScene.id] || {}), answers: { ...(((current.quiz || {})[activeScene.id] || {}).answers || {}), [questionIndex]: answer } } } }));
  const submitQuiz = async () => {
    if (!activeScene) return;
    const questions = activeScene.task?.questions || [];
    const answers = quizState.answers || {};
    const score = questions.length ? Math.round((questions.filter((question, index) => scoreQuestion(question, answers[index])).length / questions.length) * 100) : 100;
    await updateRuntime((current) => ({ ...current, quiz: { ...(current.quiz || {}), [activeScene.id]: { ...((current.quiz || {})[activeScene.id] || {}), answers, submitted: true, score } } }));
  };

  const setOutputDraft = async (draft) => activeScene && updateRuntime((current) => ({ ...current, output: { ...(current.output || {}), [activeScene.id]: { ...((current.output || {})[activeScene.id] || {}), draft, status: "editing", error: null } } }));
  const evaluateOutput = async () => {
    if (!activeScene || !apiCall || !String(outputState.draft || "").trim()) return;
    const draft = String(outputState.draft).trim();
    await updateRuntime((current) => ({ ...current, output: { ...(current.output || {}), [activeScene.id]: { ...((current.output || {})[activeScene.id] || {}), draft, status: "evaluating", error: null } } }));
    try {
      const response = await apiCall("/api/llm/writing/evaluate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ article_text: sourceTexts?.rewrittenText || sourceTexts?.originalText || "", writing_prompt: activeScene.task?.prompt || "Summarize the article in your own words.", user_response: draft, target_level: liveCourse?.target_level || "B1" }) });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail || "写作反馈生成失败");
      const payload = await response.json();
      await updateRuntime((current) => ({ ...current, output: { ...(current.output || {}), [activeScene.id]: { ...((current.output || {})[activeScene.id] || {}), draft, status: "completed", evaluation: payload.evaluation, error: null } } }));
    } catch (error) {
      await updateRuntime((current) => ({ ...current, output: { ...(current.output || {}), [activeScene.id]: { ...((current.output || {})[activeScene.id] || {}), draft, status: "editing", error: error?.message || "写作反馈生成失败" } } }));
    }
  };

  const setDiscussionDraft = async (draft) => activeScene && updateRuntime((current) => ({ ...current, discussion: { ...(current.discussion || {}), [activeScene.id]: { ...((current.discussion || {})[activeScene.id] || {}), draft, error: null } } }));
  const sendDiscussion = async (preset = "") => {
    if (!activeScene || !apiCall) return;
    const draft = String(preset || discussionState.draft || "").trim();
    if (!draft) return;
    const nextMessages = [...(discussionState.messages || []), { role: "user", content: draft }];
    await updateRuntime((current) => ({ ...current, discussion: { ...(current.discussion || {}), [activeScene.id]: { ...((current.discussion || {})[activeScene.id] || {}), draft: "", messages: nextMessages, status: "loading", error: null } } }));
    try {
      const response = await apiCall("/api/llm/reading-course/discussion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ course: courseRef.current, scene_id: activeScene.id, message: draft, history: nextMessages }) });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail || "讨论回复生成失败");
      const payload = await response.json();
      await updateRuntime((current) => ({ ...current, discussion: { ...(current.discussion || {}), [activeScene.id]: { ...((current.discussion || {})[activeScene.id] || {}), messages: [...nextMessages, { role: "assistant", content: payload.reply }], status: "idle", error: null, draft: "" } } }));
    } catch (error) {
      await updateRuntime((current) => ({ ...current, discussion: { ...(current.discussion || {}), [activeScene.id]: { ...((current.discussion || {})[activeScene.id] || {}), messages: nextMessages, status: "idle", error: error?.message || "讨论回复生成失败", draft } } }));
    }
  };

  if (!liveCourse || !activeScene) return null;

  return (
    <div className="reading-classroom-v2">
      <aside className="reading-classroom-v2__sidebar">
        <Card className="reading-classroom-v2__coach"><div className="reading-classroom-v2__coach-badge"><GraduationCap className="size-5" /></div><div><p>Reading Classroom</p><h1>{liveCourse.cast?.teacher?.name}</h1><span>{liveCourse.cast?.teacher?.persona}</span></div></Card>
        <Card className="reading-classroom-v2__overview"><div className="reading-classroom-v2__overview-head"><div><span>{liveCourse.courseMeta?.coverKicker}</span><h2>{liveCourse.article_title}</h2></div><Badge variant="outline">{liveCourse.target_level}</Badge></div><p>{liveCourse.courseMeta?.summary}</p><Progress value={progress} /><div className="reading-classroom-v2__overview-foot"><span>{progress}% completed</span><span>{liveCourse.courseMeta?.estimatedMinutes} min</span></div></Card>
        <div className="reading-classroom-v2__rail">{scenes.map((scene, index) => <button key={scene.id} type="button" className={cn("reading-classroom-v2__rail-item", index === activeIndex && "reading-classroom-v2__rail-item--active")} onClick={() => jumpToScene(index)}><strong>{sceneLabel(scene.type)}</strong><span>{scene.goal}</span></button>)}</div>
        <div className="reading-classroom-v2__hint"><span>Keyboard</span><p>`Space / Right` reveal or continue, `Left` go back.</p></div>
      </aside>
      <main className="reading-classroom-v2__main">
        <header className="reading-classroom-v2__header"><div><Badge variant="outline">{activeIndex + 1} / {scenes.length}</Badge><h2>{activeScene.title}</h2><p>{activeScene.goal}</p></div><Button variant="ghost" onClick={onExit} className="gap-2"><ArrowLeft className="size-4" />返回材料</Button></header>
        <section className="reading-classroom-v2__stage">
          <div className="reading-classroom-v2__content">
            {activeScene.beats.slice(0, revealedCount).map((beat) => (
              <Card key={beat.id} className={cn("reading-classroom-v2__beat", beat.type === "reading_segment" && "reading-classroom-v2__beat--segment")}>
                <div className="reading-classroom-v2__beat-head"><span className={cn("reading-classroom-v2__speaker", `reading-classroom-v2__speaker--${beat.speaker || "teacher"}`)}>{tag(beat.speaker)}</span>{canSpeak && beat.text ? <Button variant="ghost" size="sm" className="reading-classroom-v2__voice-btn" onClick={() => speak(beat.id, beat.text)}>{speechId === beat.id ? <MicOff className="size-3.5" /> : <Mic className="size-3.5" />}{speechId === beat.id ? "Stop" : "Play"}</Button> : null}</div>
                {beat.title ? <h3 className="reading-classroom-v2__beat-title">{beat.title}</h3> : null}
                {beat.text ? <p className="reading-classroom-v2__beat-copy">{beat.text}</p> : null}
                {beat.items?.length ? <div className="reading-classroom-v2__bullet-list">{beat.items.map((item) => <div key={item} className="reading-classroom-v2__bullet-item"><CheckCircle2 className="size-4" /><span>{item}</span></div>)}</div> : null}
                {beat.keywords?.length ? <div className="reading-classroom-v2__keyword-grid">{beat.keywords.map((item) => <article key={item.word} className="reading-classroom-v2__keyword-card"><div className="reading-classroom-v2__keyword-top"><strong>{item.word}</strong><Badge variant="outline">watch</Badge></div><p>{item.reason}</p><span>{item.tip}</span></article>)}</div> : null}
                {beat.points?.length ? <div className="reading-classroom-v2__explain-grid">{beat.points.map((point) => <article key={point.label} className="reading-classroom-v2__explain-card"><strong>{point.label}</strong><p>{point.explanation}</p>{point.example ? <span>{point.example}</span> : null}</article>)}</div> : null}
                {beat.messages?.length ? <div className="reading-classroom-v2__conversation">{beat.messages.map((message, index) => <div key={`${message.speaker}-${index}`} className={cn("reading-classroom-v2__message", `reading-classroom-v2__message--${message.speaker || "teacher"}`)}><span className={cn("reading-classroom-v2__speaker", `reading-classroom-v2__speaker--${message.speaker || "teacher"}`)}>{tag(message.speaker)}</span><p>{message.text}</p></div>)}</div> : null}
                {beat.segment ? <div className="reading-classroom-v2__segment-main"><p className="reading-classroom-v2__segment-focus">{beat.aside}</p><div className="reading-classroom-v2__segment-pane reading-classroom-v2__segment-pane--primary"><span>Main Reading</span><p>{beat.segment.rewritten_text}</p></div>{beat.segment.original_text ? <div className="reading-classroom-v2__segment-support"><Button variant="ghost" size="sm" className="reading-classroom-v2__support-toggle" onClick={() => setSupportOpen((current) => ({ ...current, [beat.id]: !current[beat.id] }))}>{supportOpen[beat.id] ? "Hide original support" : "Show original support"}<ChevronRight className={cn("size-4 transition", supportOpen[beat.id] && "rotate-90")} /></Button>{supportOpen[beat.id] ? <div className="reading-classroom-v2__segment-pane"><span>Original Support</span><p>{beat.segment.original_text}</p></div> : null}</div> : null}<div className="reading-classroom-v2__segment-notes">{beat.segment.teacher_note ? <p>{beat.segment.teacher_note}</p> : null}{beat.cta ? <strong>{beat.cta}</strong> : null}</div></div> : null}
              </Card>
            ))}

            {allBeatsRevealed && activeScene.type === "checkpoint" ? <Card className="reading-classroom-v2__task"><div className="reading-classroom-v2__task-head"><h3>理解检查</h3><Badge variant="outline">{(activeScene.task?.questions || []).length} questions</Badge></div><p className="reading-classroom-v2__task-copy">{activeScene.task?.instructions}</p><div className="reading-classroom-v2__task-stack">{(activeScene.task?.questions || []).map((question, index) => <article key={`${activeScene.id}-${index}`} className="reading-classroom-v2__question"><div className="reading-classroom-v2__question-top"><Badge variant="outline">Q{index + 1}</Badge><span>{question.type}</span></div><h4>{question.question || question.sentence}</h4>{question.type === "mcq" ? <div className="reading-classroom-v2__option-list">{(question.options || []).map((option) => <button key={option} type="button" className={cn("reading-classroom-v2__option", quizState.answers?.[index] === option && "reading-classroom-v2__option--selected")} onClick={() => setQuizAnswer(index, option)}>{option}</button>)}</div> : null}{question.type === "fill" ? <Textarea value={quizState.answers?.[index] || ""} onChange={(event) => setQuizAnswer(index, event.target.value)} placeholder="Type your answer" className="reading-classroom-v2__textarea" /> : null}</article>)}</div><div className="reading-classroom-v2__task-actions"><Button onClick={submitQuiz}>提交理解检查</Button>{typeof quizState.score === "number" ? <span>Score {quizState.score}%</span> : null}</div></Card> : null}

            {allBeatsRevealed && activeScene.type === "discussion" ? <Card className="reading-classroom-v2__task"><div className="reading-classroom-v2__task-head"><h3>继续追问</h3><Badge variant="outline">Live follow-up</Badge></div><div className="reading-classroom-v2__task-stack">{(discussionState.messages || []).map((message, index) => <div key={`${message.role}-${index}`} className={cn("reading-classroom-v2__message", `reading-classroom-v2__message--${message.role}`)}><span className={cn("reading-classroom-v2__speaker", `reading-classroom-v2__speaker--${message.role === "assistant" ? "teacher" : "user"}`)}>{message.role === "assistant" ? "Teacher" : "You"}</span><p>{message.content}</p></div>)}{discussionState.error ? <p className="reading-classroom-v2__error">{discussionState.error}</p> : null}</div><div className="reading-classroom-v2__suggestions">{(activeScene.liveHook?.suggestedQuestions || []).map((item) => <button key={item} type="button" className="reading-classroom-v2__suggestion" onClick={() => sendDiscussion(item)}>{item}</button>)}</div><div className="reading-classroom-v2__discussion-compose"><Textarea value={discussionState.draft || ""} onChange={(event) => setDiscussionDraft(event.target.value)} placeholder="Ask one focused question about this scene..." className="reading-classroom-v2__textarea" /><Button onClick={() => sendDiscussion()} disabled={!String(discussionState.draft || "").trim() || discussionState.status === "loading"}>{discussionState.status === "loading" ? "Thinking..." : "Ask"}</Button></div></Card> : null}

            {allBeatsRevealed && activeScene.type === "output" ? <Card className="reading-classroom-v2__task"><div className="reading-classroom-v2__task-head"><h3>你的输出</h3><Badge variant="outline">Writing</Badge></div><p className="reading-classroom-v2__task-copy">{activeScene.task?.prompt}</p>{activeScene.task?.guidance ? <p className="reading-classroom-v2__task-copy reading-classroom-v2__task-copy--muted">{activeScene.task.guidance}</p> : null}<div className="reading-classroom-v2__bullet-list">{(activeScene.task?.checklist || []).map((item) => <div key={item} className="reading-classroom-v2__bullet-item"><CheckCircle2 className="size-4" /><span>{item}</span></div>)}</div><Textarea value={outputState.draft || ""} onChange={(event) => setOutputDraft(event.target.value)} placeholder="Write your response here..." className="reading-classroom-v2__textarea reading-classroom-v2__textarea--large" /><div className="reading-classroom-v2__task-actions"><Button onClick={evaluateOutput} disabled={!String(outputState.draft || "").trim() || outputState.status === "evaluating"}>{outputState.status === "evaluating" ? "Generating feedback..." : "提交并获取反馈"}</Button>{outputState.error ? <span className="reading-classroom-v2__error">{outputState.error}</span> : null}</div>{outputState.evaluation ? <div className="reading-classroom-v2__feedback-grid"><article className="reading-classroom-v2__feedback-card"><span>Writing Score</span><strong>{outputState.evaluation.score ?? "--"}</strong><p>{outputState.evaluation.feedback}</p></article>{(outputState.evaluation.corrections || []).length ? <article className="reading-classroom-v2__feedback-card"><span>Corrections</span>{outputState.evaluation.corrections.map((item, index) => <p key={`${item.original}-${index}`}>{item.original} {"->"} {item.corrected}</p>)}</article> : null}</div> : null}</Card> : null}
          </div>

          <footer className="reading-classroom-v2__footer">
            <Button variant="ghost" onClick={() => activeIndex > 0 && jumpToScene(activeIndex - 1)} disabled={activeIndex === 0}><ArrowLeft className="size-4" />上一场景</Button>
            {!allBeatsRevealed ? <Button onClick={revealNextBeat} className="gap-2">下一步<ChevronRight className="size-4" /></Button> : canAdvance ? <Button onClick={advanceScene} className="gap-2">{activeIndex === scenes.length - 1 ? "完成课程" : "进入下一场景"}<ArrowRight className="size-4" /></Button> : <span className="reading-classroom-v2__footer-note">完成当前任务后即可继续。</span>}
          </footer>
        </section>
      </main>
    </div>
  );
}
