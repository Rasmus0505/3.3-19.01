/**
 * DiscussionPlayer — Displays all discussion messages as text + user response area.
 *
 * No TTS/audio — pure reading experience with optional written response.
 */
import { useState, useRef, useEffect } from "react";
import { Button } from "../../../shared/ui";
import { Send, ArrowRight } from "lucide-react";
import { DiscussionBubble } from "./DiscussionBubble";

export function DiscussionPlayer({ messages, onComplete }) {
  const [userResponse, setUserResponse] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const scrollRef = useRef(null);

  // Scroll to bottom on mount
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, []);

  const handleSubmit = () => {
    if (userResponse.trim()) {
      setSubmitted(true);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages area — all shown at once */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 flex flex-col">
        {messages.map((msg, idx) => (
          <DiscussionBubble
            key={idx}
            role={msg.role}
            content={msg.content}
          />
        ))}
      </div>

      {/* Response area + controls */}
      <div className="border-t p-3 shrink-0 bg-background/95 backdrop-blur space-y-3">
        {!submitted ? (
          <>
            <p className="text-xs text-muted-foreground">
              Read the discussion above, then write a brief response or summary (optional):
            </p>
            <div className="flex gap-2">
              <textarea
                className="flex-1 min-h-[60px] max-h-[120px] rounded-lg border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Write 1-2 sentences about what you learned..."
                value={userResponse}
                onChange={(e) => setUserResponse(e.target.value)}
                rows={2}
              />
              <Button
                size="sm"
                className="gap-1.5 self-end"
                onClick={handleSubmit}
                disabled={!userResponse.trim()}
              >
                <Send className="w-3.5 h-3.5" />
              </Button>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
            <span>Response submitted!</span>
          </div>
        )}

        <div className="flex justify-end">
          <Button size="sm" className="gap-1.5" onClick={onComplete}>
            Continue <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
