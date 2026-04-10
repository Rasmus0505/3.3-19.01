import ExplanationSidebarContent from "../ExplanationSidebarContent";
import ImmersiveLayout from "../ImmersiveLayout";
import TypingPanel from "../TypingPanel";
import VideoPanel from "../VideoPanel";

export default function ImmersiveLessonShell({
  videoPanelProps,
  typingPanelProps,
  explanationProps,
}) {
  const { ref: typingPanelRef, ...restTypingPanelProps } = typingPanelProps;

  return (
    <ImmersiveLayout
      leftTopContent={<VideoPanel {...videoPanelProps} />}
      leftBottomContent={<div className="immersive-reserved-panel" aria-hidden="true" />}
      rightTopContent={<TypingPanel ref={typingPanelRef} {...restTypingPanelProps} />}
      rightBottomContent={
        <div className="immersive-explanation-shell">
          <ExplanationSidebarContent {...explanationProps} />
        </div>
      }
    />
  );
}
