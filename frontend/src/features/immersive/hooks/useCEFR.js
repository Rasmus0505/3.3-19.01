// 沉浸式学习 CEFR 词汇分析 Hook
// 管理词汇难度分析和 CEFR 等级映射

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAppStore } from "../../../store";
import { VocabAnalyzer } from "../../../utils/vocabAnalyzer";
import { normalizeToken } from "../tokenNormalize";

const CEFR_CACHE_KEY_PREFIX = "cefr_analysis_v1:";
const CEFR_ANALYSIS_CHUNK_SIZE = 50;

function addTokenLevelToMap(map, token, level) {
  if (!(map instanceof Map) || !token) return;
  _addNormalizedKeysToMap(map, String(token).toLowerCase(), level);
}

function _addNormalizedKeysToMap(map, rawLower, level) {
  const keys = new Set([
    rawLower,
    normalizeToken(rawLower),
    normalizeToken(rawLower).replace(/'/g, ""),
  ]);
  for (const k of keys) {
    if (k) map.set(k, level);
  }
}

/**
 * @param {Map} map - CEFR level map
 * @param {string} token - raw token
 * @param {VocabAnalyzer|null} [fallbackAnalyzer] - if provided, missing map entries are resolved via VocabAnalyzer
 * @returns {string|undefined} CEFR level or undefined
 */
function lookupCefrLevelFromMap(map, token, fallbackAnalyzer) {
  if (!(map instanceof Map)) return undefined;
  const key = normalizeToken(token);
  if (map.has(key)) return map.get(key);
  const noApos = key.replace(/'/g, "");
  if (noApos && noApos !== key && map.has(noApos)) return map.get(noApos);
  // Fallback: ask VocabAnalyzer directly (handles stopwords, nonstandard contractions, bare punctuation)
  if (fallbackAnalyzer && fallbackAnalyzer.isLoaded) {
    return fallbackAnalyzer.lookupCefrLevelForSurfaceForm(token) ?? undefined;
  }
  return undefined;
}

export function useCEFR({ lesson, currentSentenceIndex }) {
  const [cefrAnalysisStatus, setCefrAnalysisStatus] = useState("idle");
  /** Bumps when VocabAnalyzer is ready — required because cache-hit path used to skip ref init, leaving CEFR maps empty. */
  const [cefrVocabEngineTick, setCefrVocabEngineTick] = useState(0);

  const cefrAnalyzerRef = useRef(null);
  const cefrLevel = useAppStore((s) => s.cefrLevel) || "B1";

  const currentSentenceCefrMap = useMemo(() => {
    const sentence = lesson?.sentences?.[currentSentenceIndex];
    const tokens = sentence?.tokens;
    const wordLevels = sentence?.cefr_vocab_json?.word_levels;
    if (typeof window !== "undefined") {
      window.__cefrDebug = window.__cefrDebug || {};
      window.__cefrDebug.enabled = true;
      console.debug("[CEFR map] sentence index:", currentSentenceIndex, "tokens:", tokens, "wordLevels:", wordLevels);
    }
    const map = new Map();

    // If word_levels is available from backend (new flow), use it for all words
    if (wordLevels && typeof wordLevels === "object" && Object.keys(wordLevels).length > 0) {
      for (const [word, info] of Object.entries(wordLevels)) {
        const finalLevel = info?.final_level;
        if (finalLevel) {
          // Normalize the word and add to map (same as addTokenLevelToMap logic)
          const normalized = normalizeToken(word);
          if (normalized) {
            map.set(normalized, finalLevel);
          }
          // Also add lowercase version for fallback
          map.set(word.toLowerCase(), finalLevel);
          if (typeof window !== "undefined") {
            console.debug("[CEFR map word_levels]", word, "→ final_level:", finalLevel);
          }
        }
      }
      if (typeof window !== "undefined") {
        window.__cefrDebug.lastMap = map;
        console.debug("[CEFR map] built from word_levels, size:", map.size, "entries:", [...map.entries()].slice(0, 10));
      }
      return map;
    }

    // Fallback to VocabAnalyzer (legacy flow for old lessons without word_levels)
    if (!Array.isArray(tokens) || !cefrAnalyzerRef.current?.isLoaded) return new Map();
    for (const token of tokens) {
      const level = cefrAnalyzerRef.current.lookupCefrLevelForSurfaceForm(token);
      if (typeof window !== "undefined") {
        console.debug(
          "[CEFR map token]",
          token,
          "→ level:",
          level,
          "SUPER?",
          level === null ? "YES (will be painted orange)" : "no"
        );
      }
      if (level) addTokenLevelToMap(map, token, level);
    }
    if (typeof window !== "undefined") {
      window.__cefrDebug.lastMap = map;
      console.debug("[CEFR map] built, size:", map.size, "entries:", [...map.entries()].slice(0, 10));
    }
    return map;
  }, [
    lesson?.sentences?.[currentSentenceIndex]?.tokens,
    lesson?.sentences?.[currentSentenceIndex]?.cefr_vocab_json,
    cefrVocabEngineTick,
  ]);

  // CEFR vocabulary analysis effect — always load VocabAnalyzer so per-sentence CEFR UI works even when lesson cache exists.
  useEffect(() => {
    if (!lesson?.id || !lesson?.sentences?.length) return;
    const lessonId = lesson.id;
    const cacheKey = CEFR_CACHE_KEY_PREFIX + String(lessonId);
    let canceled = false;

    async function runCefrPipeline() {
      if (!cefrAnalyzerRef.current) {
        cefrAnalyzerRef.current = new VocabAnalyzer();
      }
      const analyzer = cefrAnalyzerRef.current;
      if (!analyzer.isLoaded) {
        await analyzer.load();
      }
      if (canceled) return;
      setCefrVocabEngineTick((t) => t + 1);

      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        setCefrAnalysisStatus("complete");
        return;
      }

      setCefrAnalysisStatus("analyzing");
      if (canceled) return;

      const userLevel = useAppStore.getState().cefrLevel || "B1";
      const allSentences = lesson.sentences.map((s) => s.text_en).filter(Boolean);

      const results = [];
      for (let i = 0; i < allSentences.length; i += CEFR_ANALYSIS_CHUNK_SIZE) {
        if (canceled) return;
        const chunk = allSentences.slice(i, i + CEFR_ANALYSIS_CHUNK_SIZE);
        for (const sentence of chunk) {
          results.push(analyzer.analyzeSentence(sentence));
        }
        if (i + CEFR_ANALYSIS_CHUNK_SIZE < allSentences.length) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      const videoReport = analyzer.analyzeVideo(allSentences, userLevel);

      try {
        localStorage.setItem(cacheKey, JSON.stringify(videoReport));
      } catch (e) {
        console.warn("[CEFR] Failed to cache analysis:", e);
      }

      if (canceled) return;
      setCefrAnalysisStatus("complete");
      toast.success("词汇分析完成", { duration: 2000 });
    }

    void runCefrPipeline();
    return () => {
      canceled = true;
    };
  }, [lesson?.id, lesson?.sentences]);

  return {
    // State
    cefrAnalysisStatus,
    setCefrAnalysisStatus,
    cefrVocabEngineTick,
    cefrLevel,
    // Refs
    cefrAnalyzerRef,
    // Computed
    currentSentenceCefrMap,
    // Utils
    lookupCefrLevelFromMap,
  };
}
