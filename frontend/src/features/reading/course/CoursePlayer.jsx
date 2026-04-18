/**
 * CoursePlayer — Main reading course player.
 *
 * Orchestrates 4 scenes + summary screen in a linear flow.
 */
import { CourseProgressBar } from "./CourseProgressBar";
import { SceneReading } from "./SceneReading";
import { SceneDiscussion } from "./SceneDiscussion";
import { SceneVocabPractice } from "./SceneVocabPractice";
import { SceneQuiz } from "./SceneQuiz";
import { SceneWriting } from "./SceneWriting";
import { CourseSummary } from "./CourseSummary";
import { useCourseState } from "./useCourseState";
import { Button } from "../../../shared/ui";
import { ArrowLeft, Loader2 } from "lucide-react";
import { cn } from "../../../lib/utils";

export function CoursePlayer({ pack, articleId, apiCall, accessToken, onExit }) {
  const {
    courseData,
    activeScene,
    isLoading,
    completeScene,
    goToScene,
    setDiscussion,
    setWriting,
    setSettings,
    resetCourse,
  } = useCourseState(articleId);

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
          <CourseProgressBar
            activeScene={activeScene}
            progress={courseData.progress}
            onGoToScene={goToScene}
          />
        </div>
      </div>

      {/* Scene content with transition */}
      <div className="flex-1 overflow-hidden relative">
        <div key={activeScene} className="absolute inset-0 animate-[fadeSlideIn_0.28s_ease-out_forwards]">
          {activeScene === 1 && (
            <SceneReading pack={pack} onComplete={() => completeScene(1)} />
          )}
          {activeScene === 2 && (
            <SceneDiscussion
              pack={pack}
              courseData={courseData}
              apiCall={apiCall}
              accessToken={accessToken}
              onSetDiscussion={setDiscussion}
              onSetSettings={setSettings}
              onComplete={() => completeScene(2)}
            />
          )}
          {activeScene === 3 && (
            <SceneVocabPractice
              pack={pack}
              courseData={courseData}
              onComplete={() => completeScene(3)}
            />
          )}
          {activeScene === 4 && (
            <SceneQuiz
              articleId={articleId}
              pack={pack}
              apiCall={apiCall}
              onComplete={() => completeScene(4)}
            />
          )}
          {activeScene === 5 && (
            <SceneWriting
              pack={pack}
              apiCall={apiCall}
              courseData={courseData}
              onSetWriting={setWriting}
              onComplete={() => completeScene(5)}
            />
          )}
          {activeScene === 6 && (
            <CourseSummary
              courseData={courseData}
              pack={pack}
              onGoToScene={goToScene}
              onExit={onExit}
              onReset={resetCourse}
            />
          )}
        </div>
      </div>
    </div>
  );
}


