import { useCallback, useRef, useState } from "react";
import { parseResponse } from "../../shared/api/client";

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
      return next;
    });
  }, []);

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
    messagesRef.current = [];
    setMessages([]);
    setError("");
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    sendVoiceMessage,
    clearHistory,
  };
}
