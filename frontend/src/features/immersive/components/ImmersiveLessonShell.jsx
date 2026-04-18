import ChatPanel from "../ChatPanel";
import ExplanationSidebarContent from "../ExplanationSidebarContent";
import ImmersiveLayout from "../ImmersiveLayout";
import TypingPanel from "../TypingPanel";
import VideoPanel from "../VideoPanel";

export default function ImmersiveLessonShell({
  videoPanelProps,
  typingPanelProps,
  explanationProps,
  chatProps,
  fullscreenStudyMode = false,
}) {
  const { ref: typingPanelRef, ...restTypingPanelProps } = typingPanelProps;

  return (
    <ImmersiveLayout
      fullscreenStudyMode={fullscreenStudyMode}
      leftTopContent={
        <VideoPanel
          {...videoPanelProps}
          currentSentence={restTypingPanelProps.currentSentence}
          previousSentence={restTypingPanelProps.previousSentence}
          nextSentence={restTypingPanelProps.nextSentence}
          sentenceTypingDone={restTypingPanelProps.sentenceTypingDone}
        />
      }
      leftBottomContent={<TypingPanel ref={typingPanelRef} {...restTypingPanelProps} />}
      rightTopContent={fullscreenStudyMode ? null : (
        <div className="immersive-explanation-shell">
          <ExplanationSidebarContent
            {...explanationProps}
          />
        </div>
      )}
      rightBottomContent={fullscreenStudyMode ? null : (
        <div className="immersive-chat-shell">
          <ChatPanel {...chatProps} />
        </div>
      )}
    />
  );
}
