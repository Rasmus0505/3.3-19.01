import { motion } from "framer-motion";
import { MessageSquareQuote, Sparkles } from "lucide-react";
import { Button, Card } from "../../../shared/ui";

export function ProactiveCard({ action, onJoin, onSkip, liveActive = false }) {
  if (!action) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94, y: -6 }}
      transition={{ duration: 0.25, ease: [0.21, 1, 0.36, 1] }}
    >
      <Card className="rc-proactive">
        <div className="rc-proactive__head">
          <div className="rc-proactive__icon">
            <MessageSquareQuote className="size-4" />
          </div>
          <div>
            <span className="rc-proactive__label">
              {liveActive ? "Discussion open" : "Join the discussion?"}
            </span>
            <p className="rc-proactive__topic">
              {action.prompt || action.title || "The teacher is opening up the floor."}
            </p>
          </div>
        </div>

        {(action.suggestedQuestions || []).length > 0 && (
          <div className="rc-proactive__suggestions">
            {action.suggestedQuestions.map((q) => (
              <button
                key={q}
                type="button"
                className="rc-proactive__pill"
                onClick={() => onJoin(q)}
              >
                <Sparkles className="size-3" />
                <span>{q}</span>
              </button>
            ))}
          </div>
        )}

        <div className="rc-proactive__actions">
          <Button size="sm" onClick={() => onJoin("")}>
            {liveActive ? "Send a message" : "Join"}
          </Button>
          {!liveActive && (
            <Button size="sm" variant="ghost" onClick={onSkip}>
              Skip
            </Button>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
