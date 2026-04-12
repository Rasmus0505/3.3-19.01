import { useState } from "react";
import { Volume2, Loader2 } from "lucide-react";
import { parseResponse } from "../../shared/api/client";

function SoeScoreBadge({ soeData }) {
  if (!soeData) return null;
  const { pronunciation_score, fluency_score } = soeData;
  return (
    <span className="chat-soe-badge">
      发音 <strong>{Math.round(pronunciation_score)}</strong>
      <span className="chat-soe-badge__sep">·</span>
      流畅 <strong>{Math.round(fluency_score)}</strong>
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
      if (!resp.ok) { setPlaying(false); return; }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => { setPlaying(false); URL.revokeObjectURL(url); };
      audio.onerror = () => { setPlaying(false); URL.revokeObjectURL(url); };
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
      className="chat-tts-btn"
      title="播放语音"
    >
      {playing
        ? <Loader2 className="size-3 animate-spin" />
        : <Volume2 className="size-3" />}
    </button>
  );
}

export function ChatMessage({ message, accessToken, apiClient }) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="chat-msg chat-msg--user">
        <div className="chat-msg__bubble chat-msg__bubble--user">
          <p className="chat-msg__text">{message.content}</p>
        </div>
        {message.soeData && (
          <SoeScoreBadge soeData={message.soeData} />
        )}
      </div>
    );
  }

  return (
    <div className="chat-msg chat-msg--ai">
      <div className="chat-msg__avatar">
        <img src="/avatars/teacher.png" alt="AI" className="chat-msg__avatar-img" onError={(e) => { e.currentTarget.style.display = "none"; }} />
      </div>
      <div className="chat-msg__ai-body">
        <span className="chat-msg__ai-name">AI Teacher</span>
        <p className="chat-msg__text">{message.content}</p>
        {accessToken && apiClient && (
          <div className="chat-msg__actions">
            <TtsButton text={message.content} accessToken={accessToken} apiClient={apiClient} />
          </div>
        )}
      </div>
    </div>
  );
}

export function ChatTypingIndicator() {
  return (
    <div className="chat-msg chat-msg--ai">
      <div className="chat-msg__avatar">
        <img src="/avatars/teacher.png" alt="AI" className="chat-msg__avatar-img" onError={(e) => { e.currentTarget.style.display = "none"; }} />
      </div>
      <div className="chat-msg__ai-body">
        <span className="chat-msg__ai-name">AI Teacher</span>
        <div className="chat-typing-dots">
          <span style={{ animationDelay: "0ms" }} />
          <span style={{ animationDelay: "160ms" }} />
          <span style={{ animationDelay: "320ms" }} />
        </div>
      </div>
    </div>
  );
}
