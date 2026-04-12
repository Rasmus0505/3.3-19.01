import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Trash2 } from "lucide-react";
import { useLessonChat } from "./useLessonChat";
import { VoiceRecorder } from "./VoiceRecorder";
import { ChatMessage, ChatTypingIndicator } from "./ChatMessage";

export default function ChatPanel({ lessonId, currentSentence, accessToken, apiClient }) {
  const { messages, isLoading, error, sendMessage, sendVoiceMessage, clearHistory } =
    useLessonChat({ lessonId, accessToken, apiClient });

  const [inputValue, setInputValue] = useState("");
  const [voiceError, setVoiceError] = useState("");
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isLoading]);

  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (!text || isLoading) return;
    setVoiceError("");
    setInputValue("");
    sendMessage(text);
  }, [inputValue, isLoading, sendMessage]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleVoiceResult = useCallback(
    (result, errorMsg) => {
      if (errorMsg) {
        setVoiceError(String(errorMsg || "语音评测失败"));
        return;
      }
      setVoiceError("");
      if (result) {
        void sendVoiceMessage(result);
      }
    },
    [sendVoiceMessage],
  );

  const isEmpty = messages.length === 0 && !isLoading;

  return (
    <div className="chat-panel">
      {/* Header */}
      <div className="chat-panel__header">
        <span className="chat-panel__title">AI 口语练习</span>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={clearHistory}
            className="chat-panel__clear-btn"
            title="清空对话"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="chat-panel__messages">
        {isEmpty ? (
          <div className="chat-empty">
            <p className="chat-empty__hint">和 AI 讨论这句话的听力内容</p>
            <p className="chat-empty__sub">打字或按住录音按钮开始</p>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                message={msg}
                accessToken={accessToken}
                apiClient={apiClient}
              />
            ))}
            {isLoading && <ChatTypingIndicator />}
          </>
        )}
      </div>

      {/* Error */}
      {error ? (
        <div className="chat-panel__error">{error}</div>
      ) : null}
      {voiceError ? <div className="chat-panel__error">{voiceError}</div> : null}

      {/* Input bar */}
      <div className="chat-panel__input-bar">
        <VoiceRecorder
          refText={currentSentence?.text_en || ""}
          lessonId={lessonId}
          sentenceIdx={currentSentence?.idx}
          accessToken={accessToken}
          apiClient={apiClient}
          onResult={handleVoiceResult}
          disabled={isLoading}
        />
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入消息…"
          disabled={isLoading}
          className="chat-panel__input"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!inputValue.trim() || isLoading}
          className="chat-panel__send-btn"
          title="发送"
        >
          <Send className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
