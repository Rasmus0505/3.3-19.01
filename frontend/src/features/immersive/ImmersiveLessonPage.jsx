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
  const errorCode = String(payload?.error_code || "").trim();
  const message = String(payload?.message || "").trim();
  const head = [statusText, errorCode].filter(Boolean).join(" ");
  if (head && message) {
    return `濯掍綋鍔犺浇澶辫触锛?{head}: ${message}锛夈€俙;
  }
  if (head) {
    return `濯掍綋鍔犺浇澶辫触锛?{head}锛夈€俙;
  }
  if (message) {
    return `濯掍綋鍔犺浇澶辫触锛?{message}锛夈€俙;
  }
  return "濯掍綋鍔犺浇澶辫触銆?;
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

  const mediaElementRef = useRef(null);
  const clipAudioRef = useRef(null);
  const typingInputRef = useRef(null);
  const bindingInputRef = useRef(null);
  const currentWordInputRef = useRef("");
  const focusTypingInput = useCallback(() => {
    if (phase !== "typing") return;
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
  }, [phase]);

  const currentSentence = lesson?.sentences?.[currentSentenceIndex] || null;
  const expectedTokens = useMemo(() => (Array.isArray(currentSentence?.tokens) ? currentSentence.tokens : []), [currentSentence?.tokens]);
  const sentenceCount = lesson?.sentences?.length || 0;
  const expectedSourceDurationSec = Math.max(0, Number(lesson?.source_duration_ms || 0) / 1000);

  const { playKeySound, playWrongSound, playCorrectSound } = useTypingFeedbackSounds();

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

    setCurrentSentenceIndex(nextIdx);
    setPhase("auto_play_pending");
  }, [completedIndexes, currentSentence, currentSentenceIndex, lesson, onProgressSynced, sentenceCount, syncProgress]);

  const onSentenceFinished = useCallback(() => {
    if (!expectedTokens.length) {
      handleSentencePassed();
      return;
    }
    setPhase("typing");
  }, [expectedTokens.length, handleSentencePassed]);

  const { isPlaying, playSentence, stopPlayback, onMainMediaTimeUpdate } = useSentencePlayback({
    mode: mediaMode,
    mediaElementRef,
    clipAudioRef,
    apiClient,
    accessToken,
    onSentenceFinished,
  });

  const resetWordTyping = useCallback((sentence) => {
    const next = createWordState(sentence?.tokens || []);
    setActiveWordIndex(next.activeWordIndex);
    setCurrentWordInput(next.currentWordInput);
    setWordInputs(next.wordInputs);
    setWordStatuses(next.wordStatuses);
    currentWordInputRef.current = "";
  }, []);

  const tryPlayCurrentSentence = useCallback(
    async ({ manual = false } = {}) => {
      if (!currentSentence) return;
      if (needsBinding) {
        setMediaError("褰撳墠璇剧▼缂哄皯鍙挱鏀惧獟浣擄紝璇峰厛缁戝畾鏈湴鏂囦欢銆?);
        setPhase("typing");
        return;
      }
      resetWordTyping(currentSentence);
      const result = await playSentence(currentSentence);
      if (result.ok) {
        setMediaError("");
        setPhase("playing");
        return;
      }
      if (result.reason === "clip_unavailable") {
        setNeedsBinding(true);
        setMediaError("鏈彞鏈嶅姟绔煶棰戜笉鍙敤锛岃鍏堢粦瀹氭湰鍦版枃浠躲€?);
        setPhase("typing");
        return;
      }
      if (result.reason === "autoplay_blocked") {
        setPhase("typing");
        setMediaError(
          manual
            ? "娴忚鍣ㄤ粛闃绘鑷姩鎾斁锛屽彲缁х画杈撳叆锛屾垨绋嶅悗鐐瑰嚮鈥滈噸鎾湰鍙モ€濄€?
            : "鑷姩鎾斁鍙楅檺锛屽彲鐩存帴杈撳叆锛屾垨鐐瑰嚮鈥滈噸鎾湰鍙モ€濇墜鍔ㄦ挱鏀俱€?,
        );
        return;
      }
      setMediaError("褰撳墠鍙ユ挱鏀惧け璐ワ紝宸插垏鎹负杈撳叆妯″紡銆?);
      setPhase("typing");
    },
    [currentSentence, needsBinding, playSentence, resetWordTyping],
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
    resetWordTyping(lesson?.sentences?.[safeIdx]);
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
          setBindingHint("宸插姞杞芥祻瑙堝櫒鏈湴濯掍綋");
          setMediaLoading(false);
          console.debug("[DEBUG] immersive.media.local_loaded", { lessonId: lesson.id });
          return;
        }
      } catch (error) {
        console.debug("[DEBUG] immersive.media.local_read_failed", { lessonId: lesson.id, error: String(error) });
      }

      if (lesson.media_storage !== "server") {
        if (canceled) return;
        setMediaBlobUrl("");
        setNeedsBinding(true);
        setBindingHint("");
        setMediaError("褰撳墠璇剧▼濯掍綋浠呬繚瀛樺湪娴忚鍣ㄦ湰鍦帮紝璇峰厛缁戝畾鏈湴鏂囦欢銆?);
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
            setMediaError("鏈嶅姟鍣ㄥ獟浣撲笉鍙敤锛岃缁戝畾鏈湴鏂囦欢缁х画瀛︿範銆?);
          } else {
            setNeedsBinding(true);
            setMediaError(`${formatMediaLoadError(resp, payload)} 璇风粦瀹氭湰鍦版枃浠剁户缁€俙);
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
        setMediaError(detail ? `濯掍綋鍔犺浇寮傚父锛?{detail}锛夛紝璇风粦瀹氭湰鍦版枃浠躲€俙 : "濯掍綋鍔犺浇寮傚父锛岃缁戝畾鏈湴鏂囦欢銆?);
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
    if (phase !== "typing") return;
    focusTypingInput();
  }, [activeWordIndex, currentSentenceIndex, focusTypingInput, phase]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(DISPLAY_MODE_STORAGE_KEY, displayMode);
  }, [displayMode]);

  const handleMainMediaError = useCallback(() => {
    const hasClipFallback = lesson?.media_storage === "server" && Array.isArray(lesson?.sentences) && lesson.sentences.some((item) => item?.audio_url);
    if (hasClipFallback) {
      setMediaMode("clip");
      setMediaError("褰撳墠娴忚鍣ㄤ笉鏀寔璇ュ獟浣撴牸寮忥紝宸茶嚜鍔ㄥ垏鎹负鍙ョ骇闊抽妯″紡銆?);
      setPhase("auto_play_pending");
      return;
    }
    setMediaBlobUrl("");
    setNeedsBinding(true);
    setMediaError("褰撳墠濯掍綋鏍煎紡鏃犳硶鎾斁锛岃缁戝畾鏈湴鏂囦欢缁х画銆?);
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
              `缁戝畾澶辫触锛氭枃浠舵椂闀垮樊 ${delta.toFixed(3)} 绉掞紝瓒呰繃 0.5 绉掗槇鍊硷紙鏈湴 ${localDurationSec.toFixed(3)} 绉掞紝璇剧▼ ${expectedSourceDurationSec.toFixed(3)} 绉掞級銆俙,
            );
            return;
          }
        }

        await requestPersistentStorage();
        await saveLessonMedia(lesson.id, nextFile);
        console.debug("[DEBUG] immersive.media.bound_local_file", { lessonId: lesson.id });
        setNeedsBinding(false);
        setMediaError("");
        setBindingHint("鏈湴濯掍綋宸茬粦瀹氾紝姝ｅ湪鍔犺浇銆?);
        setMediaReloadKey((value) => value + 1);
      } catch (error) {
        let message = `缁戝畾澶辫触锛?{String(error)}`;
        try {
          const estimate = await getStorageEstimate();
          if (estimate && Number.isFinite(estimate.quota) && Number.isFinite(estimate.usage) && estimate.quota > 0) {
            const usageRatio = (estimate.usage / estimate.quota) * 100;
            message = `${message}锛堝瓨鍌ㄥ崰鐢ㄧ害 ${usageRatio.toFixed(1)}%锛塦;
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
        setPhase("transition");
        setTimeout(() => {
          handleSentencePassed();
        }, 120);
        return;
      }
      setActiveWordIndex((prev) => prev + 1);
    },
    [activeWordIndex, expectedTokens.length, handleSentencePassed, playCorrectSound],
  );

  const commitWrongWord = useCallback(() => {
    playWrongSound();
    clearActiveWordInput();
  }, [clearActiveWordInput, playWrongSound]);

  const exitImmersive = useCallback(
    (source = "button") => {
      const handler = typeof onExitImmersive === "function" ? onExitImmersive : onBack;
      if (typeof handler !== "function") return;
      console.debug("[DEBUG] immersive.exit.request", { lessonId: lesson?.id ?? null, source });
      handler(source);
    },
    [lesson?.id, onBack, onExitImmersive],
  );

  const jumpToSentence = useCallback(
    async (targetIndex, source = "manual") => {
      if (!lesson || sentenceCount <= 0) return;
      const safeTarget = Math.max(0, Math.min(sentenceCount - 1, Number(targetIndex) || 0));
      if (safeTarget === currentSentenceIndex) return;

      stopPlayback();
      setPhase("auto_play_pending");
      setCurrentSentenceIndex(safeTarget);
      resetWordTyping(lesson?.sentences?.[safeTarget]);
      await syncProgress(safeTarget, completedIndexes, lesson?.sentences?.[safeTarget]?.begin_ms || 0);
      onProgressSynced?.();
      console.debug("[DEBUG] immersive.sentence.jump", {
        lessonId: lesson.id,
        fromSentenceIndex: currentSentenceIndex,
        toSentenceIndex: safeTarget,
        source,
      });
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
      if (phase !== "typing") return;
      const expected = expectedTokens[activeWordIndex] || "";
      if (!expected) return;
      console.debug("[DEBUG] immersive.word.reveal", {
        lessonId: lesson?.id ?? null,
        sentenceIndex: currentSentenceIndex,
        wordIndex: activeWordIndex,
        source,
      });
      commitCorrectWord(expected);
    },
    [activeWordIndex, commitCorrectWord, currentSentenceIndex, expectedTokens, lesson?.id, phase],
  );

  useEffect(() => {
    if (!immersiveActive) return undefined;
    if (typeof window === "undefined") return undefined;

    const onWindowKeyDown = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const fromTypingInput = event.target === typingInputRef.current;
      if (isEditableShortcutTarget(event.target) && !fromTypingInput) return;

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        exitImmersive("shortcut_esc");
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
  }, [exitImmersive, goToNextSentence, immersiveActive, revealCurrentWord]);

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

      if (phase !== "typing") return;

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
      phase,
      playKeySound,
      revealCurrentWord,
    ],
  );

  if (!lesson || !currentSentence) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">娌夋蹈瀛︿範</CardTitle>
          <CardDescription>褰撳墠璇剧▼鏆傛棤鍙涔犲彞瀛愩€?/CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const phaseLabelMap = {
    idle: "鍑嗗涓?,
    auto_play_pending: "鍗冲皢鎾斁",
    playing: "鎾斁涓?,
    typing: "杈撳叆涓?,
    transition: "鍒囨崲涓嬩竴鍙?,
    lesson_completed: "宸插畬鎴?,
  };

  const showMediaLoadingOverlay = mediaLoading && !needsBinding && !mediaReady;
  const canGoPrevious = currentSentenceIndex > 0;
  const canGoNext = currentSentenceIndex < Math.max(0, sentenceCount - 1);
  const canRevealWord = phase === "typing" && activeWordIndex < expectedTokens.length && expectedTokens.length > 0;

  return (
    <Card className={`immersive-page ${immersiveActive ? "immersive-page--immersive" : ""}`} onClick={focusTypingInput}>
      <CardHeader>
        <div className="immersive-header">
          <div className="immersive-header-left">
            {immersiveActive && (typeof onExitImmersive === "function" || typeof onBack === "function") ? (
              <Button variant="outline" size="sm" onClick={() => exitImmersive("button")}>
                <ArrowLeft className="size-4" />
                退出沉浸
              </Button>
            ) : null}
            <div>
              <CardTitle className="text-base">娌夋蹈寮忓彞瀛愭嫾鍐欏涔?/CardTitle>
              <CardDescription>
                绗?{Math.min(currentSentenceIndex + 1, sentenceCount)} / {sentenceCount} 鍙?
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{phaseLabelMap[phase] || "瀛︿範涓?}</Badge>
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
                <p>闊抽绱犳潗妯″紡</p>
                <p className="immersive-hint">灏嗘寜鍙ヨ嚜鍔ㄦ挱鏀惧苟鍦ㄤ笅鏂规嫾鍐?/p>
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
                <p>闊抽闄嶇骇妯″紡</p>
                <p className="immersive-hint">濯掍綋涓嶅彲鐢紝宸叉敼涓洪€愬彞闊抽鎾斁</p>
              </div>
              <audio ref={clipAudioRef} controls />
            </div>
          ) : null}

          {showMediaLoadingOverlay ? (
            <div className="immersive-overlay">
              <Button variant="secondary" disabled>
                <Loader2 className="size-4 animate-spin" />
                濯掍綋鍔犺浇涓?
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
            缁戝畾鏈湴鏂囦欢
          </Button>
          <Button variant="outline" onClick={() => tryPlayCurrentSentence({ manual: true })} disabled={mediaLoading || phase === "transition" || needsBinding}>
            <RotateCcw className="size-4" />
            閲嶆挱鏈彞
          </Button>
          <TooltipProvider delayDuration={120}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" onClick={() => revealCurrentWord("button_reveal")} disabled={!canRevealWord}>
                  <Eye className="size-4" />
                  揭示单词
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
            宸插畬鎴?{completedIndexes.length} / {sentenceCount}
          </Badge>
          {isPlaying ? <Badge variant="secondary">姝ｅ湪鎾斁鏈彞</Badge> : null}
          {bindingHint ? (
            <Badge variant="secondary">
              <CheckCircle2 className="size-4" />
              {bindingHint}
            </Badge>
          ) : null}

          {needsBinding ? (
            <div className="w-full px-6">
              <div className="immersive-media-audio-placeholder">
                <p>寰呯粦瀹氭湰鍦板獟浣?/p>
                <p className="immersive-hint">璇剧▼鍙锛屼絾鎾斁鍙楅檺銆傝鐐瑰嚮鈥滅粦瀹氭湰鍦版枃浠垛€濄€?/p>
              </div>
            </div>
          ) : null}
          {mediaError ? <p className="text-xs text-destructive">{mediaError}</p> : null}
          {bindingError ? <p className="text-xs text-destructive">{bindingError}</p> : null}
        </div>

        <div className="immersive-typing">
          <div className="immersive-typing-toolbar">
            <p className="immersive-hint">杈撳叆杈惧埌鍗曡瘝闀垮害鍚庤嚜鍔ㄥ垽瀹氾紱瓒呰繃 2 涓敊璇細娓呯┖閲嶆墦銆?/p>
            <div className="immersive-display-toggle">
              <span className="text-xs text-muted-foreground">涓嬪垝绾挎ā寮?/span>
              <Switch
                checked={displayMode === "underline"}
                onCheckedChange={(checked) => setDisplayMode(checked ? "underline" : "chip")}
                aria-label="鍒囨崲鍗曡瘝鏄剧ず妯″紡"
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
            褰撳墠鍙ヤ腑鏂囷細{currentSentence.text_zh || "(缈昏瘧澶辫触锛屾殏缂?"}
          </p>
          {phase === "lesson_completed" ? <p className="text-sm text-primary">璇剧▼宸插畬鎴愶紝鎭枩浣狅紒</p> : null}
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
            if (phase === "typing") {
              setTimeout(() => {
                focusTypingInput();
              }, 0);
            }
          }}
          autoComplete="off"
          spellCheck={false}
          readOnly={phase !== "typing"}
        />
      </CardContent>
    </Card>
  );
}







