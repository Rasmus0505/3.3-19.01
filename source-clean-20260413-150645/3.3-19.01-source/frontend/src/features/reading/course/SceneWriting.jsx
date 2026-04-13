/**
 * SceneWriting — Scene 5: AI-guided writing exercise.
 *
 * Phases: prompting → writing → evaluating → feedback
 * Mode A only (guided writing) for MVP.
 */
import { useState, useCallback, useEffect } from "react";
import { Button, Card } from "../../../shared/ui";
import { Pencil, Loader2, Send, ArrowRight, CheckCircle2, AlertCircle, Sparkles } from "lucide-react";

export function SceneWriting({ pack, apiCall, courseData, onSetWriting, onComplete }) {
  const existingWriting = courseData?.writing;
  const [phase, setPhase] = useState(existingWriting?.evaluation ? "feedback" : "prompting");
  const [writingPrompt, setWritingPrompt] = useState(existingWriting?.prompt || "");
  const [guidance, setGuidance] = useState(existingWriting?.guidance || "");
  const [userText, setUserText] = useState(existingWriting?.userText || "");
  const [evaluation, setEvaluation] = useState(existingWriting?.evaluation || null);
  const [error, setError] = useState(null);

  const targetLevel = pack?.diagnosticSummary?.targetLevel || pack?.targetLevel || "B1";
  const articleText = pack?.rewrittenText || pack?.originalText || "";

  // Generate writing prompt on mount if no existing data
  useEffect(() => {
    if (existingWriting?.prompt) {
      setWritingPrompt(existingWriting.prompt);
      setGuidance(existingWriting.guidance || "");
      if (existingWriting.evaluation) {
        setPhase("feedback");
      } else if (existingWriting.userText) {
        setPhase("writing");
      } else {
        setPhase("writing");
      }
      return;
    }
    generatePrompt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generatePrompt = useCallback(async () => {
    setPhase("prompting");
    setError(null);
    try {
      const keyVocab = [
        ...(pack?.validI1Words || []),
        ...(pack?.validAboveI1Words || []),
      ].slice(0, 10);

      const res = await apiCall("/api/llm/writing/generate-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          article_text: articleText,
          target_level: targetLevel,
          key_vocabulary: keyVocab,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to generate writing prompt");
      }

      const data = await res.json();
      setWritingPrompt(data.prompt);
      setGuidance(data.guidance || "");
      onSetWriting({ prompt: data.prompt, guidance: data.guidance || "" });
      setPhase("writing");
    } catch (err) {
      setError(err.message || "Failed to generate prompt");
      setPhase("prompting");
    }
  }, [apiCall, articleText, targetLevel, pack, onSetWriting]);

  const handleSubmit = useCallback(async () => {
    if (!userText.trim()) return;
    setPhase("evaluating");
    setError(null);
    try {
      const res = await apiCall("/api/llm/writing/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          article_text: articleText,
          writing_prompt: writingPrompt,
          user_response: userText,
          target_level: targetLevel,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to evaluate writing");
      }

      const data = await res.json();
      setEvaluation(data.evaluation);
      onSetWriting({
        prompt: writingPrompt,
        guidance,
        userText,
        evaluation: data.evaluation,
      });
      setPhase("feedback");
    } catch (err) {
      setError(err.message || "Failed to evaluate");
      setPhase("writing");
    }
  }, [apiCall, articleText, writingPrompt, userText, targetLevel, guidance, onSetWriting]);

  const wordCount = userText.trim().split(/\s+/).filter(Boolean).length;

  // ─── Prompting / Loading ─────────────────────────────────────────────────
  if (phase === "prompting") {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 gap-4">
        {error ? (
          <>
            <AlertCircle className="w-10 h-10 text-red-500" />
            <p className="text-sm text-red-600 dark:text-red-400 max-w-sm text-center">{error}</p>
            <Button onClick={generatePrompt} variant="outline" size="sm">Retry</Button>
          </>
        ) : (
          <>
            <Loader2 className="w-10 h-10 animate-spin text-violet-500" />
            <p className="text-muted-foreground text-sm">Generating writing prompt...</p>
          </>
        )}
      </div>
    );
  }

  // ─── Evaluating ───────────��──────────────────────────────────────────────
  if (phase === "evaluating") {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-violet-500" />
        <p className="text-muted-foreground text-sm">Evaluating your writing...</p>
      </div>
    );
  }

  // ─── Writing phase ───────────────────────────────────────────────────────
  if (phase === "writing") {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-950 flex items-center justify-center">
              <Pencil className="w-5 h-5 text-violet-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Writing Practice</h2>
              <p className="text-xs text-muted-foreground">Write a response based on the article</p>
            </div>
          </div>

          {/* Prompt card */}
          <Card className="p-5 border-violet-200/50 dark:border-violet-800/50 bg-violet-50/50 dark:bg-violet-950/30">
            <p className="text-sm font-medium leading-relaxed">{writingPrompt}</p>
            {guidance && (
              <div className="mt-3 pt-3 border-t border-violet-200/50 dark:border-violet-700/50">
                <p className="text-xs text-muted-foreground font-medium mb-1">Helpful hints:</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{guidance}</p>
              </div>
            )}
          </Card>

          {/* Textarea */}
          <div className="space-y-2">
            <textarea
              className="w-full min-h-[150px] rounded-lg border bg-background px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/30 leading-relaxed"
              placeholder="Write your response here..."
              value={userText}
              onChange={(e) => setUserText(e.target.value)}
              rows={6}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{wordCount} words</span>
              {error && <span className="text-xs text-red-500">{error}</span>}
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t p-3 flex items-center justify-between shrink-0 bg-background/95 backdrop-blur">
          <Button variant="ghost" size="sm" onClick={onComplete}>
            Skip
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={handleSubmit}
            disabled={wordCount < 3}
          >
            <Send className="w-3.5 h-3.5" />
            Submit
          </Button>
        </div>
      </div>
    );
  }

  // ─── Feedback phase ──────────────────────────────────────────────────────
  const corrections = evaluation?.corrections || [];
  const suggestions = evaluation?.i1_suggestions || [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-950 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Writing Feedback</h2>
            <p className="text-xs text-muted-foreground">AI evaluation of your writing</p>
          </div>
        </div>

        {/* Score */}
        <Card className="p-6 text-center">
          <div className="text-4xl font-bold text-violet-600 dark:text-violet-400">
            {evaluation?.score ?? "--"}<span className="text-lg text-muted-foreground">/100</span>
          </div>
          {evaluation?.feedback && (
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed max-w-md mx-auto">
              {evaluation.feedback}
            </p>
          )}
        </Card>

        {/* User's text */}
        <Card className="p-4">
          <p className="text-xs text-muted-foreground font-medium mb-2">Your response:</p>
          <p className="text-sm leading-relaxed">{userText}</p>
        </Card>

        {/* Corrections */}
        {corrections.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              Corrections ({corrections.length})
            </h3>
            {corrections.map((c, idx) => (
              <Card key={idx} className="p-3 space-y-1">
                <div className="flex items-start gap-2 text-sm">
                  <span className="text-red-500 line-through shrink-0">{c.original}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">{c.corrected}</span>
                </div>
                {c.explanation && (
                  <p className="text-xs text-muted-foreground">{c.explanation}</p>
                )}
              </Card>
            ))}
          </div>
        )}

        {/* i+1 Suggestions */}
        {suggestions.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-500" />
              Vocabulary Upgrades
            </h3>
            {suggestions.map((s, idx) => (
              <Card key={idx} className="p-3 flex items-center gap-3">
                <span className="text-sm">{s.original_word}</span>
                <span className="text-muted-foreground text-xs">→</span>
                <span className="text-sm font-medium text-violet-600 dark:text-violet-400">{s.suggested_word}</span>
                {s.level && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300">
                    {s.level}
                  </span>
                )}
                {s.context && (
                  <span className="text-xs text-muted-foreground flex-1 truncate">{s.context}</span>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="border-t p-3 flex justify-end shrink-0 bg-background/95 backdrop-blur">
        <Button size="sm" className="gap-1.5" onClick={onComplete}>
          Continue <ArrowRight className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
