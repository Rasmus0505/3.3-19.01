import { MessageSquareQuote, Sparkles } from "lucide-react";
import { Badge, Button, Card } from "../../../shared/ui";

export function ProactiveCard({ action, onJoin, onSkip, liveActive = false }) {
  if (!action) return null;

  return (
    <Card className="reading-classroom-v2__proactive-card">
      <div className="reading-classroom-v2__proactive-head">
        <div className="reading-classroom-v2__proactive-icon">
          <MessageSquareQuote className="size-5" />
        </div>
        <div>
          <Badge variant="outline">{liveActive ? "Discussion live" : "Discussion invite"}</Badge>
          <h3>{action.title || "Join the classroom discussion"}</h3>
        </div>
      </div>
      <p>{action.prompt || "The teacher is opening a discussion around this reading moment."}</p>
      {(action.suggestedQuestions || []).length > 0 ? (
        <div className="reading-classroom-v2__proactive-suggestions">
          {action.suggestedQuestions.map((item) => (
            <button key={item} type="button" className="reading-classroom-v2__suggestion" onClick={() => onJoin(item)}>
              <Sparkles className="size-3.5" />
              <span>{item}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="reading-classroom-v2__proactive-actions">
        <Button onClick={() => onJoin()}>{liveActive ? "Continue discussion" : "Join discussion"}</Button>
        {!liveActive ? <Button variant="ghost" onClick={onSkip}>Skip for now</Button> : null}
      </div>
    </Card>
  );
}
