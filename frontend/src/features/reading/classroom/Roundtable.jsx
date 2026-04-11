import { cn } from "../../../lib/utils";
import { GraduationCap, User, Bot } from "lucide-react";

const ROLE_CONFIG = {
  teacher: {
    label: "Teacher",
    icon: GraduationCap,
    bubbleClass: "reading-classroom-v2__roundtable-bubble--teacher",
    avatarClass: "reading-classroom-v2__roundtable-avatar--teacher",
    rowClass: "reading-classroom-v2__roundtable-row--left",
  },
  assistant: {
    label: "Assistant",
    icon: Bot,
    bubbleClass: "reading-classroom-v2__roundtable-bubble--assistant",
    avatarClass: "reading-classroom-v2__roundtable-avatar--assistant",
    rowClass: "reading-classroom-v2__roundtable-row--left",
  },
  student: {
    label: "Student",
    icon: User,
    bubbleClass: "reading-classroom-v2__roundtable-bubble--student",
    avatarClass: "reading-classroom-v2__roundtable-avatar--student",
    rowClass: "reading-classroom-v2__roundtable-row--right",
  },
  user: {
    label: "You",
    icon: User,
    bubbleClass: "reading-classroom-v2__roundtable-bubble--user",
    avatarClass: "reading-classroom-v2__roundtable-avatar--user",
    rowClass: "reading-classroom-v2__roundtable-row--right",
  },
};

export function Roundtable({ messages = [], activeSpeechActionId = null }) {
  return (
    <div className="reading-classroom-v2__roundtable">
      {messages.length === 0 ? (
        <div className="reading-classroom-v2__roundtable-empty">
          <p>The classroom conversation will appear here as playback progresses.</p>
        </div>
      ) : (
        messages.map((message, index) => {
          const config = ROLE_CONFIG[message.role] || ROLE_CONFIG.teacher;
          const Icon = config.icon;
          const active = message.id === activeSpeechActionId;
          return (
            <div key={message.id || `${message.role}-${index}`} className={cn("reading-classroom-v2__roundtable-row", config.rowClass)}>
              <div className={cn("reading-classroom-v2__roundtable-avatar", config.avatarClass)}>
                <Icon className="size-4" />
              </div>
              <div className={cn("reading-classroom-v2__roundtable-bubble", config.bubbleClass, active && "reading-classroom-v2__roundtable-bubble--active")}>
                <span>{config.label}</span>
                <p>{message.content}</p>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
