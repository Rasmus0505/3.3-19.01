import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Trash2, MessageCircle } from "lucide-react";
import { useLessonChat } from "./useLessonChat";
import { VoiceRecorder } from "./VoiceRecorder";
import { ChatMessage, ChatTypingIndicator } from "./ChatMessage";

export default function ChatPanel({ lessonId, currentSentence, accessToken, apiClient }) {
  const { messages, isLoading, error, sendMessage, sendVoiceMessage, clearHistory } =
    useLessonChat({ lessonId, accessToken, apiClient });

  const [inputValue, setInputValue] = useState("");
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (!text || isLoading) return;
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
      if (errorMsg) return;
      if (result) sendVoiceMessage(result);
    },
    [sendVoiceMessage],
  );

  const refText = currentSentence?.text_en || "";
  const isEmpty = messages.length === 0 && !isLoading;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 shrink-0">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <MessageCircle className="w-3.5 h-3.5" />
          <span>AI 口语练习</span>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={clearHistory}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
            title="清空对话"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center text-muted-foreground">
            <MessageCircle className="w-8 h-8 opacity-30" />
            <p className="text-xs">
              和 AI 讨论听力内容
              <br />
              打字或录音开始对话
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                message={msg}
                accessToken={accessToken}
                apiClient={apiClient}
              />
            ))}
            {isLoading && <ChatTypingIndicator />}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="px-3 py-1 text-[11px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 shrink-0">
          {error}
        </div>
      )}

      {/* Input bar */}
      <div className="flex items-end gap-1.5 px-2 py-2 border-t border-border/40 shrink-0">
        <VoiceRecorder
          refText={refText}
          lessonId={lessonId}
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
          placeholder="输入消息..."
          disabled={isLoading}
          className="flex-1 min-w-0 rounded-lg border border-border/60 bg-background px-3 py-1.5 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!inputValue.trim() || isLoading}
          className="inline-flex items-center justify-center rounded-full w-9 h-9 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          title="发送"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
