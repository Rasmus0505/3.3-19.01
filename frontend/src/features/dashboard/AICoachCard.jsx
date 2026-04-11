import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { BookOpenCheck, RefreshCw } from "lucide-react";
import { Badge, Button, Card, CardContent } from "../../shared/ui";
import { MOCK_COACH_TEXT, MOCK_COACH_VARIANTS } from "./mockData";

const CACHE_PREFIX = "ai_coach_v1_";

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

function compressCoachText(text, fallback) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return fallback;
  const parts = normalized.split(/(?<=[。！？.!?])\s*/).filter(Boolean);
  if (!parts.length) return fallback;
  if ((parts[0] || "").length < 20 && parts[1]) return `${parts[0]} ${parts[1]}`.trim();
  return parts[0].trim();
}

export function AICoachCard({ apiCall, stats, report, userId, useMock = false }) {
  const [verdictText, setVerdictText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [mockVariantIndex, setMockVariantIndex] = useState(0);

  useEffect(() => {
    setError(null);
    setLoading(false);

    if (useMock) {
      const text = MOCK_COACH_VARIANTS[0] || MOCK_COACH_TEXT || report?.verdictLine || "";
      setMockVariantIndex(0);
      setVerdictText(text);
      return;
    }

    const cached = getCachedCoach(userId);
    if (cached?.text) {
      setVerdictText(cached.text);
      return;
    }

    setVerdictText(report?.verdictLine || "");
  }, [report?.verdictLine, useMock, userId]);

  const fetchCoach = useCallback(async () => {
    if (useMock) {
      const nextIndex = (mockVariantIndex + 1) % MOCK_COACH_VARIANTS.length;
      setMockVariantIndex(nextIndex);
      setVerdictText(MOCK_COACH_VARIANTS[nextIndex] || report?.verdictLine || "");
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
        setError("理论结论生成失败，请稍后重试");
        return;
      }
      const data = await resp.json();
      const compressed = compressCoachText(data.coach_text, report?.verdictLine || "");
      setVerdictText(compressed);
      setCachedCoach(userId, compressed);
    } catch (event) {
      setError(event.message || "网络错误");
    } finally {
      setLoading(false);
    }
  }, [apiCall, loading, mockVariantIndex, report?.verdictLine, stats, useMock, userId]);

  const handleRefresh = useCallback(() => {
    if (!useMock) {
      localStorage.removeItem(`${CACHE_PREFIX}${userId}`);
    }
    fetchCoach();
  }, [fetchCoach, useMock, userId]);

  return (
    <Card className="relative overflow-hidden rounded-[30px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(15,23,42,0.96),rgba(30,41,59,0.96))] text-white shadow-[0_36px_100px_-60px_rgba(15,23,42,0.95)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.22),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(52,211,153,0.12),transparent_28%)]" />
      <CardContent className="relative flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-semibold tracking-[0.2em] text-sky-100">
              THEORY VERDICT
            </Badge>
            <Badge className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-semibold tracking-[0.2em] text-slate-200">
              {report?.predictedLevel || "B1 Input"}
            </Badge>
          </div>
          <div className="mt-3 flex items-start gap-3">
            <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-sky-200">
              <BookOpenCheck className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-black leading-8 tracking-tight text-white lg:text-2xl">
                {error ? report?.verdictLine : verdictText || report?.verdictLine}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-300">{report?.verdictSupport}</p>
            </div>
          </div>
        </div>

        <Button
          size="sm"
          variant="secondary"
          className="shrink-0 rounded-full border border-white/12 bg-white/10 px-4 text-xs font-semibold text-white hover:bg-white/16"
          onClick={handleRefresh}
          disabled={loading}
        >
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          {useMock ? "换个表述" : "重新生成"}
        </Button>
      </CardContent>
    </Card>
  );
}
