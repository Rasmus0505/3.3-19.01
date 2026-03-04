import { ArrowLeft, ArrowRight, CheckCircle2, Eye, Link2, Loader2, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getStorageEstimate, getLessonMedia, readMediaDurationSeconds, requestPersistentStorage, saveLessonMedia } from "../../shared/media/localMediaStore";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../shared/ui";
import { getMediaExt, isAudioFilename, isVideoFilename, normalizeToken } from "./tokenNormalize";
import { useSentencePlayback } from "./useSentencePlayback";
import { useTypingFeedbackSounds } from "./useTypingFeedbackSounds";
import "./immersive.css";

const DISPLAY_MODE_STORAGE_KEY = "immersive_word_display_mode";
const LOCAL_MEDIA_REQUIRED_CODE = "LOCAL_MEDIA_REQUIRED";
const MEDIA_TYPE_BY_EXTENSION = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg; codecs=opus",
};

function getInitialDisplayMode() {
  if (typeof window === "undefined") return "underline";
  const saved = window.localStorage.getItem(DISPLAY_MODE_STORAGE_KEY);
  return saved === "chip" || saved === "underline" ? saved : "underline";
}

function countTokenInputErrors(inputValue, expectedToken) {
  const actual = String(inputValue || "");
  const expected = String(expectedToken || "");
  const sameLength = Math.min(actual.length, expected.length);

  let mismatchCount = 0;
  for (let idx = 0; idx < sameLength; idx += 1) {
    if (actual[idx]?.toLowerCase() !== expected[idx]?.toLowerCase()) {
      mismatchCount += 1;
    }
  }

  if (actual.length > expected.length) {
    mismatchCount += actual.length - expected.length;
  }
  return mismatchCount;
}

function buildLetterSlots(expectedToken, inputValue) {
  const expected = String(expectedToken || "");
  const actual = String(inputValue || "");
  const slots = [];

  for (let idx = 0; idx < expected.length; idx += 1) {
    const typedChar = actual[idx] || "";
    let state = "empty";
    if (typedChar) {
      state = typedChar.toLowerCase() === expected[idx].toLowerCase() ? "correct" : "wrong";
    }
    slots.push({
      key: `slot-${idx}`,
      char: typedChar || "\u00A0",
      state,
      extra: false,
    });
  }

  for (let idx = expected.length; idx < actual.length; idx += 1) {
    slots.push({
      key: `extra-${idx}`,
      char: actual[idx] || "\u00A0",
      state: "wrong",
      extra: true,
    });
  }

  if (!slots.length) {
    return [{ key: "slot-empty", char: "\u00A0", state: "empty", extra: false }];
  }
  return slots;
}

function createWordState(tokens) {
  const safeTokens = Array.isArray(tokens) ? tokens : [];
  return {
    activeWordIndex: 0,
    currentWordInput: "",
    wordInputs: safeTokens.map(() => ""),
    wordStatuses: safeTokens.map((_, idx) => (idx === 0 ? "active" : "pending")),
  };
}

function isEditableShortcutTarget(target) {
  if (!target) return false;
  if (target?.isContentEditable) return true;
  const tagName = String(target?.tagName || "").toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select";
}

function resolveMediaModeFromFileName(fileName) {
  if (isAudioFilename(fileName)) {
    return "audio";
  }
  // Unknown extensions should still try loading main media once.
  return "video";
}

function inferMediaModeFromContentType(contentType) {
  const normalized = String(contentType || "").toLowerCase();
  if (normalized.startsWith("video/")) {
    return "video";
  }
  if (normalized.startsWith("audio/")) {
    return "audio";
  }
  return "";
}

function inferMediaTypeFromFileName(fileName) {
  const ext = getMediaExt(fileName);
  return MEDIA_TYPE_BY_EXTENSION[ext] || "";
}

function resolveMediaModeByTypeAndName(mediaType, fileName) {
  const byType = inferMediaModeFromContentType(mediaType);
  if (byType) {
    return byType;
  }
  return resolveMediaModeFromFileName(fileName);
}

function isLocalMediaRequiredPayload(resp, payload) {
  return Number(resp?.status) === 409 && String(payload?.error_code || "").trim() === LOCAL_MEDIA_REQUIRED_CODE;
}

async function readErrorPayload(resp) {
  try {
    return await resp.clone().json();
  } catch (_) {
    return {};
  }
}

function formatMediaLoadError(resp, payload) {
  const statusText = Number(resp?.status) > 0 ? String(resp.status) : "";
  const message = String(payload?.message || "").trim();
  if (statusText && message) {
    return `媒体加载失败（${statusText}: ${message}）。`;
  }
  if (statusText) {
    return `媒体加载失败（${statusText}）。`;
  }
  if (message) {
    return `媒体加载失败（${message}）。`;
  }
  return "媒体加载失败。";
}

export function ImmersiveLessonPage({ lesson, accessToken, apiClient, onBack, onProgressSynced, immersiveActive = false, onExitImmersive }) {
  const [phase, setPhase] = useState("idle");
  const [mediaMode, setMediaMode] = useState("video");
  const [mediaBlobUrl, setMediaBlobUrl] = useState("");
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [mediaError, setMediaError] = useState("");
  const [needsBinding, setNeedsBinding] = useState(false);
  const [bindingBusy, setBindingBusy] = useState(false);
  const [bindingError, setBindingError] = useState("");
  const [bindingHint, setBindingHint] = useState("");
  const [mediaReloadKey, setMediaReloadKey] = useState(0);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
  const [completedIndexes, setCompletedIndexes] = useState([]);
  const [activeWordIndex, setActiveWordIndex] = useState(0);
  const [currentWordInput, setCurrentWordInput] = useState("");
  const [wordInputs, setWordInputs] = useState([]);
  const [wordStatuses, setWordStatuses] = useState([]);
  const [displayMode, setDisplayMode] = useState(() => getInitialDisplayMode());
  const [sentenceTypingDone, setSentenceTypingDone] = useState(false);
  const [sentencePlaybackDone, setSentencePlaybackDone] = useState(false);
  const [sentencePlaybackRequired, setSentencePlaybackRequired] = useState(true);

  const mediaElementRef = useRef(null);
  const clipAudioRef = useRef(null);
  const typingInputRef = useRef(null);
  const bindingInputRef = useRef(null);
  const currentWordInputRef = useRef("");
  const sentenceAdvanceLockedRef = useRef(false);
  const typingEnabled = Boolean(lesson?.sentences?.[currentSentenceIndex]) && phase !== "transition" && phase !== "lesson_completed";
  const focusTypingInput = useCallback(() => {
    if (!typingEnabled) return;
    requestAnimationFrame(() => {
      const input = typingInputRef.current;
      if (!input) return;
      input.focus({ preventScroll: true });
      const len = String(input.value || "").length;
      try {
        input.setSelectionRange(len, len);
      } catch (_) {
        // Ignore selection errors for unsupported input types/browsers.
      }
    });
  }, [typingEnabled]);

  const currentSentence = lesson?.sentences?.[currentSentenceIndex] || null;
  const expectedTokens = useMemo(() => (Array.isArray(currentSentence?.tokens) ? currentSentence.tokens : []), [currentSentence?.tokens]);
  const sentenceCount = lesson?.sentences?.length || 0;
  const expectedSourceDurationSec = Math.max(0, Number(lesson?.source_duration_ms || 0) / 1000);

  const { playKeySound, playWrongSound, playCorrectSound } = useTypingFeedbackSounds();

  const resetSentenceGate = useCallback((playbackRequired = true) => {
    sentenceAdvanceLockedRef.current = false;
    setSentenceTypingDone(false);
    setSentencePlaybackDone(false);
    setSentencePlaybackRequired(Boolean(playbackRequired));
  }, []);

  const syncProgress = useCallback(
    async (nextIndex, nextCompleted, lastPlayedAtMs) => {
      if (!lesson) return;
      try {
        await apiClient(
          `/api/lessons/${lesson.id}/progress`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              current_sentence_index: Math.max(0, nextIndex),
              completed_sentence_indexes: nextCompleted,
              last_played_at_ms: Math.max(0, Number(lastPlayedAtMs || 0)),
            }),
          },
          accessToken,
        );
      } catch (error) {
        // Ignore sync errors to avoid interrupting learning flow.
      }
    },
    [accessToken, apiClient, lesson],
  );

  const resetWordTyping = useCallback((sentence, playbackRequired = true) => {
    const next = createWordState(sentence?.tokens || []);
    setActiveWordIndex(next.activeWordIndex);
    setCurrentWordInput(next.currentWordInput);
    setWordInputs(next.wordInputs);
    setWordStatuses(next.wordStatuses);
    currentWordInputRef.current = "";
    resetSentenceGate(playbackRequired);
  }, [resetSentenceGate]);

  const handleSentencePassed = useCallback(async () => {
    if (!lesson || !currentSentence) return;

    const nextCompleted = Array.from(new Set([...completedIndexes, currentSentence.idx])).sort((a, b) => a - b);
    setCompletedIndexes(nextCompleted);

    const nextIdx = currentSentenceIndex + 1;
    const lastIdx = Math.max(0, sentenceCount - 1);
    const progressIdx = Math.min(nextIdx, lastIdx);
    await syncProgress(progressIdx, nextCompleted, currentSentence.end_ms);
    onProgressSynced?.();

    if (nextIdx > lastIdx) {
      setPhase("lesson_completed");
      return;
    }

    resetWordTyping(lesson?.sentences?.[nextIdx], true);
    setCurrentSentenceIndex(nextIdx);
    setPhase("auto_play_pending");
  }, [completedIndexes, currentSentence, currentSentenceIndex, lesson, onProgressSynced, resetWordTyping, sentenceCount, syncProgress]);

  const onSentenceFinished = useCallback(() => {
    setSentencePlaybackDone(true);
    if (!expectedTokens.length) {
      setSentenceTypingDone(true);
      return;
    }
    setPhase("typing");
  }, [expectedTokens.length]);

  const { isPlaying, playSentence, stopPlayback, onMainMediaTimeUpdate } = useSentencePlayback({
    mode: mediaMode,
    mediaElementRef,
    clipAudioRef,
    apiClient,
    accessToken,
    onSentenceFinished,
  });

  const tryPlayCurrentSentence = useCallback(
    async ({ manual = false } = {}) => {
      if (!currentSentence) return;
      if (needsBinding) {
        setMediaError("当前课程缺少可播放媒体，请先绑定本地文件。");
        setSentencePlaybackRequired(false);
        if (!expectedTokens.length) {
          setSentenceTypingDone(true);
        }
        setPhase("typing");
        return;
      }
      const result = await playSentence(currentSentence);
      if (result.ok) {
        setSentencePlaybackRequired(true);
        setSentencePlaybackDone(false);
        setMediaError("");
        setPhase("playing");
        return;
      }
      if (result.reason === "clip_unavailable") {
        setNeedsBinding(true);
        setSentencePlaybackRequired(false);
        if (!expectedTokens.length) {
          setSentenceTypingDone(true);
        }
        setMediaError("媒体不可用，请绑定本地文件继续。");
        setPhase("typing");
        return;
      }
      if (result.reason === "autoplay_blocked") {
        setSentencePlaybackRequired(false);
        if (!expectedTokens.length) {
          setSentenceTypingDone(true);
        }
        setPhase("typing");
        setMediaError(
          manual
            ? "浏览器仍阻止自动播放。你可以继续输入，或稍后点击“重播本句”。"
            : "自动播放受限。你可以直接输入，或点击“重播本句”手动播放。",
        );
        return;
      }
      setSentencePlaybackRequired(false);
      if (!expectedTokens.length) {
        setSentenceTypingDone(true);
      }
      setMediaError("媒体不可用，已切换到句级音频播放，你可以继续输入。");
      setPhase("typing");
    },
    [currentSentence, expectedTokens.length, needsBinding, playSentence],
  );

  useEffect(() => {
    if (!lesson) return;
    stopPlayback();
    setMediaError("");
    setBindingError("");
    setBindingHint("");
    setNeedsBinding(false);
    setMediaBlobUrl("");
    setMediaReady(false);
    setMediaLoading(false);

    const savedIdx = Number.isInteger(lesson?.progress?.current_sentence_index) ? lesson.progress.current_sentence_index : 0;
    const safeIdx = Math.min(Math.max(savedIdx, 0), Math.max(0, (lesson?.sentences?.length || 1) - 1));
    const savedCompleted = Array.isArray(lesson?.progress?.completed_sentence_indexes)
      ? Array.from(new Set(lesson.progress.completed_sentence_indexes)).sort((a, b) => a - b)
      : [];
    setCurrentSentenceIndex(safeIdx);
    setCompletedIndexes(savedCompleted);
    resetWordTyping(lesson?.sentences?.[safeIdx], true);
    setPhase("idle");

    const fileName = String(lesson.source_filename || "");
    const preferredMode = isVideoFilename(fileName) ? "video" : resolveMediaModeFromFileName(fileName);
    setMediaMode(preferredMode);
  }, [lesson?.id, resetWordTyping, stopPlayback]);

  useEffect(() => {
    if (!lesson) return;
    let canceled = false;
    let objectUrl = "";

    async function loadMediaBlob() {
      setMediaLoading(true);
      setMediaReady(false);
      setMediaError("");
      setPhase("idle");
      setNeedsBinding(false);
      try {
        const localMedia = await getLessonMedia(lesson.id);
        if (canceled) return;
        if (localMedia?.blob) {
          objectUrl = URL.createObjectURL(localMedia.blob);
          const localMediaType = String(localMedia.media_type || inferMediaTypeFromFileName(localMedia.file_name || lesson.source_filename || ""));
          setMediaMode(resolveMediaModeByTypeAndName(localMediaType, localMedia.file_name || lesson.source_filename || ""));
          setMediaBlobUrl(objectUrl);
          setBindingHint("已加载浏览器本地媒体");
          setMediaLoading(false);
          return;
        }
      } catch (error) {
        // Ignore local media read errors and fallback to server media loading.
      }

      if (lesson.media_storage !== "server") {
        if (canceled) return;
        setMediaBlobUrl("");
        setNeedsBinding(true);
        setBindingHint("");
        setMediaError("当前课程媒体仅保存在浏览器本地，请先绑定本地文件。");
        setMediaLoading(false);
        return;
      }

      try {
        const resp = await apiClient(`/api/lessons/${lesson.id}/media`, {}, accessToken);
        if (!resp.ok || canceled) {
          if (canceled) return;
          const payload = await readErrorPayload(resp);
          if (canceled) return;
          setMediaBlobUrl("");
          if (isLocalMediaRequiredPayload(resp, payload) || Number(resp.status) === 404) {
            setNeedsBinding(true);
            setMediaError("服务器媒体不可用，请绑定本地文件继续学习。");
          } else {
            setNeedsBinding(true);
            setMediaError(`${formatMediaLoadError(resp, payload)} 请绑定本地文件继续。`);
          }
          return;
        }

        const rawContentType = String(resp.headers.get("content-type") || "").toLowerCase();
        let blob = await resp.blob();
        const fallbackType = inferMediaTypeFromFileName(lesson?.source_filename || "");
        const needsTypeOverride =
          (!rawContentType || rawContentType.startsWith("application/octet-stream")) && Boolean(fallbackType);
        if (needsTypeOverride) {
          blob = new Blob([blob], { type: fallbackType });
        }
        objectUrl = URL.createObjectURL(blob);
        if (canceled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setMediaMode(resolveMediaModeByTypeAndName(blob.type || rawContentType, lesson?.source_filename || ""));
        setMediaBlobUrl(objectUrl);
        setBindingHint("");
        setMediaLoading(false);
      } catch (error) {
        if (canceled) return;
        const detail = String(error || "").trim();
        setMediaBlobUrl("");
        setNeedsBinding(true);
        setMediaError(detail ? `媒体加载异常（${detail}），请绑定本地文件。` : "媒体加载异常，请绑定本地文件。");
      } finally {
        if (!canceled) {
          setMediaLoading(false);
        }
      }
    }

    loadMediaBlob();

    return () => {
      canceled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [accessToken, apiClient, lesson?.id, lesson?.media_storage, lesson?.source_filename, mediaReloadKey]);

  useEffect(() => {
    if (needsBinding) return;
    if (mediaMode === "clip") return;
    if (!mediaReady) return;
    if (!mediaBlobUrl) return;
    setPhase("auto_play_pending");
  }, [mediaBlobUrl, mediaMode, mediaReady, needsBinding]);

  useEffect(() => {
    if (!currentSentence) return;
    if (needsBinding) return;
    if (phase !== "auto_play_pending") return;
    if (mediaMode !== "clip" && !mediaReady) return;
    tryPlayCurrentSentence();
  }, [currentSentence, mediaMode, mediaReady, needsBinding, phase, tryPlayCurrentSentence]);

  useEffect(() => {
    if (!typingEnabled) return;
    focusTypingInput();
  }, [activeWordIndex, currentSentenceIndex, focusTypingInput, typingEnabled]);

  useEffect(() => {
    if (!typingEnabled || !immersiveActive) return undefined;
    if (typeof window === "undefined") return undefined;

    const onPointerDownCapture = () => {
      setTimeout(() => {
        focusTypingInput();
      }, 0);
    };

    window.addEventListener("pointerdown", onPointerDownCapture, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDownCapture, true);
    };
  }, [focusTypingInput, immersiveActive, typingEnabled]);

  useEffect(() => {
    if (!sentenceTypingDone) return;
    if (sentencePlaybackRequired && !sentencePlaybackDone) return;
    if (sentenceAdvanceLockedRef.current) return;
    sentenceAdvanceLockedRef.current = true;
    setPhase("transition");
    setTimeout(() => {
      void handleSentencePassed();
    }, 120);
  }, [handleSentencePassed, sentencePlaybackDone, sentencePlaybackRequired, sentenceTypingDone]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(DISPLAY_MODE_STORAGE_KEY, displayMode);
  }, [displayMode]);

  const handleMainMediaError = useCallback(() => {
    const hasClipFallback = lesson?.media_storage === "server" && Array.isArray(lesson?.sentences) && lesson.sentences.some((item) => item?.audio_url);
    if (hasClipFallback) {
      setMediaMode("clip");
      setMediaError("媒体不可用，已切换到句级音频播放，你可以继续输入。");
      setPhase("auto_play_pending");
      return;
    }
    setMediaBlobUrl("");
    setNeedsBinding(true);
    setMediaError("当前媒体格式无法播放，请绑定本地文件继续。");
    setPhase("typing");
  }, [lesson?.media_storage, lesson?.sentences]);

  const handleBindLocalFile = useCallback(
    async (nextFile) => {
      if (!lesson?.id || !nextFile) return;
      setBindingBusy(true);
      setBindingError("");
      setBindingHint("");
      try {
        const localDurationSec = await readMediaDurationSeconds(nextFile, nextFile.name || lesson.source_filename || "");
        if (expectedSourceDurationSec > 0) {
          const delta = Math.abs(localDurationSec - expectedSourceDurationSec);
          if (delta > 0.5) {
            setBindingError(
              `绑定失败：文件时长差 ${delta.toFixed(3)} 秒，超过 0.5 秒阈值（本地 ${localDurationSec.toFixed(3)} 秒，课程 ${expectedSourceDurationSec.toFixed(3)} 秒）。`,
            );
            return;
          }
        }

        await requestPersistentStorage();
        await saveLessonMedia(lesson.id, nextFile);
        setNeedsBinding(false);
        setMediaError("");
        setBindingHint("本地媒体已绑定，正在加载。");
        setMediaReloadKey((value) => value + 1);
      } catch (error) {
        let message = `绑定失败：${String(error)}`;
        try {
          const estimate = await getStorageEstimate();
          if (estimate && Number.isFinite(estimate.quota) && Number.isFinite(estimate.usage) && estimate.quota > 0) {
            const usageRatio = (estimate.usage / estimate.quota) * 100;
            message = `${message}（存储占用约 ${usageRatio.toFixed(1)}%）`;
          }
        } catch (_) {
          // ignore estimate errors
        }
        setBindingError(message);
      } finally {
        setBindingBusy(false);
      }
    },
    [expectedSourceDurationSec, lesson?.id, lesson?.source_filename],
  );

  const clearActiveWordInput = useCallback(() => {
    currentWordInputRef.current = "";
    setCurrentWordInput("");
    setWordInputs((prev) => {
      const next = [...prev];
      if (activeWordIndex < next.length) {
        next[activeWordIndex] = "";
      }
      return next;
    });
    setWordStatuses((prev) => {
      const next = [...prev];
      if (activeWordIndex < next.length) {
        next[activeWordIndex] = "active";
      }
      return next;
    });
  }, [activeWordIndex]);

  const commitCorrectWord = useCallback(
    (typedWord) => {
      playCorrectSound();
      setWordStatuses((prev) => {
        const next = [...prev];
        next[activeWordIndex] = "correct";
        if (activeWordIndex + 1 < expectedTokens.length) {
          next[activeWordIndex + 1] = "active";
        }
        return next;
      });
      setWordInputs((prev) => {
        const next = [...prev];
        next[activeWordIndex] = typedWord.trim();
        return next;
      });
      currentWordInputRef.current = "";
      setCurrentWordInput("");

      if (activeWordIndex + 1 >= expectedTokens.length) {
        setSentenceTypingDone(true);
        return;
      }
      setActiveWordIndex((prev) => prev + 1);
    },
    [activeWordIndex, expectedTokens.length, playCorrectSound],
  );

  const commitWrongWord = useCallback(() => {
    playWrongSound();
    clearActiveWordInput();
  }, [clearActiveWordInput, playWrongSound]);

  const exitImmersive = useCallback(
    (source = "button") => {
      const handler = typeof onExitImmersive === "function" ? onExitImmersive : onBack;
      if (typeof handler !== "function") return;
      handler(source);
    },
    [onBack, onExitImmersive],
  );

  const jumpToSentence = useCallback(
    async (targetIndex, source = "manual") => {
      if (!lesson || sentenceCount <= 0) return;
      const safeTarget = Math.max(0, Math.min(sentenceCount - 1, Number(targetIndex) || 0));
      if (safeTarget === currentSentenceIndex) return;

      stopPlayback();
      setPhase("auto_play_pending");
      setCurrentSentenceIndex(safeTarget);
      resetWordTyping(lesson?.sentences?.[safeTarget], true);
      await syncProgress(safeTarget, completedIndexes, lesson?.sentences?.[safeTarget]?.begin_ms || 0);
      onProgressSynced?.();
    },
    [completedIndexes, currentSentenceIndex, lesson, onProgressSynced, resetWordTyping, sentenceCount, stopPlayback, syncProgress],
  );

  const goToPreviousSentence = useCallback(
    (source = "button_prev") => {
      if (currentSentenceIndex <= 0) return;
      void jumpToSentence(currentSentenceIndex - 1, source);
    },
    [currentSentenceIndex, jumpToSentence],
  );

  const goToNextSentence = useCallback(
    (source = "button_next") => {
      if (currentSentenceIndex >= sentenceCount - 1) return;
      void jumpToSentence(currentSentenceIndex + 1, source);
    },
    [currentSentenceIndex, jumpToSentence, sentenceCount],
  );

  const revealCurrentWord = useCallback(
    (source = "button_reveal") => {
      if (!typingEnabled) return;
      const expected = expectedTokens[activeWordIndex] || "";
      if (!expected) return;
      commitCorrectWord(expected);
    },
    [activeWordIndex, commitCorrectWord, expectedTokens, typingEnabled],
  );

  const replayCurrentSentence = useCallback(
    (source = "button_replay") => {
      if (!currentSentence || mediaLoading || phase === "transition" || needsBinding) return;
      void tryPlayCurrentSentence({ manual: true });
    },
    [currentSentence, mediaLoading, needsBinding, phase, tryPlayCurrentSentence],
  );

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const onWindowKeyDown = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const fromTypingInput = event.target === typingInputRef.current;
      if (isEditableShortcutTarget(event.target) && !fromTypingInput) return;
      const isReplayShortcut = event.shiftKey && event.key.toLowerCase() === "r";
      if (!immersiveActive && !isReplayShortcut) return;

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        exitImmersive("shortcut_esc");
        return;
      }
      if (isReplayShortcut) {
        event.preventDefault();
        event.stopPropagation();
        replayCurrentSentence("shortcut_shift_r");
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        goToNextSentence("shortcut_enter");
        return;
      }
      if (event.key === " ") {
        event.preventDefault();
        event.stopPropagation();
        revealCurrentWord("shortcut_space");
      }
    };

    window.addEventListener("keydown", onWindowKeyDown);
    return () => {
      window.removeEventListener("keydown", onWindowKeyDown);
    };
  }, [exitImmersive, goToNextSentence, immersiveActive, replayCurrentSentence, revealCurrentWord]);

  const handleKeyDown = useCallback(
    (event) => {
      if (!currentSentence) return;

      const key = event.key;
      if (key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        exitImmersive("shortcut_esc");
        return;
      }
      if (event.shiftKey && key.toLowerCase() === "r") {
        event.preventDefault();
        event.stopPropagation();
        replayCurrentSentence("shortcut_shift_r");
        return;
      }
      if (key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        goToNextSentence("shortcut_enter");
        return;
      }
      if (key === " ") {
        event.preventDefault();
        event.stopPropagation();
        revealCurrentWord("shortcut_space");
        return;
      }

      if (!typingEnabled) return;

      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      if (key === "Backspace") {
        event.preventDefault();
        playKeySound();
        const nextInput = currentWordInputRef.current.slice(0, -1);
        currentWordInputRef.current = nextInput;
        setCurrentWordInput(nextInput);
        setWordInputs((prev) => {
          const next = [...prev];
          next[activeWordIndex] = nextInput;
          return next;
        });
        setWordStatuses((prev) => {
          const next = [...prev];
          next[activeWordIndex] = "active";
          return next;
        });
        return;
      }

      if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        playKeySound();
        const expected = expectedTokens[activeWordIndex] || "";
        if (!expected) return;

        const nextInput = `${currentWordInputRef.current}${key}`;
        currentWordInputRef.current = nextInput;
        setCurrentWordInput(nextInput);
        setWordInputs((prev) => {
          const next = [...prev];
          next[activeWordIndex] = nextInput;
          return next;
        });
        setWordStatuses((prev) => {
          const next = [...prev];
          next[activeWordIndex] = "active";
          return next;
        });

        const errorCount = countTokenInputErrors(nextInput, expected);
        if (errorCount > 2) {
          commitWrongWord();
          return;
        }

        if (nextInput.length >= expected.length) {
          const normalizedInput = normalizeToken(nextInput);
          if (normalizedInput === expected) {
            commitCorrectWord(nextInput);
          } else {
            commitWrongWord();
          }
        }
      }
    },
    [
      activeWordIndex,
      commitCorrectWord,
      commitWrongWord,
      currentSentence,
      exitImmersive,
      expectedTokens,
      goToNextSentence,
      playKeySound,
      replayCurrentSentence,
      revealCurrentWord,
      typingEnabled,
    ],
  );

  if (!lesson || !currentSentence) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">沉浸学习</CardTitle>
          <CardDescription>当前课程暂无可学习句子。</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const phaseLabelMap = {
    idle: "准备中",
    auto_play_pending: "即将播放",
    playing: "播放中",
    typing: "输入中",
    transition: "切换下一句",
    lesson_completed: "已完成",
  };

  const showMediaLoadingOverlay = mediaLoading && !needsBinding && !mediaReady;
  const canGoPrevious = currentSentenceIndex > 0;
  const canGoNext = currentSentenceIndex < Math.max(0, sentenceCount - 1);
  const canRevealWord = typingEnabled && activeWordIndex < expectedTokens.length && expectedTokens.length > 0;
  const canReplaySentence = Boolean(currentSentence) && !mediaLoading && phase !== "transition" && !needsBinding;

  return (
    <Card className={`immersive-page ${immersiveActive ? "immersive-page--immersive" : ""}`} onClick={focusTypingInput}>
      <CardHeader>
        <div className="immersive-header">
          <div className="immersive-header-left">
            {immersiveActive && (typeof onExitImmersive === "function" || typeof onBack === "function") ? (
              <TooltipProvider delayDuration={120}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" onClick={() => exitImmersive("button")}>
                      <ArrowLeft className="size-4" />
                      退出沉浸
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>esc</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null}
            <div>
              <CardTitle className="text-base">沉浸式拼写训练</CardTitle>
              <CardDescription>
                第 {Math.min(currentSentenceIndex + 1, sentenceCount)} / {sentenceCount} 句
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{phaseLabelMap[phase] || "学习中"}</Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="immersive-media">
          {!needsBinding && mediaMode === "video" ? (
            <video
              ref={mediaElementRef}
              src={mediaBlobUrl || undefined}
              preload="metadata"
              onLoadedMetadata={() => setMediaReady(true)}
              onCanPlay={() => setMediaReady(true)}
              onError={handleMainMediaError}
              onTimeUpdate={onMainMediaTimeUpdate}
              controls
              playsInline
            />
          ) : null}

          {!needsBinding && mediaMode === "audio" ? (
            <div className="w-full px-6">
              <div className="immersive-media-audio-placeholder">
                <p>音频素材模式</p>
                <p className="immersive-hint">将按句自动播放并在下方拼写。</p>
              </div>
              <audio
                ref={mediaElementRef}
                src={mediaBlobUrl || undefined}
                preload="metadata"
                onLoadedMetadata={() => setMediaReady(true)}
                onCanPlay={() => setMediaReady(true)}
                onError={handleMainMediaError}
                onTimeUpdate={onMainMediaTimeUpdate}
                controls
              />
            </div>
          ) : null}

          {!needsBinding && mediaMode === "clip" ? (
            <div className="w-full px-6">
              <div className="immersive-media-audio-placeholder">
                <p>音频降级模式</p>
                <p className="immersive-hint">媒体不可用，已改为逐句音频播放。</p>
              </div>
              <audio ref={clipAudioRef} controls />
            </div>
          ) : null}

          {showMediaLoadingOverlay ? (
            <div className="immersive-overlay">
              <Button variant="secondary" disabled>
                <Loader2 className="size-4 animate-spin" />
                媒体加载中
              </Button>
            </div>
          ) : null}

        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={needsBinding ? "secondary" : "outline"}
            onClick={() => bindingInputRef.current?.click()}
            disabled={bindingBusy}
          >
            {bindingBusy ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
            绑定本地文件
          </Button>
          <TooltipProvider delayDuration={120}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" onClick={() => replayCurrentSentence("button_replay")} disabled={!canReplaySentence}>
                  <RotateCcw className="size-4" />
                  重播本句
                </Button>
              </TooltipTrigger>
              <TooltipContent>shift+r</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider delayDuration={120}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" onClick={() => revealCurrentWord("button_reveal")} disabled={!canRevealWord}>
                  <Eye className="size-4" />
                  提示单词
                </Button>
              </TooltipTrigger>
              <TooltipContent>space</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button variant="outline" onClick={() => goToPreviousSentence("button_prev")} disabled={!canGoPrevious || phase === "transition"}>
            <ArrowLeft className="size-4" />
            上一句
          </Button>
          <TooltipProvider delayDuration={120}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" onClick={() => goToNextSentence("button_next")} disabled={!canGoNext || phase === "transition"}>
                  下一句
                  <ArrowRight className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>enter</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Badge variant="outline">
            已完成 {completedIndexes.length} / {sentenceCount}
          </Badge>
          {isPlaying ? <Badge variant="secondary">正在播放本句</Badge> : null}
          {bindingHint ? (
            <Badge variant="secondary">
              <CheckCircle2 className="size-4" />
              {bindingHint}
            </Badge>
          ) : null}

          {needsBinding ? (
            <div className="w-full px-6">
              <div className="immersive-media-audio-placeholder">
                <p>待绑定本地媒体</p>
                <p className="immersive-hint">课程可见，但播放受限。请点击“绑定本地文件”。</p>
              </div>
            </div>
          ) : null}
          {mediaError ? <p className="text-xs text-destructive">{mediaError}</p> : null}
          {bindingError ? <p className="text-xs text-destructive">{bindingError}</p> : null}
          {sentenceTypingDone && !sentencePlaybackDone && sentencePlaybackRequired ? (
            <p className="text-xs text-muted-foreground">输入已完成，等待本句播放结束。</p>
          ) : null}
        </div>

        <div className="immersive-shortcut-bar" role="note" aria-label="快捷键提示">
          <span className="immersive-shortcut-bar__title">快捷键</span>
          <span className="immersive-shortcut-bar__item">
            <kbd>Esc</kbd>
            <span>退出沉浸</span>
          </span>
          <span className="immersive-shortcut-bar__item">
            <kbd>Shift+R</kbd>
            <span>重播本句</span>
          </span>
          <span className="immersive-shortcut-bar__item">
            <kbd>Enter</kbd>
            <span>下一句</span>
          </span>
          <span className="immersive-shortcut-bar__item">
            <kbd>Space</kbd>
            <span>提示单词</span>
          </span>
        </div>

        <div className="immersive-typing">
          <div className="immersive-typing-toolbar">
            <p className="immersive-hint">输入满单词长度后自动判定；错误较多时会提示重输。</p>
            <div className="immersive-display-toggle">
              <span className="text-xs text-muted-foreground">
                显示模式：{displayMode === "underline" ? "下划线" : "卡片"}
              </span>
              <Switch
                checked={displayMode === "underline"}
                onCheckedChange={(checked) => setDisplayMode(checked ? "underline" : "chip")}
                aria-label="切换单词显示模式"
              />
            </div>
          </div>

          <div className="immersive-word-row">
            {expectedTokens.map((token, index) => {
              const status = wordStatuses[index] || "pending";
              const slots = buildLetterSlots(token, wordInputs[index] || "");
              return (
                <div
                  key={`${token}-${index}`}
                  className={`immersive-word-slot immersive-word-slot--${status} ${
                    displayMode === "underline" ? "immersive-word-slot--underline" : "immersive-word-slot--chip"
                  }`}
                >
                  <div className="immersive-letter-row">
                    {slots.map((slot) => (
                      <span
                        key={slot.key}
                        className={`immersive-letter-cell immersive-letter-cell--${slot.state} ${
                          slot.extra ? "immersive-letter-cell--extra" : ""
                        }`}
                      >
                        <span className="immersive-letter-char">{slot.char}</span>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-sm text-muted-foreground">
            当前句中文：{currentSentence.text_zh || "(翻译失败，暂缺)"}
          </p>
          {phase === "lesson_completed" ? <p className="text-sm text-primary">本课已完成。可返回课程历史继续下一课。</p> : null}
        </div>

        <input
          ref={bindingInputRef}
          type="file"
          accept="video/*,audio/*"
          className="hidden"
          onChange={(event) => {
            const nextFile = event.target.files?.[0] ?? null;
            if (nextFile) {
              void handleBindLocalFile(nextFile);
            }
            event.target.value = "";
          }}
        />

        <input
          ref={typingInputRef}
          className="immersive-hidden-input"
          value={currentWordInput}
          onChange={() => {}}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (typingEnabled) {
              setTimeout(() => {
                focusTypingInput();
              }, 0);
            }
          }}
          autoComplete="off"
          spellCheck={false}
          readOnly={!typingEnabled}
        />
      </CardContent>
    </Card>
  );
}








