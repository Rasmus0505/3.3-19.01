import { useState } from "react";
import { Volume2, Loader2, User, Bot } from "lucide-react";
import { parseResponse } from "../../shared/api/client";

function SoeScoreBadge({ soeData }) {
  if (!soeData) return null;
  const { pronunciation_score, fluency_score } = soeData;
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground bg-muted/60 rounded-full px-2 py-0.5 mt-1">
      <span>发音 <strong className="text-foreground">{Math.round(pronunciation_score)}</strong></span>
      <span className="text-muted-foreground/40">|</span>
      <span>流畅 <strong className="text-foreground">{Math.round(fluency_score)}</strong></span>
    </span>
  );
}

function TtsButton({ text, accessToken, apiClient }) {
  const [playing, setPlaying] = useState(false);

  const handlePlay = async () => {
    if (playing) return;
    setPlaying(true);
    try {
      const resp = await apiClient(
        "/api/tts/synthesize",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice: "en-US-AriaNeural" }),
        },
        accessToken,
      );
      if (!resp.ok) {
        setPlaying(false);
        return;
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => {
        setPlaying(false);
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        setPlaying(false);
        URL.revokeObjectURL(url);
      };
      audio.play().catch(() => setPlaying(false));
    } catch {
      setPlaying(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handlePlay}
      disabled={playing}
      className="inline-flex items-center justify-center w-6 h-6 rounded-full hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
      title="播放语音"
    >
      {playing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Volume2 className="w-3 h-3" />}
    </button>
  );
}

export function ChatMessage({ message, accessToken, apiClient }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-2 max-w-[90%] ${isUser ? "self-end flex-row-reverse" : "self-start"}`}>
      {/* Avatar */}
      <div
        className={[
          "w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs",
          isUser
            ? "bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-300"
            : "bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300",
        ].join(" ")}
      >
        {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
      </div>

      {/* Bubble */}
      <div className="flex flex-col gap-0.5">
        <div
          className={[
            "px-3 py-2 rounded-2xl text-sm leading-relaxed border",
            isUser
              ? "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200/60 dark:border-emerald-800/60 rounded-br-sm"
              : "bg-blue-50 dark:bg-blue-950/60 border-blue-200/60 dark:border-blue-800/60 rounded-bl-sm",
          ].join(" ")}
        >
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>

        <div className={`flex items-center gap-1 ${isUser ? "justify-end" : "justify-start"}`}>
          {isUser && message.soeData && <SoeScoreBadge soeData={message.soeData} />}
          {!isUser && accessToken && apiClient && (
            <TtsButton text={message.content} accessToken={accessToken} apiClient={apiClient} />
          )}
        </div>
      </div>
    </div>
  );
}

export function ChatTypingIndicator() {
  return (
    <div className="flex gap-2 self-start max-w-[90%]">
      <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300">
        <Bot className="w-3.5 h-3.5" />
      </div>
      <div className="px-3 py-2 rounded-2xl rounded-bl-sm bg-blue-50 dark:bg-blue-950/60 border border-blue-200/60 dark:border-blue-800/60">
        <div className="flex gap-1 items-center h-5">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    </div>
  );
}
