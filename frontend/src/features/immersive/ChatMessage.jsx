import { useState } from "react";
import { Volume2, Loader2 } from "lucide-react";
import { parseResponse } from "../../shared/api/client";
import SOEResultCard from "./SOEResultCard";

function resolvePublicAssetUrl(path) {
  const base =
    typeof import.meta !== "undefined" && import.meta.env?.BASE_URL
      ? String(import.meta.env.BASE_URL)
      : "/";
  return `${base.replace(/\/?$/, "/")}${String(path || "").replace(/^\/+/, "")}`;
}

function resolveAvatarSrc(message) {
  const avatarKey = String(message?.avatarKey || "").trim().toLowerCase();
  if (avatarKey === "user" || message?.role === "user") {
    return resolvePublicAssetUrl("/avatars/user.png");
  }
  return resolvePublicAssetUrl("/avatars/teacher.png");
}

function formatScore(value) {
  const safe = Number(value || 0);
  return Number.isFinite(safe) ? Math.round(safe) : 0;
}

function VoiceScoreSummary({ soeData, onOpenDetail }) {
  if (!soeData?.ok) return null;
  return (
    <button type="button" className="chat-soe-badge chat-soe-badge--button" onClick={onOpenDetail}>
      口语评分 <strong>{formatScore(soeData.total_score)}</strong>
      <span className="chat-soe-badge__sep">·</span>
      发音 <strong>{formatScore(soeData.pronunciation_score)}</strong>
      <span className="chat-soe-badge__sep">·</span>
      流畅 <strong>{formatScore(soeData.fluency_score)}</strong>
      <span className="chat-soe-badge__sep">·</span>
      查看详情
    </button>
  );
}

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
      const data = await parseResponse(resp);
      if (!resp.ok || !data?.audio_url) {
        setPlaying(false);
        return;
      }
      const audio = new Audio(data.audio_url);
      audio.onended = () => { setPlaying(false); };
      audio.onerror = () => { setPlaying(false); };
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
  const [showSoeDetail, setShowSoeDetail] = useState(false);
  const avatarSrc = resolveAvatarSrc(message);

  if (isUser) {
    return (
      <>
        <div className="chat-msg chat-msg--user">
          <div className="chat-msg__avatar">
            <img src={avatarSrc} alt="You" className="chat-msg__avatar-img" onError={(e) => { e.currentTarget.style.display = "none"; }} />
          </div>
          <div className="chat-msg__user-body">
            <div className="chat-msg__bubble chat-msg__bubble--user">
              <p className="chat-msg__text">{message.content}</p>
            </div>
            {message.soeData ? (
              <VoiceScoreSummary soeData={message.soeData} onOpenDetail={() => setShowSoeDetail(true)} />
            ) : null}
          </div>
        </div>
        {showSoeDetail && message.soeData ? (
          <SOEResultCard result={message.soeData} onClose={() => setShowSoeDetail(false)} />
        ) : null}
      </>
    );
  }

  return (
    <div className="chat-msg chat-msg--ai">
      <div className="chat-msg__avatar">
        <img src={avatarSrc} alt="AI" className="chat-msg__avatar-img" onError={(e) => { e.currentTarget.style.display = "none"; }} />
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
        <img src={resolvePublicAssetUrl("/avatars/teacher.png")} alt="AI" className="chat-msg__avatar-img" onError={(e) => { e.currentTarget.style.display = "none"; }} />
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
