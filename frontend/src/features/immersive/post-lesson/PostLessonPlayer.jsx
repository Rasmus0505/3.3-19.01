/**
 * PostLessonPlayer — Main post-lesson orchestrator.
 *
 * Orchestrates 3 scenes + summary in a linear flow after immersive dictation.
 */
import { PostLessonProgressBar } from "./PostLessonProgressBar";
import { SceneVocabReview } from "./SceneVocabReview";
import { SceneListeningQuiz } from "./SceneListeningQuiz";
import { SceneShadowing } from "./SceneShadowing";
import { PostLessonSummary } from "./PostLessonSummary";
import { usePostLessonState } from "./usePostLessonState";
import { Button } from "../../../shared/ui";
import { ArrowLeft, Loader2 } from "lucide-react";

export function PostLessonPlayer({ lesson, accessToken, apiClient, onExit }) {
  const {
    postLessonData,
    activeScene,
    isLoading,
    completeScene,
    goToScene,
    setVocabResults,
    setQuizResults,
    setShadowingResults,
    resetPostLesson,
  } = usePostLessonState(lesson?.id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header with back button + progress */}
      <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onExit}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 overflow-x-auto">
          <PostLessonProgressBar
            activeScene={activeScene}
            progress={postLessonData.progress}
            onGoToScene={goToScene}
          />
        </div>
      </div>

      {/* Scene content */}
      <div className="flex-1 overflow-hidden">
        {activeScene === 1 && (
          <SceneVocabReview
            lesson={lesson}
            onComplete={() => completeScene(1)}
            onSaveResults={setVocabResults}
          />
        )}
        {activeScene === 2 && (
          <SceneListeningQuiz
            lesson={lesson}
            apiClient={apiClient}
            onComplete={() => completeScene(2)}
            onSaveResults={setQuizResults}
          />
        )}
        {activeScene === 3 && (
          <SceneShadowing
            lesson={lesson}
            apiClient={apiClient}
            accessToken={accessToken}
            onComplete={() => completeScene(3)}
            onSaveResults={setShadowingResults}
          />
        )}
        {activeScene === 4 && (
          <PostLessonSummary
            postLessonData={postLessonData}
            lesson={lesson}
            onGoToScene={goToScene}
            onExit={onExit}
            onReset={resetPostLesson}
          />
        )}
      </div>
    </div>
  );
}


