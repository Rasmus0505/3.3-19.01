import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Bot, RefreshCw, Sparkles } from "lucide-react";
import { Badge, Button, Card, CardContent } from "../../shared/ui";
import { MOCK_COACH_TEXT, MOCK_COACH_VARIANTS } from "./mockData";

const CACHE_PREFIX = "ai_coach_v1_";
const TYPING_INTERVAL = 11;

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
    // ignore storage failures
  }
}

export function AICoachCard({ apiCall, stats, report, userId, useMock = false }) {
  const [coachText, setCoachText] = useState("");
  const [displayText, setDisplayText] = useState("");
  const [loading, setLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState(null);
  const [mockVariantIndex, setMockVariantIndex] = useState(0);
  const typingRef = useRef(null);
  const fullTextRef = useRef("");

  const stopTyping = useCallback(() => {
    if (typingRef.current) {
      clearInterval(typingRef.current);
      typingRef.current = null;
    }
    setIsTyping(false);
  }, []);

  const startTyping = useCallback((text) => {
    stopTyping();
    fullTextRef.current = text;
    setDisplayText("");
    setIsTyping(true);
    let index = 0;
    typingRef.current = setInterval(() => {
      index += 1;
      setDisplayText(fullTextRef.current.slice(0, index));
      if (index >= fullTextRef.current.length) {
        stopTyping();
      }
    }, TYPING_INTERVAL);
  }, [stopTyping]);

  useEffect(() => () => stopTyping(), [stopTyping]);

  useEffect(() => {
    setError(null);
    setLoading(false);
    stopTyping();

    if (useMock) {
      const nextText = MOCK_COACH_VARIANTS[0] || MOCK_COACH_TEXT;
      setMockVariantIndex(0);
      setCoachText(nextText);
      setDisplayText(nextText);
      return;
    }

    const cached = getCachedCoach(userId);
    if (cached?.text) {
      setCoachText(cached.text);
      setDisplayText(cached.text);
      return;
    }

    setCoachText("");
    setDisplayText("");
  }, [stopTyping, useMock, userId]);

  const fetchCoach = useCallback(async () => {
    if (useMock) {
      const nextIndex = (mockVariantIndex + 1) % MOCK_COACH_VARIANTS.length;
      const nextText = MOCK_COACH_VARIANTS[nextIndex] || MOCK_COACH_TEXT;
      setMockVariantIndex(nextIndex);
      setCoachText(nextText);
      startTyping(nextText);
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
      if (!resp.ok) {
        setError("AI 战报生成失败，请稍后重试");
        return;
      }
      const data = await resp.json();
      const text = data.coach_text || "";
      setCoachText(text);
      setCachedCoach(userId, text);
      startTyping(text);
    } catch (event) {
      setError(event.message || "网络错误");
    } finally {
      setLoading(false);
    }
  }, [apiCall, loading, mockVariantIndex, startTyping, stats, useMock, userId]);

  const handleRefresh = useCallback(() => {
    if (!useMock) {
      localStorage.removeItem(`${CACHE_PREFIX}${userId}`);
      setCoachText("");
      setDisplayText("");
    }
    fetchCoach();
  }, [fetchCoach, useMock, userId]);

  const visibleText = displayText || coachText || report?.coachLead || "";

  return (
    <Card className="relative overflow-hidden rounded-[36px] border border-white/50 bg-[linear-gradient(135deg,rgba(15,23,42,0.96),rgba(14,116,144,0.88))] text-white shadow-[0_36px_120px_-56px_rgba(8,47,73,0.9)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.35),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(45,212,191,0.18),transparent_26%)]" />
      <div className="absolute inset-x-0 top-0 h-px bg-white/30" />

      <CardContent className="relative p-5 lg:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[20px] bg-white/12 shadow-lg shadow-cyan-500/20 backdrop-blur">
              <Bot className="h-5 w-5 text-cyan-200" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-semibold tracking-[0.2em] text-cyan-100">
                  AI COACH
                </Badge>
                <Badge className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-semibold tracking-[0.2em] text-cyan-100">
                  {report?.predictedLevel || "A2"} TRACK
                </Badge>
              </div>
              <h3 className="mt-3 text-[28px] font-black tracking-tight">AI 战报主控台</h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-cyan-50/78">
                把教练点评改造成比赛可截图的结论面板，直接告诉评审“现在处在哪个阶段、最强是什么、下一步打哪里”。
              </p>
            </div>
          </div>

          <Button
            size="sm"
            variant="secondary"
            className="shrink-0 rounded-full border border-white/12 bg-white/10 px-3 text-xs font-semibold text-white hover:bg-white/16"
            onClick={handleRefresh}
            disabled={loading}
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {useMock ? "切换视角" : "重新生成"}
          </Button>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.9fr)]">
          <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/8 p-4 backdrop-blur">
            <div className="flex items-center gap-2 text-cyan-100/80">
              <Sparkles className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-[0.18em]">Coach Verdict</span>
            </div>

            {loading && !isTyping ? (
              <div className="mt-4 flex items-center gap-2 py-6 text-sm text-cyan-50/80">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-cyan-300" />
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-cyan-300 [animation-delay:120ms]" />
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-cyan-300 [animation-delay:240ms]" />
                AI 教练正在重组你的战报...
              </div>
            ) : error ? (
              <p className="mt-4 rounded-[22px] border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</p>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative mt-4 rounded-[24px] border border-white/10 bg-slate-950/22 px-4 py-4"
              >
                <p className="text-[15px] leading-7 text-white/92">
                  {visibleText}
                  {isTyping ? (
                    <motion.span
                      className="ml-0.5 inline-block h-4 w-[2px] bg-cyan-300"
                      animate={{ opacity: [1, 0, 1] }}
                      transition={{ duration: 0.8, repeat: Infinity }}
                    />
                  ) : null}
                </p>
              </motion.div>
            )}
          </div>

          <div className="grid gap-3">
            {report?.coachSections?.map((section, index) => (
              <motion.div
                key={section.label}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.18 + index * 0.06, duration: 0.35 }}
                className="rounded-[24px] border border-white/10 bg-white/10 p-4 backdrop-blur"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-100/76">{section.label}</p>
                <p className="mt-2 text-lg font-black tracking-tight text-white">{section.value}</p>
                <p className="mt-1 text-sm leading-6 text-cyan-50/76">{section.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
