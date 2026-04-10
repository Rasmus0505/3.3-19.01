import ComprehensionCheckPanel from "../ComprehensionCheckPanel";
import ExplanationSidebarContent from "../ExplanationSidebarContent";
import ImmersiveLayout from "../ImmersiveLayout";
import TypingPanel from "../TypingPanel";
import VideoPanel from "../VideoPanel";

export default function ImmersiveLessonShell({
  videoPanelProps,
  typingPanelProps,
  explanationProps,
  questionProps,
}) {
  const { ref: typingPanelRef, ...restTypingPanelProps } = typingPanelProps;

  return (
    <ImmersiveLayout
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
      rightTopContent={
        <div className="immersive-explanation-shell">
          <ExplanationSidebarContent
            {...explanationProps}
          />
        </div>
      }
      rightBottomContent={
        <ComprehensionCheckPanel {...questionProps} />
      }
    />
  );
}
