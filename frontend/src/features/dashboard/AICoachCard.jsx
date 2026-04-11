import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, Sparkles, Bot } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, Button } from "../../shared/ui";
import { MOCK_COACH_TEXT } from "./mockData";

const CACHE_PREFIX = "ai_coach_v1_";
const TYPING_INTERVAL = 14;

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
  } catch { /* ignore */ }
}

export function AICoachCard({ apiCall, stats, userId, useMock = false }) {
  const [coachText, setCoachText] = useState("");
  const [displayText, setDisplayText] = useState("");
  const [loading, setLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState(null);
  const typingRef = useRef(null);
  const fullTextRef = useRef("");

  // Load cached or mock text on mount
  useEffect(() => {
    if (useMock) {
      setCoachText(MOCK_COACH_TEXT);
      setDisplayText(MOCK_COACH_TEXT);
      return;
    }
    const cached = getCachedCoach(userId);
    if (cached?.text) {
      setCoachText(cached.text);
      setDisplayText(cached.text);
    }
  }, [userId, useMock]);

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

  useEffect(() => {
    return () => { if (typingRef.current) clearInterval(typingRef.current); };
  }, []);

  const fetchCoach = useCallback(async () => {
    if (useMock) {
      startTyping(MOCK_COACH_TEXT);
      return;
    }
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
  }, [apiCall, stats, userId, loading, startTyping, useMock]);

  const handleRegenerate = useCallback(() => {
    if (!useMock) {
      localStorage.removeItem(`${CACHE_PREFIX}${userId}`);
    }
    setCoachText("");
    setDisplayText("");
    fetchCoach();
  }, [userId, fetchCoach, useMock]);

  const hasContent = displayText.length > 0;

  return (
    <motion.div whileHover={{ scale: 1.005 }} transition={{ type: "spring", stiffness: 400, damping: 30 }}>
      <Card className="relative overflow-hidden border-0 shadow-lg">
        {/* Animated gradient background */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-br from-violet-500/8 via-transparent to-indigo-500/8"
          animate={{
            background: [
              "linear-gradient(135deg, hsl(270 80% 60% / 0.08) 0%, transparent 50%, hsl(230 80% 60% / 0.08) 100%)",
              "linear-gradient(135deg, hsl(230 80% 60% / 0.08) 0%, transparent 50%, hsl(270 80% 60% / 0.08) 100%)",
              "linear-gradient(135deg, hsl(270 80% 60% / 0.08) 0%, transparent 50%, hsl(230 80% 60% / 0.08) 100%)",
            ],
          }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* Floating orb */}
        <motion.div
          className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br from-violet-500/20 to-indigo-500/20 blur-3xl"
          animate={{ x: [0, 15, 0], y: [0, -10, 0], scale: [1, 1.2, 1] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        />

        <CardHeader className="relative pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <motion.div
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-md shadow-violet-500/25"
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              >
                <Bot className="h-4 w-4 text-white" />
              </motion.div>
              <div>
                <CardTitle className="text-sm font-semibold">AI 教练点评</CardTitle>
                <p className="text-[11px] text-muted-foreground">基于你的学习数据生成个性化建议</p>
              </div>
            </div>
            <div className="flex gap-2">
              {!hasContent && !loading ? (
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button size="sm" className="h-8 gap-1.5 bg-gradient-to-r from-violet-500 to-indigo-600 text-xs text-white shadow-md shadow-violet-500/25 hover:shadow-lg hover:shadow-violet-500/30" onClick={fetchCoach} disabled={!stats && !useMock}>
                    <Sparkles className="h-3.5 w-3.5" />
                    获取 AI 点评
                  </Button>
                </motion.div>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 text-xs"
                  onClick={handleRegenerate}
                  disabled={loading || isTyping}
                >
                  <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
                  重新生成
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="relative">
          <AnimatePresence mode="wait">
            {loading && !isTyping ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-3 py-4"
              >
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="h-2.5 w-2.5 rounded-full bg-gradient-to-r from-violet-500 to-indigo-500"
                    animate={{ y: [0, -8, 0], opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
                  />
                ))}
                <span className="ml-1 text-sm text-muted-foreground">AI 教练正在分析…</span>
              </motion.div>
            ) : error ? (
              <motion.p key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-4 text-sm text-destructive">
                {error}
              </motion.p>
            ) : hasContent ? (
              <motion.div
                key="content"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90"
              >
                {displayText}
                {isTyping && (
                  <motion.span
                    className="ml-0.5 inline-block h-4 w-[2px] bg-violet-500"
                    animate={{ opacity: [1, 0, 1] }}
                    transition={{ duration: 0.8, repeat: Infinity }}
                  />
                )}
              </motion.div>
            ) : (
              <motion.p key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-6 text-center text-sm text-muted-foreground">
                点击「获取 AI 点评」，让 AI 教练分析你的学习数据
              </motion.p>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  );
}
