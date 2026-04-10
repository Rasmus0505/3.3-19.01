import { useCallback, useState } from "react";

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
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleToggleDrawer = useCallback(() => {
    setDrawerOpen((current) => !current);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setDrawerOpen(false);
  }, []);

  const handleStartPractice = useCallback(() => {
    setDrawerOpen(false);
    explanationProps.onStartPractice?.();
  }, [explanationProps]);

  return (
    <ImmersiveLayout
      sideOpen={drawerOpen}
      onSideDismiss={handleCloseDrawer}
      mainContent={
        <VideoPanel
          {...videoPanelProps}
          currentSentence={restTypingPanelProps.currentSentence}
          previousSentence={restTypingPanelProps.previousSentence}
          nextSentence={restTypingPanelProps.nextSentence}
          sentenceTypingDone={restTypingPanelProps.sentenceTypingDone}
          explanationAvailable={Boolean(explanationProps.explanation)}
          explanationOpen={drawerOpen}
          onToggleExplanation={handleToggleDrawer}
        />
      }
      bottomContent={<TypingPanel ref={typingPanelRef} {...restTypingPanelProps} />}
      sideContent={
        <div className="immersive-explanation-shell">
          <ExplanationSidebarContent
            {...explanationProps}
            isOpen={drawerOpen}
            onClose={handleCloseDrawer}
            onStartPractice={handleStartPractice}
          />
        </div>
      }
    />
  );
}
