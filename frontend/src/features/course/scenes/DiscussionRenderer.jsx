/**
 * DiscussionRenderer — Multi-agent discussion (Teacher + Student + User).
 *
 * SSE streaming for real-time agent responses.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import { Input } from "../../../components/ui/input";
import { cn } from "../../../lib/utils";
import { MessageSquare, Send, SkipForward, Volume2 } from "lucide-react";
import { VoiceWaveform } from "../components/VoiceWaveform";
import { api } from "../../../shared/api/client";

const AGENT_CONFIG = {
  teacher: {
    label: "Teacher",
    color: "text-blue-700 dark:text-blue-300",
    bgColor: "bg-blue-50 dark:bg-blue-950",
    borderColor: "border-blue-300 dark:border-blue-700",
  },
  student: {
    label: "Student",
    color: "text-emerald-700 dark:text-emerald-300",
    bgColor: "bg-emerald-50 dark:bg-emerald-950",
    borderColor: "border-emerald-300 dark:border-emerald-700",
  },
  user: {
    label: "You",
    color: "text-primary",
    bgColor: "bg-primary/10",
    borderColor: "border-primary/30",
  },
};

export function DiscussionRenderer({ scene, courseId }) {
  const content = scene.content || {};
  const [discussionId, setDiscussionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentTurn, setCurrentTurn] = useState("teacher");
  const [isStarted, setIsStarted] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const [summary, setSummary] = useState("");
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSSEMessage = useCallback((event, data) => {
    switch (event) {
      case "discussion_start":
        setDiscussionId(data.discussion_id);
        break;
      case "message":
        setMessages((prev) => [...prev, { role: data.role, content: data.content, timestamp: data.timestamp }]);
        break;
      case "turn":
        setCurrentTurn(data.current_turn);
        setIsStreaming(false);
        break;
      case "summary":
        setSummary(data.content);
        break;
      case "discussion_end":
        setIsEnded(true);
        setIsStreaming(false);
        break;
      case "error":
        setIsStreaming(false);
        break;
    }
  }, []);

  const startDiscussion = async () => {
    setIsStarted(true);
    setIsStreaming(true);

    try {
      const res = await api("/api/discussion/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course_id: courseId,
          scene_id: scene.id,
          topic: content.topic || scene.title,
          target_level: content.vocabulary_focus ? "B1" : "B1",
          key_points: content.key_points || [],
          vocabulary_focus: content.vocabulary_focus || [],
          teacher_prompt: content.teacher_prompt || "",
        }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) return;

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let currentEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ") && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              handleSSEMessage(currentEvent, data);
            } catch {}
            currentEvent = "";
          }
        }
      }
    } catch (err) {
      console.error("Discussion start failed:", err);
      setIsStreaming(false);
    }
  };

  const sendReply = async () => {
    if (!userInput.trim() || !discussionId || isStreaming) return;

    const message = userInput.trim();
    setUserInput("");
    setIsStreaming(true);

    // Add user message immediately
    setMessages((prev) => [...prev, { role: "user", content: message, timestamp: Date.now() }]);

    try {
      const res = await api("/api/discussion/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discussion_id: discussionId, message }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        let currentEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) currentEvent = line.slice(7).trim();
          else if (line.startsWith("data: ") && currentEvent) {
            try { handleSSEMessage(currentEvent, JSON.parse(line.slice(6))); } catch {}
            currentEvent = "";
          }
        }
      }
    } catch (err) {
      console.error("Reply failed:", err);
      setIsStreaming(false);
    }
  };

  const skipTurn = async () => {
    if (!discussionId || isStreaming) return;
    setIsStreaming(true);

    try {
      const res = await api("/api/discussion/skip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discussion_id: discussionId, message: "" }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        let currentEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) currentEvent = line.slice(7).trim();
          else if (line.startsWith("data: ") && currentEvent) {
            try { handleSSEMessage(currentEvent, JSON.parse(line.slice(6))); } catch {}
            currentEvent = "";
          }
        }
      }
    } catch (err) {
      console.error("Skip failed:", err);
      setIsStreaming(false);
    }
  };

  // --- Not started state ---
  if (!isStarted) {
    const coverVideo = content.cover_video_url;
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 gap-4">
        {/* AI-generated cover video if available */}
        {coverVideo ? (
          <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-lg mb-2">
            <video
              src={coverVideo}
              autoPlay
              loop
              muted
              playsInline
              className="w-full object-cover"
            />
          </div>
        ) : (
          <div className="w-16 h-16 rounded-2xl bg-purple-50 dark:bg-purple-950 flex items-center justify-center">
            <MessageSquare className="w-8 h-8 text-purple-500" />
          </div>
        )}
        <h2 className="text-xl font-semibold">AI课堂讨论</h2>
        <p className="text-muted-foreground text-center max-w-md">
          Join a discussion with an AI Teacher and AI Student.
          Learn naturally by listening and participating.
        </p>
        {content.topic && (
          <Badge variant="secondary">{content.topic}</Badge>
        )}
        {content.vocabulary_focus?.length > 0 && (
          <div className="flex flex-wrap gap-1 justify-center">
            {content.vocabulary_focus.map((word) => (
              <Badge key={word} variant="outline" className="text-xs">{word}</Badge>
            ))}
          </div>
        )}
        <Button onClick={startDiscussion} size="lg" className="gap-2 mt-2">
          <MessageSquare className="w-4 h-4" />
          Start Discussion
        </Button>
      </div>
    );
  }

  // --- Discussion active ---
  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => {
          const config = AGENT_CONFIG[msg.role] || AGENT_CONFIG.user;
          return (
            <div key={idx} className={cn("flex gap-3", msg.role === "user" && "flex-row-reverse")}>
              {/* Avatar */}
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold border-2",
                config.bgColor,
                config.borderColor,
                config.color,
              )}>
                {config.label[0]}
              </div>

              {/* Bubble */}
              <div className={cn(
                "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-tr-sm"
                  : cn(config.bgColor, "rounded-tl-sm"),
              )}>
                <p className="leading-relaxed">{msg.content}</p>
              </div>
            </div>
          );
        })}

        {/* Streaming indicator */}
        {isStreaming && (
          <div className="flex gap-3">
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2",
              AGENT_CONFIG[currentTurn]?.bgColor,
              AGENT_CONFIG[currentTurn]?.borderColor,
            )}>
              <VoiceWaveform />
            </div>
            <div className="rounded-2xl px-4 py-2.5 bg-muted">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        {/* Summary */}
        {summary && (
          <Card className="p-4 bg-purple-50 dark:bg-purple-950 border-purple-200 dark:border-purple-800">
            <h4 className="text-sm font-semibold text-purple-700 dark:text-purple-300 mb-1">Discussion Summary</h4>
            <p className="text-sm text-purple-600 dark:text-purple-400">{summary}</p>
          </Card>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      {!isEnded && (
        <div className="border-t p-3 shrink-0">
          <div className="flex gap-2">
            <Input
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendReply()}
              placeholder="Type your response in English..."
              disabled={isStreaming}
              className="flex-1"
            />
            <Button
              onClick={sendReply}
              disabled={!userInput.trim() || isStreaming}
              size="icon"
            >
              <Send className="w-4 h-4" />
            </Button>
            <Button
              onClick={skipTurn}
              disabled={isStreaming}
              variant="outline"
              size="icon"
              title="Skip your turn"
            >
              <SkipForward className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
