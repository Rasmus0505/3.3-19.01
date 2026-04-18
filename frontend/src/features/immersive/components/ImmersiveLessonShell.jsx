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
  const typingPanelElement = <TypingPanel ref={typingPanelRef} {...restTypingPanelProps} />;

  return (
    <ImmersiveLayout
      fullscreenStudyMode={fullscreenStudyMode}
      leftTopContent={
        <VideoPanel
          {...videoPanelProps}
          typingOverlayContent={fullscreenStudyMode ? typingPanelElement : null}
          currentSentence={restTypingPanelProps.currentSentence}
          previousSentence={restTypingPanelProps.previousSentence}
          nextSentence={restTypingPanelProps.nextSentence}
          sentenceTypingDone={restTypingPanelProps.sentenceTypingDone}
        />
      }
      leftBottomContent={fullscreenStudyMode ? null : typingPanelElement}
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


