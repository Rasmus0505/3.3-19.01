import { useState, useEffect, useRef, useCallback } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, Button } from "../../shared/ui";

const CACHE_PREFIX = "ai_coach_v1_";
const TYPING_INTERVAL = 18;

function getCachedCoach(userId) {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${userId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setCachedCoach(userId, text) {
  try {
    localStorage.setItem(
      `${CACHE_PREFIX}${userId}`,
      JSON.stringify({ text, timestamp: Date.now() }),
    );
  } catch {
    // quota exceeded, ignore
  }
}

export function AICoachCard({ apiCall, stats, userId }) {
  const [coachText, setCoachText] = useState("");
  const [displayText, setDisplayText] = useState("");
  const [loading, setLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState(null);
  const typingRef = useRef(null);
  const fullTextRef = useRef("");

  // Load cached text on mount
  useEffect(() => {
    const cached = getCachedCoach(userId);
    if (cached?.text) {
      setCoachText(cached.text);
      setDisplayText(cached.text);
    }
  }, [userId]);

  // Typing animation
  const startTyping = useCallback((text) => {
    fullTextRef.current = text;
    setDisplayText("");
    setIsTyping(true);
    let index = 0;
    if (typingRef.current) clearInterval(typingRef.current);
    typingRef.current = setInterval(() => {
      index++;
      setDisplayText(fullTextRef.current.slice(0, index));
      if (index >= fullTextRef.current.length) {
        clearInterval(typingRef.current);
        typingRef.current = null;
        setIsTyping(false);
      }
    }, TYPING_INTERVAL);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingRef.current) clearInterval(typingRef.current);
    };
  }, []);

  const fetchCoach = useCallback(async () => {
    if (!stats || loading) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await apiCall("/api/dashboard/ai-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stats, language: "zh" }),
      });
      if (resp.ok) {
        const data = await resp.json();
        const text = data.coach_text || "";
        setCoachText(text);
        setCachedCoach(userId, text);
        startTyping(text);
      } else {
        setError("AI 教练生成失败，请稍后重试");
      }
    } catch (e) {
      setError(e.message || "网络错误");
    } finally {
      setLoading(false);
    }
  }, [apiCall, stats, userId, loading, startTyping]);

  const handleRegenerate = useCallback(() => {
    localStorage.removeItem(`${CACHE_PREFIX}${userId}`);
    setCoachText("");
    setDisplayText("");
    fetchCoach();
  }, [userId, fetchCoach]);

  const hasContent = displayText.length > 0;

  return (
    <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-primary/5 via-card to-primary/5 shadow-sm">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(var(--primary)/0.08),transparent_70%)]" />
      <CardHeader className="relative pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-primary/10 p-1.5">
              <Sparkles className="size-4 text-primary" />
            </div>
            <CardTitle className="text-sm font-medium">AI 教练点评</CardTitle>
          </div>
          <div className="flex gap-2">
            {!hasContent && !loading ? (
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={fetchCoach} disabled={!stats}>
                <Sparkles className="size-3" />
                获取 AI 点评
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 text-xs"
                onClick={handleRegenerate}
                disabled={loading || isTyping}
              >
                <RefreshCw className={`size-3 ${loading ? "animate-spin" : ""}`} />
                重新生成
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="relative">
        {loading && !isTyping ? (
          <div className="flex items-center gap-2 py-4">
            <div className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:0ms]" />
            <div className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:150ms]" />
            <div className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:300ms]" />
            <span className="ml-2 text-sm text-muted-foreground">AI 教练正在分析你的学习数据...</span>
          </div>
        ) : error ? (
          <p className="py-4 text-sm text-destructive">{error}</p>
        ) : hasContent ? (
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
            {displayText}
            {isTyping ? <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-primary" /> : null}
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-muted-foreground">
            点击「获取 AI 点评」，让 AI 教练为你分析学习数据并给出个性化建议
          </p>
        )}
      </CardContent>
    </Card>
  );
}
