import { useCallback, useRef, useState } from "react";
import { parseResponse } from "../../shared/api/client";

export function useLessonChat({ lessonId, accessToken, apiClient }) {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef(null);

  const sendMessage = useCallback(
    async (text, soeData = null) => {
      if (!text.trim() || !lessonId) return;
      setError("");

      const userMsg = {
        id: Date.now(),
        role: "user",
        content: text.trim(),
        soeData,
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);

      try {
        const history = messages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

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
          id: Date.now() + 1,
          role: "assistant",
          content: data.reply,
        };

        setMessages((prev) => [...prev, assistantMsg]);
      } catch (err) {
        setError(String(err.message || "网络错误"));
      } finally {
        setIsLoading(false);
      }
    },
    [accessToken, apiClient, lessonId, messages],
  );

  const sendVoiceMessage = useCallback(
    async (soeResult) => {
      const userText = soeResult?.user_text || "";
      if (!userText.trim()) {
        setError("未识别到语音内容");
        return;
      }
      await sendMessage(userText, {
        total_score: soeResult.total_score,
        pronunciation_score: soeResult.pronunciation_score,
        fluency_score: soeResult.fluency_score,
      });
    },
    [sendMessage],
  );

  const clearHistory = useCallback(() => {
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
