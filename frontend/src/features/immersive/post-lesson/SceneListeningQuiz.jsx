/**
 * SceneListeningQuiz — Scene 2: LLM-generated listening comprehension quiz.
 */
import { useState, useCallback, useEffect } from "react";
import { Button, Card, Badge } from "../../../shared/ui";
import { ArrowRight, HelpCircle, Loader2, Check, X, RotateCcw } from "lucide-react";
import { cn } from "../../../lib/utils";

function quizCacheKey(lessonId) {
  return `post_lesson_quiz_v1_${lessonId}`;
}

function loadCachedQuiz(lessonId) {
  try {
    const raw = localStorage.getItem(quizCacheKey(lessonId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveCachedQuiz(lessonId, quiz) {
  try {
    localStorage.setItem(quizCacheKey(lessonId), JSON.stringify(quiz));
  } catch { /* ignore */ }
}

export function SceneListeningQuiz({ lesson, apiClient, onComplete, onSaveResults }) {
  const lessonId = lesson?.id;
  const [questions, setQuestions] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState({});
  const [phase, setPhase] = useState("loading");
  const [scores, setScores] = useState({});

  useEffect(() => {
    if (!lessonId) return;
    let cancelled = false;

    (async () => {
      // Try cache first
      const cached = loadCachedQuiz(lessonId);
      if (cached?.questions?.length > 0) {
        if (cancelled) return;
        setQuestions(cached.questions);
        setPhase("answering");
        return;
      }

      // Generate quiz
      setIsGenerating(true);
      try {
        const sentences = lesson?.sentences || [];
        const packText = sentences.map((s) => s.text_en).filter(Boolean).join(" ");
        if (packText.length < 30) {
          if (!cancelled) setPhase("answering");
          return;
        }

        const firstCefr = sentences[0]?.cefr_vocab_json?.sentence_level;
        const targetLevel = firstCefr || "B1";

        const res = await apiClient("/api/llm/quiz/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pack_text: packText,
            original_text: packText,
            target_level: targetLevel,
          }),
        });

        if (!res.ok) throw new Error("Quiz generation failed");
        const data = await res.json();
        if (cancelled) return;

        const qs = data.questions || [];
        setQuestions(qs);
        setPhase("answering");
        saveCachedQuiz(lessonId, { questions: qs, generatedAt: Date.now() });
      } catch {
        if (!cancelled) setPhase("answering");
      } finally {
        if (!cancelled) setIsGenerating(false);
      }
    })();

    return () => { cancelled = true; };
  }, [lessonId, lesson, apiClient]);

  const gradeQuiz = useCallback(() => {
    if (!questions) return;
    const newScores = {};
    questions.forEach((q, idx) => {
      const answer = answers[idx];
      if (q.type === "mcq") {
        newScores[idx] = answer === q.answer;
      } else if (q.type === "fill") {
        newScores[idx] =
          typeof answer === "string" &&
          answer.toLowerCase().trim() === (q.answer || "").toLowerCase().trim();
      } else if (q.type === "order") {
        newScores[idx] = JSON.stringify(answer) === JSON.stringify(q.correct_order);
      }
    });
    setScores(newScores);
    setPhase("reviewing");
  }, [answers, questions]);

  const handleComplete = () => {
    const correct = Object.values(scores).filter(Boolean).length;
    const total = questions?.length || 0;
    onSaveResults?.({
      correct,
      total,
      percent: total > 0 ? Math.round((correct / total) * 100) : 0,
    });
    onComplete();
  };

  if (phase === "loading" || isGenerating) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-amber-500" />
        <p className="text-muted-foreground text-sm">正在生成测验题目…</p>
      </div>
    );
  }

  if (!questions || questions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 gap-4">
        <HelpCircle className="w-12 h-12 text-amber-500" />
        <p className="text-muted-foreground">暂无测验题目</p>
        <Button onClick={() => { onSaveResults?.({ correct: 0, total: 0, percent: 0 }); onComplete(); }}>
          跳过并继续
        </Button>
      </div>
    );
  }

  // Reviewing phase
  if (phase === "reviewing") {
    const correct = Object.values(scores).filter(Boolean).length;
    const total = questions.length;
    const percent = Math.round((correct / total) * 100);

    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full">
          <Card className="p-8 text-center mb-6">
            <h3 className="text-2xl font-bold mb-2">{correct} / {total}</h3>
            <p className="text-sm text-muted-foreground">
              {percent >= 80 ? "太棒了！" : percent >= 50 ? "继续加油！" : "下次会更好！"}
            </p>
          </Card>

          {questions.map((q, idx) => (
            <Card
              key={idx}
              className={cn("p-4 mb-3 border-l-4", scores[idx] ? "border-l-emerald-500" : "border-l-red-500")}
            >
              <div className="flex items-start gap-2">
                {scores[idx] ? (
                  <Check className="w-4 h-4 text-emerald-500 mt-0.5" />
                ) : (
                  <X className="w-4 h-4 text-red-500 mt-0.5" />
                )}
                <p className="text-sm">{q.question || q.sentence || "Question"}</p>
              </div>
            </Card>
          ))}
        </div>

        <div className="border-t p-3 flex justify-between shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => {
              setPhase("answering");
              setCurrentQ(0);
              setAnswers({});
              setScores({});
            }}
          >
            <RotateCcw className="w-3.5 h-3.5" /> 重试
          </Button>
          <Button onClick={handleComplete} className="gap-2">
            继续 <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  // Answering phase
  const q = questions[currentQ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full">
        <div className="flex items-center justify-between mb-6">
          <Badge variant="outline">{currentQ + 1} / {questions.length}</Badge>
          <span className="text-xs text-muted-foreground capitalize">{q.type}</span>
        </div>

        <Card className="p-6">
          <h3 className="text-base font-medium mb-4">{q.question || q.sentence || ""}</h3>

          {q.type === "mcq" && q.options && (
            <div className="space-y-2">
              {q.options.map((opt, idx) => (
                <button
                  key={idx}
                  onClick={() => setAnswers({ ...answers, [currentQ]: opt })}
                  className={cn(
                    "w-full text-left px-4 py-3 rounded-lg border transition-all text-sm",
                    answers[currentQ] === opt
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-border hover:bg-muted/50",
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}

          {q.type === "fill" && (
            <input
              type="text"
              placeholder="输入你的答案…"
              value={typeof answers[currentQ] === "string" ? answers[currentQ] : ""}
              onChange={(e) => setAnswers({ ...answers, [currentQ]: e.target.value })}
              className="w-full px-4 py-3 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          )}
        </Card>
      </div>

      <div className="border-t p-3 flex justify-between shrink-0">
        <Button variant="outline" onClick={() => setCurrentQ(Math.max(0, currentQ - 1))} disabled={currentQ === 0}>
          上一题
        </Button>
        {currentQ < questions.length - 1 ? (
          <Button onClick={() => setCurrentQ(currentQ + 1)}>下一题</Button>
        ) : (
          <Button onClick={gradeQuiz} className="gap-1">
            提交 <Check className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
