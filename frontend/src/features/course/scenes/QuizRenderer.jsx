/**
 * QuizRenderer — Interactive quiz with multiple-choice and fill-in-the-blank.
 *
 * Flow: Cover → Answering → Grading → Reviewing
 */
import { useState } from "react";
import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import { cn } from "../../../lib/utils";
import { HelpCircle, Check, X, RotateCcw, ChevronRight } from "lucide-react";

export function QuizRenderer({ scene }) {
  const content = scene.content || {};
  const questions = content.questions || [];
  const [phase, setPhase] = useState(questions.length > 0 ? "cover" : "cover");
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState({});
  const [scores, setScores] = useState({});

  if (questions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <Card className="p-8 text-center">
          <HelpCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-2">Quiz Coming Soon</h2>
          <p className="text-muted-foreground">Quiz questions are being generated...</p>
        </Card>
      </div>
    );
  }

  // --- Cover Phase ---
  if (phase === "cover") {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950 flex items-center justify-center mb-4">
          <HelpCircle className="w-8 h-8 text-amber-500" />
        </div>
        <h2 className="text-xl font-semibold mb-2">知识测验</h2>
        <p className="text-muted-foreground mb-1">{scene.title}</p>
        <Badge variant="secondary" className="mb-6">
          {questions.length} questions
        </Badge>
        <Button onClick={() => setPhase("answering")} size="lg" className="gap-2">
          Start Quiz
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  // --- Answering Phase ---
  if (phase === "answering") {
    const q = questions[currentQ];
    if (!q) {
      setPhase("grading");
      return null;
    }

    const isMultipleChoice = q.type === "multiple_choice";
    const selectedAnswer = answers[currentQ];

    return (
      <div className="max-w-2xl mx-auto p-6">
        {/* Progress bar */}
        <div className="flex items-center justify-between mb-6">
          <Badge variant="outline">{currentQ + 1} / {questions.length}</Badge>
          <span className="text-sm text-muted-foreground capitalize">{q.type.replace("_", " ")}</span>
        </div>

        {/* Question */}
        <Card className="p-6 mb-4">
          <h3 className="text-lg font-medium mb-4">{q.question}</h3>

          {isMultipleChoice ? (
            <div className="space-y-2">
              {q.options?.map((option, idx) => (
                <button
                  key={idx}
                  onClick={() => setAnswers({ ...answers, [currentQ]: idx })}
                  className={cn(
                    "w-full text-left px-4 py-3 rounded-lg border transition-all text-sm",
                    "hover:border-primary/50 hover:bg-muted/50",
                    selectedAnswer === idx
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-border",
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          ) : (
            <input
              type="text"
              placeholder="Type your answer..."
              value={typeof selectedAnswer === "string" ? selectedAnswer : ""}
              onChange={(e) => setAnswers({ ...answers, [currentQ]: e.target.value })}
              className="w-full px-4 py-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          )}
        </Card>

        {/* Navigation */}
        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => setCurrentQ(Math.max(0, currentQ - 1))}
            disabled={currentQ === 0}
          >
            Previous
          </Button>
          {currentQ < questions.length - 1 ? (
            <Button onClick={() => setCurrentQ(currentQ + 1)}>
              Next
            </Button>
          ) : (
            <Button onClick={() => gradeQuiz()} className="gap-2">
              Submit
              <Check className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  // --- Grading Phase ---
  if (phase === "grading") {
    // Auto-grade
    const newScores = {};
    questions.forEach((q, idx) => {
      const answer = answers[idx];
      if (q.type === "multiple_choice") {
        newScores[idx] = answer === q.correct_index;
      } else {
        newScores[idx] = typeof answer === "string" && answer.toLowerCase().trim() === (q.answer || "").toLowerCase().trim();
      }
    });
    setScores(newScores);
    setPhase("reviewing");
    return null;
  }

  // --- Reviewing Phase ---
  if (phase === "reviewing") {
    const correct = Object.values(scores).filter(Boolean).length;
    const total = questions.length;
    const percent = Math.round((correct / total) * 100);
    const ringColor = percent >= 80 ? "text-emerald-500" : percent >= 50 ? "text-amber-500" : "text-red-500";

    return (
      <div className="max-w-2xl mx-auto p-6">
        {/* Score banner */}
        <Card className="p-8 text-center mb-6">
          <div className="relative w-24 h-24 mx-auto mb-4">
            <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="6" className="text-muted/20" />
              <circle
                cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="6"
                strokeDasharray={`${percent * 2.64} 264`}
                strokeLinecap="round"
                className={ringColor}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={cn("text-2xl font-bold", ringColor)}>{percent}%</span>
            </div>
          </div>
          <h3 className="text-lg font-semibold mb-1">
            {correct} / {total} correct
          </h3>
          <p className="text-sm text-muted-foreground">
            {percent >= 80 ? "Excellent work!" : percent >= 50 ? "Good effort, keep practicing!" : "Keep trying, you'll improve!"}
          </p>
        </Card>

        {/* Review each question */}
        <div className="space-y-3 mb-6">
          {questions.map((q, idx) => {
            const isCorrect = scores[idx];
            return (
              <Card key={idx} className={cn(
                "p-4 border-l-4",
                isCorrect ? "border-l-emerald-500" : "border-l-red-500",
              )}>
                <div className="flex items-start gap-2">
                  {isCorrect ? (
                    <Check className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                  ) : (
                    <X className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className="text-sm font-medium">{q.question}</p>
                    {!isCorrect && q.explanation && (
                      <p className="text-xs text-muted-foreground mt-1">{q.explanation}</p>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        <div className="flex justify-center">
          <Button onClick={() => { setPhase("cover"); setCurrentQ(0); setAnswers({}); setScores({}); }} className="gap-2">
            <RotateCcw className="w-4 h-4" />
            Retry Quiz
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
