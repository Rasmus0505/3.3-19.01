import ChatPanel from "../ChatPanel";
import ExplanationSidebarContent from "../ExplanationSidebarContent";
import ImmersiveLayout from "../ImmersiveLayout";
import SessionControls from "../SessionControls";
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
  const sessionControlsElement = (
    <SessionControls
      currentSentenceIndex={videoPanelProps.currentSentenceIndex}
      sentenceCount={videoPanelProps.sentenceCount}
      requestNavigateSentence={videoPanelProps.requestNavigateSentence}
      requestReplayCurrentSentence={videoPanelProps.requestReplayCurrentSentence}
      requestTogglePausePlayback={videoPanelProps.requestTogglePausePlayback}
      fullscreenStudyMode={videoPanelProps.fullscreenStudyMode}
      onToggleFullscreenStudyMode={videoPanelProps.onToggleFullscreenStudyMode}
      singleSentenceLoopEnabled={videoPanelProps.singleSentenceLoopEnabled}
      handleToggleSingleSentenceLoop={videoPanelProps.handleToggleSingleSentenceLoop}
      playbackRateInputValue={videoPanelProps.playbackRateInputValue}
      handlePlaybackRateInputChange={videoPanelProps.handlePlaybackRateInputChange}
      handlePlaybackRateInputBlur={videoPanelProps.handlePlaybackRateInputBlur}
      handlePlaybackRateInputKeyDown={videoPanelProps.handlePlaybackRateInputKeyDown}
      adjustPlaybackRateByStep={videoPanelProps.adjustPlaybackRateByStep}
      handleResetPlaybackRate={videoPanelProps.handleResetPlaybackRate}
      playbackRatePinned={videoPanelProps.playbackRatePinned}
      handleTogglePlaybackRatePinned={videoPanelProps.handleTogglePlaybackRatePinned}
      isPlaying={videoPanelProps.isPlaying}
      isPlaybackPaused={videoPanelProps.isPlaybackPaused}
    />
  );
  const typingPanelElement = (
    <TypingPanel
      ref={typingPanelRef}
      {...restTypingPanelProps}
      sessionControlsContent={fullscreenStudyMode ? sessionControlsElement : null}
    />
  );

  return (
    <ImmersiveLayout
      fullscreenStudyMode={fullscreenStudyMode}
      leftTopContent={
        <VideoPanel
          {...videoPanelProps}
          showSessionControls={!fullscreenStudyMode}
          currentSentence={restTypingPanelProps.currentSentence}
          previousSentence={restTypingPanelProps.previousSentence}
          nextSentence={restTypingPanelProps.nextSentence}
          sentenceTypingDone={restTypingPanelProps.sentenceTypingDone}
        />
      }
      leftBottomContent={typingPanelElement}
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


