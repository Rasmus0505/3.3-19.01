/**
 * SceneDiscussion — Scene 2: AI Teacher+Student discussion with TTS.
 */
import { useState, useCallback, useEffect } from "react";
import { Button, Card } from "../../../shared/ui";
import { MessageSquare, Loader2, Globe, RefreshCw } from "lucide-react";
import { DiscussionPlayer } from "./DiscussionPlayer";

export function SceneDiscussion({
  pack,
  courseData,
  apiCall,
  accessToken,
  onSetDiscussion,
  onSetSettings,
  onComplete,
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);
  const discussion = courseData?.discussion;
  const settings = courseData?.settings || { explanationLanguage: "zh" };

  const generateDiscussion = useCallback(async (lang) => {
    setIsGenerating(true);
    setError(null);
    try {
      const articleText = pack?.rewrittenText || pack?.originalText || "";
      const keyVocab = [
        ...(pack?.validI1Words || []),
        ...(pack?.validAboveI1Words || []),
      ].slice(0, 10);

      const targetLevel = pack?.diagnosticSummary?.targetLevel || "B1";

      const res = await apiCall("/api/llm/discussion/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          article_text: articleText,
          target_level: targetLevel,
          key_vocabulary: keyVocab,
          explanation_language: lang,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Generation failed");
      }

      const data = await res.json();
      const disc = {
        ...data.discussion,
        generatedAt: Date.now(),
      };
      onSetDiscussion(disc);
      onSetSettings({ explanationLanguage: lang });
    } catch (err) {
      setError(err.message || "Failed to generate discussion");
    } finally {
      setIsGenerating(false);
    }
  }, [pack, apiCall, onSetDiscussion, onSetSettings]);

  // Language selection screen (before generating)
  if (!discussion && !isGenerating) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 gap-6">
        <div className="w-16 h-16 rounded-2xl bg-purple-50 dark:bg-purple-950 flex items-center justify-center">
          <MessageSquare className="w-8 h-8 text-purple-500" />
        </div>

        <div className="text-center">
          <h2 className="text-xl font-semibold mb-1">AI 课堂讨论</h2>
          <p className="text-muted-foreground text-sm max-w-md">
            An AI Teacher and Student will discuss the article's key points. Choose the explanation language:
          </p>
        </div>

        {error && (
          <Card className="p-3 border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800 text-sm text-red-700 dark:text-red-300 max-w-sm">
            {error}
          </Card>
        )}

        <div className="flex gap-3">
          <Button
            variant="outline"
            size="lg"
            className="gap-2 min-w-[140px]"
            onClick={() => generateDiscussion("zh")}
          >
            <Globe className="w-4 h-4" />
            中英混合
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="gap-2 min-w-[140px]"
            onClick={() => generateDiscussion("en")}
          >
            <Globe className="w-4 h-4" />
            Full English
          </Button>
        </div>
      </div>
    );
  }

  // Generating state
  if (isGenerating) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-purple-500" />
        <p className="text-muted-foreground text-sm">Generating discussion script...</p>
      </div>
    );
  }

  // Discussion player
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-purple-500" />
          <span className="text-sm font-medium">AI 课堂讨论</span>
          <span className="text-xs text-muted-foreground">
            ({settings.explanationLanguage === "zh" ? "中英混合" : "English"})
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 text-xs h-7"
          onClick={() => { onSetDiscussion(null); }}
        >
          <RefreshCw className="w-3 h-3" />
          Regenerate
        </Button>
      </div>

      {/* Player */}
      <div className="flex-1 overflow-hidden">
        <DiscussionPlayer
          messages={discussion.messages}
          onComplete={onComplete}
        />
      </div>
    </div>
  );
}
