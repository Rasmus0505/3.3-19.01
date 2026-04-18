/**
 * SceneShadowing — Scene 3: TTS playback + recording + SOE oral assessment.
 */
import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { Button, Card, Badge } from "../../../shared/ui";
import { ArrowRight, Mic, Volume2, Loader2, RotateCcw, SkipForward } from "lucide-react";
import AudioRecorder from "../../../shared/components/AudioRecorder";
import { assessSentence } from "../../../shared/api/soeApi";
import SOEResultCard from "../SOEResultCard";

function selectShadowingSentences(sentences, maxCount = 5) {
  if (!sentences || sentences.length === 0) return [];
  if (sentences.length <= maxCount) return sentences.map((s, i) => ({ ...s, _origIdx: i }));

  const step = (sentences.length - 1) / (maxCount - 1);
  const selected = [];
  for (let i = 0; i < maxCount; i++) {
    const idx = Math.round(i * step);
    selected.push({ ...sentences[idx], _origIdx: idx });
  }
  return selected;
}

export function SceneShadowing({ lesson, apiClient, accessToken, onComplete, onSaveResults }) {
  const selectedSentences = useMemo(
    () => selectShadowingSentences(lesson?.sentences, 5),
    [lesson],
  );

  const [currentIdx, setCurrentIdx] = useState(0);
  const [sentencePhase, setSentencePhase] = useState("listen"); // listen | record | scored
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsAudioUrl, setTtsAudioUrl] = useState(null);
  const [soeLoading, setSoeLoading] = useState(false);
  const [soeResult, setSoeResult] = useState(null);
  const [showSoeCard, setShowSoeCard] = useState(false);
  const [allScores, setAllScores] = useState([]);

  const audioRef = useRef(null);
  const recorderRef = useRef(null);

  const currentSentence = selectedSentences[currentIdx];
  const isLastSentence = currentIdx >= selectedSentences.length - 1;

  // Auto-fetch TTS when sentence changes
  useEffect(() => {
    if (!currentSentence?.text_en) return;
    let cancelled = false;

    (async () => {
      setTtsLoading(true);
      setTtsAudioUrl(null);
      try {
        const res = await apiClient("/api/tts/synthesize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: currentSentence.text_en,
            voice: "loongstella-v1",
            language_type: "English",
          }),
        });
        if (!res.ok) throw new Error("TTS failed");
        const data = await res.json();
        if (cancelled) return;
        if (data.audio_url) {
          setTtsAudioUrl(data.audio_url);
        }
      } catch {
        /* TTS failure — user can still record */
      } finally {
        if (!cancelled) setTtsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [currentSentence?.text_en, apiClient]);

  const playTts = useCallback(() => {
    if (!ttsAudioUrl) return;
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(ttsAudioUrl);
    audioRef.current = audio;
    audio.play().catch(() => {});
  }, [ttsAudioUrl]);

  const handleRecordingComplete = useCallback(
    async (audioBlob) => {
      if (!currentSentence?.text_en || !audioBlob) return;
      setSoeLoading(true);
      setSentencePhase("scored");
      try {
        const result = await assessSentence(
          apiClient,
          audioBlob,
          currentSentence.text_en,
          currentSentence.idx != null ? String(currentSentence.idx) : undefined,
          lesson?.id != null ? String(lesson.id) : undefined,
          accessToken,
        );
        setSoeResult(result);
        if (result?.ok) {
          setAllScores((prev) => [
            ...prev,
            {
              sentenceIndex: currentSentence._origIdx,
              totalScore: result.total_score,
              pronunciationScore: result.pronunciation_score,
              fluencyScore: result.fluency_score,
              completenessScore: result.completeness_score,
            },
          ]);
        }
      } catch {
        setSoeResult({ ok: false, message: "评测失败，请重试" });
      } finally {
        setSoeLoading(false);
      }
    },
    [currentSentence, lesson, apiClient],
  );

  const handleNextSentence = useCallback(() => {
    if (isLastSentence) {
      // Complete the scene
      const avgScore =
        allScores.length > 0
          ? Math.round(allScores.reduce((sum, s) => sum + (s.totalScore || 0), 0) / allScores.length)
          : 0;
      onSaveResults?.({ averageScore: avgScore, sentenceScores: allScores });
      onComplete();
      return;
    }
    setCurrentIdx((prev) => prev + 1);
    setSentencePhase("listen");
    setSoeResult(null);
    setShowSoeCard(false);
  }, [isLastSentence, allScores, onSaveResults, onComplete]);

  const handleRetry = useCallback(() => {
    // Remove last score entry for this sentence
    setAllScores((prev) => prev.filter((s) => s.sentenceIndex !== currentSentence?._origIdx));
    setSentencePhase("listen");
    setSoeResult(null);
    setShowSoeCard(false);
  }, [currentSentence]);

  if (selectedSentences.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 gap-4">
        <Mic className="w-12 h-12 text-blue-500" />
        <p className="text-muted-foreground">没有可跟读的句子</p>
        <Button onClick={() => { onSaveResults?.({ averageScore: 0, sentenceScores: [] }); onComplete(); }}>
          跳过
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-lg mx-auto">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950 flex items-center justify-center">
              <Mic className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">跟读练习</h2>
              <p className="text-sm text-muted-foreground">
                {currentIdx + 1} / {selectedSentences.length} 句
              </p>
            </div>
          </div>

          {/* Sentence display */}
          <Card className="p-6 mb-4">
            <p className="text-lg font-medium mb-2 leading-relaxed">{currentSentence.text_en}</p>
            {currentSentence.text_zh && (
              <p className="text-sm text-muted-foreground">{currentSentence.text_zh}</p>
            )}
          </Card>

          {/* TTS playback */}
          <div className="flex items-center gap-3 mb-6">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={playTts}
              disabled={ttsLoading || !ttsAudioUrl}
            >
              {ttsLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
              {ttsLoading ? "加载中…" : "播放原音"}
            </Button>

            {sentencePhase === "listen" && (
              <Button size="sm" className="gap-2" onClick={() => setSentencePhase("record")}>
                <Mic className="w-4 h-4" />
                开始跟读
              </Button>
            )}
          </div>

          {/* Recording phase */}
          {sentencePhase === "record" && (
            <div className="mb-4">
              <AudioRecorder
                onRecordingComplete={handleRecordingComplete}
                maxDuration={15}
                triggerRef={recorderRef}
              />
            </div>
          )}

          {/* SOE loading */}
          {soeLoading && (
            <div className="flex items-center gap-3 p-4">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">正在评测…</span>
            </div>
          )}

          {/* SOE Result */}
          {sentencePhase === "scored" && soeResult && !soeLoading && (
            <Card className="p-6 mb-4">
              {soeResult.ok ? (
                <>
                  <div className="flex items-center gap-4 mb-4">
                    <ScoreCircle label="发音" score={soeResult.pronunciation_score} />
                    <ScoreCircle label="流畅" score={soeResult.fluency_score} />
                    <ScoreCircle label="完整" score={soeResult.completeness_score} />
                  </div>
                  <div className="text-center">
                    <span className="text-2xl font-bold text-primary">{soeResult.total_score}</span>
                    <span className="text-sm text-muted-foreground ml-1">/ 100</span>
                  </div>
                  <Button
                    variant="link"
                    size="sm"
                    className="mt-2 w-full"
                    onClick={() => setShowSoeCard(true)}
                  >
                    查看详细评测
                  </Button>
                </>
              ) : (
                <p className="text-sm text-red-500 text-center">
                  {soeResult.message || "评测失败"}
                </p>
              )}
            </Card>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      {sentencePhase === "scored" && !soeLoading && (
        <div className="border-t p-3 flex justify-between shrink-0">
          <Button variant="outline" size="sm" className="gap-1" onClick={handleRetry}>
            <RotateCcw className="w-3.5 h-3.5" /> 重试
          </Button>
          <Button onClick={handleNextSentence} className="gap-2">
            {isLastSentence ? "完成" : "下一句"}
            {isLastSentence ? null : <SkipForward className="w-4 h-4" />}
          </Button>
        </div>
      )}

      {/* SOE Detail modal */}
      {showSoeCard && soeResult?.ok && (
        <SOEResultCard result={soeResult} onClose={() => setShowSoeCard(false)} />
      )}
    </div>
  );
}

/** Mini score circle for inline display */
function ScoreCircle({ label, score }) {
  const numScore = typeof score === "number" ? Math.round(score) : 0;
  const color = numScore >= 75 ? "text-emerald-500" : numScore >= 60 ? "text-amber-500" : "text-red-500";

  return (
    <div className="flex flex-col items-center gap-1 flex-1">
      <span className={`text-xl font-bold ${color}`}>{numScore}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}


