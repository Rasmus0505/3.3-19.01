import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../../../store";
import { classifyTokensByCollins } from "../../../shared/api/dictionaryApi";
import { normalizeToken } from "../tokenNormalize";

function addTokenBandToMap(map, token, band) {
  if (!(map instanceof Map) || !token || !band) return;
  const normalized = normalizeToken(String(token || "").toLowerCase());
  const keys = new Set([normalized, normalized.replace(/'/g, "")]);
  for (const key of keys) {
    if (key) {
      map.set(key, band);
    }
  }
}

function buildStoredBandMap(sentence) {
  const storedWordLevels = sentence?.vocabulary_analysis_json?.word_levels;
  if (!storedWordLevels || typeof storedWordLevels !== "object") {
    return null;
  }
  const map = new Map();
  for (const [word, info] of Object.entries(storedWordLevels)) {
    if (info?.band) {
      addTokenBandToMap(map, word, info.band);
      if (info?.lemma) {
        addTokenBandToMap(map, info.lemma, info.band);
      }
    }
  }
  return map.size > 0 ? map : null;
}

export function lookupBandFromMap(map, token) {
  if (!(map instanceof Map)) return undefined;
  const normalized = normalizeToken(token);
  if (map.has(normalized)) return map.get(normalized);
  const withoutApostrophe = normalized.replace(/'/g, "");
  if (withoutApostrophe && map.has(withoutApostrophe)) return map.get(withoutApostrophe);
  return undefined;
}

export function useDifficultyHighlight({ lesson, currentSentenceIndex, accessToken, apiClient }) {
  const [analysisStatus, setAnalysisStatus] = useState("idle");
  const [bandMap, setBandMap] = useState(new Map());
  const [vocabEngineTick, setVocabEngineTick] = useState(0);
  const analyzerRef = useRef(null);
  const collinsLevel = useAppStore((state) => state.collinsLevel) || 3;

  const currentSentenceBandMap = useMemo(() => {
    const sentence = lesson?.sentences?.[currentSentenceIndex];
    const map = new Map(bandMap);
    if (map.size > 0) {
      return map;
    }
    const storedMap = buildStoredBandMap(sentence);
    if (storedMap) {
      return storedMap;
    }
    return map;
  }, [bandMap, currentSentenceIndex, lesson?.sentences, vocabEngineTick]);

  useEffect(() => {
    const sentence = lesson?.sentences?.[currentSentenceIndex];
    const tokens = Array.isArray(sentence?.tokens) ? sentence.tokens.filter(Boolean) : [];
    const storedMap = buildStoredBandMap(sentence);
    if (storedMap) {
      setBandMap(storedMap);
      setAnalysisStatus("complete");
      return;
    }
    if (!accessToken || !apiClient || tokens.length === 0) {
      setBandMap(new Map());
      setAnalysisStatus("idle");
      return;
    }

    let canceled = false;

    async function run() {
      setAnalysisStatus("analyzing");
      try {
        const payload = await classifyTokensByCollins(apiClient, accessToken, tokens);
        if (canceled) return;
        const nextMap = new Map();
        for (const item of Array.isArray(payload?.items) ? payload.items : []) {
          addTokenBandToMap(nextMap, item.token, item.band);
          addTokenBandToMap(nextMap, item.lemma, item.band);
        }
        setBandMap(nextMap);
        setVocabEngineTick((value) => value + 1);
        setAnalysisStatus("complete");
      } catch {
        if (canceled) return;
        setBandMap(new Map());
        setAnalysisStatus("idle");
      }
    }

    void run();
    return () => {
      canceled = true;
    };
  }, [accessToken, apiClient, currentSentenceIndex, lesson?.id, lesson?.sentences]);

  return {
    analysisStatus,
    bandMap: currentSentenceBandMap,
    collinsLevel,
    vocabEngineTick,
    analyzerRef,
    lookupBandFromMap,
    setAnalysisStatus,
  };
}

