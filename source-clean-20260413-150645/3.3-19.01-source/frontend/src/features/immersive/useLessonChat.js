import { useCallback, useEffect, useRef, useState } from "react";
import { parseResponse } from "../../shared/api/client";

const CHAT_STORAGE_KEY_PREFIX = "immersive-lesson-chat-v1";

function buildStorageKey(lessonId) {
  return `${CHAT_STORAGE_KEY_PREFIX}:${lessonId}`;
}

function normalizeStoredMessage(message, index) {
  if (!message || typeof message !== "object") return null;

  const role = message.role === "assistant" ? "assistant" : message.role === "user" ? "user" : "";
  const content = String(message.content || "").trim();

  if (!role || !content) return null;

  return {
    id: String(message.id || `${role}-${index + 1}`),
    role,
    content,
    inputMode: message.inputMode === "voice" ? "voice" : "text",
    avatarKey: String(message.avatarKey || (role === "user" ? "user" : "teacher")),
    soeData: message.soeData && typeof message.soeData === "object" ? message.soeData : null,
  };
}

function readStoredMessages(lessonId) {
  if (!lessonId || typeof window === "undefined" || !window.localStorage) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(buildStorageKey(lessonId));
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.map(normalizeStoredMessage).filter(Boolean);
  } catch {
    return [];
  }
}

function writeStoredMessages(lessonId, messages) {
  if (!lessonId || typeof window === "undefined" || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(buildStorageKey(lessonId), JSON.stringify(messages));
  } catch {
    // Ignore storage quota or privacy-mode errors and keep chat usable.
  }
}

function clearStoredMessages(lessonId) {
  if (!lessonId || typeof window === "undefined" || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.removeItem(buildStorageKey(lessonId));
  } catch {
    // Ignore localStorage failures and clear in-memory state only.
  }
}

export function useLessonChat({ lessonId, accessToken, apiClient }) {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef(null);
  const messagesRef = useRef([]);

  const commitMessages = useCallback((updater) => {
    setMessages((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      messagesRef.current = next;
      writeStoredMessages(lessonId, next);
      return next;
    });
  }, [lessonId]);

  useEffect(() => {
    if (abortRef.current) {
      abortRef.current.abort?.();
      abortRef.current = null;
    }

    const restoredMessages = readStoredMessages(lessonId);
    messagesRef.current = restoredMessages;
    setMessages(restoredMessages);
    setError("");
    setIsLoading(false);
  }, [lessonId]);

  const sendMessage = useCallback(
    async (text, options = {}) => {
      if (!text.trim() || !lessonId) return;
      setError("");

      const userMsg = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text.trim(),
        inputMode: options.inputMode || "text",
        avatarKey: "user",
        soeData: options.soeData || null,
      };

      const history = messagesRef.current.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      commitMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);

      try {
        const resp = await apiClient(
          "/api/lesson-chat/message",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lesson_id: lessonId,
              message: text.trim(),
              conversation_history: history,
            }),
          },
          accessToken,
        );

        const data = await parseResponse(resp);

        if (!resp.ok || !data.ok) {
          const errMsg = data.detail || data.error || "AI 回复失败";
          setError(errMsg);
          return;
        }

        const assistantMsg = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: data.reply,
          avatarKey: "teacher",
        };

        commitMessages((prev) => [...prev, assistantMsg]);
      } catch (err) {
        setError(String(err.message || "网络错误"));
      } finally {
        setIsLoading(false);
      }
    },
    [accessToken, apiClient, commitMessages, lessonId],
  );

  const sendVoiceMessage = useCallback(
    async (soeResult) => {
      if (!soeResult?.ok) {
        setError(soeResult?.detail || soeResult?.message || "口语评测失败");
        return;
      }
      const userText = soeResult?.user_text || "";
      if (!userText.trim()) {
        setError("未识别到语音内容");
        return;
      }
      await sendMessage(userText, {
        inputMode: "voice",
        soeData: {
          ok: true,
          voice_id: soeResult.voice_id,
          ref_text: soeResult.ref_text,
          user_text: soeResult.user_text,
          total_score: soeResult.total_score,
          pronunciation_score: soeResult.pronunciation_score,
          fluency_score: soeResult.fluency_score,
          completeness_score: soeResult.completeness_score,
          word_results: Array.isArray(soeResult.word_results) ? soeResult.word_results : [],
          matched_word_count: soeResult.matched_word_count,
          total_word_count: soeResult.total_word_count,
          added_word_count: soeResult.added_word_count,
          missing_word_count: soeResult.missing_word_count,
          misread_word_count: soeResult.misread_word_count,
          saved_result_id: soeResult.saved_result_id,
        },
      });
    },
    [sendMessage],
  );

  const clearHistory = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort?.();
      abortRef.current = null;
    }
    messagesRef.current = [];
    clearStoredMessages(lessonId);
    setMessages([]);
    setError("");
    setIsLoading(false);
  }, [lessonId]);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    sendVoiceMessage,
    clearHistory,
  };
}
