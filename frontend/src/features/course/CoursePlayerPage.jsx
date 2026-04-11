/**
 * CoursePlayerPage — Main course playback page.
 *
 * Layout: Scene sidebar | Main content area
 * Supports 4 scene types: dictation, quiz, interactive, discussion
 * Tracks per-scene completion and surfaces a completion screen at the end.
 */
import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAppStore } from "../../store/index";
import { SceneSidebar } from "./components/SceneSidebar";
import { CourseHeader } from "./components/CourseHeader";
import { CourseCompletionScreen } from "./components/CourseCompletionScreen";
import { DictationRenderer } from "./scenes/DictationRenderer";
import { QuizRenderer } from "./scenes/QuizRenderer";
import { InteractiveRenderer } from "./scenes/InteractiveRenderer";
import { DiscussionRenderer } from "./scenes/DiscussionRenderer";
import { useCourseProgress } from "./hooks/useCourseProgress";
import { Card, Button } from "../../shared/ui";
import { Loader2, CheckCircle2, ArrowRight } from "lucide-react";

export function CoursePlayerPage() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { currentCourse, fetchCourse, courseLoading } = useAppStore((s) => s);
  const [activeSceneIdx, setActiveSceneIdx] = useState(0);
  const [isReviewMode, setIsReviewMode] = useState(false);

  useEffect(() => {
    if (courseId) {
      fetchCourse(Number(courseId));
    }
  }, [courseId]);

  const totalScenes = currentCourse?.scenes?.length || 0;

  const {
    completedScenes,
    quizScores,
    isCourseCompleted,
    markSceneComplete,
    finishCourse,
    resetProgress,
  } = useCourseProgress(Number(courseId), totalScenes);

  const activeScene = currentCourse?.scenes?.[activeSceneIdx];

  const handleSceneChange = useCallback((idx) => {
    setActiveSceneIdx(idx);
  }, []);

  const handleSceneComplete = useCallback(
    (meta = {}) => {
      markSceneComplete(activeSceneIdx, meta);
    },
    [activeSceneIdx, markSceneComplete],
  );

  const handleContinue = useCallback(() => {
    if (activeSceneIdx >= totalScenes - 1) {
      finishCourse();
    } else {
      setActiveSceneIdx((prev) => prev + 1);
    }
  }, [activeSceneIdx, totalScenes, finishCourse]);

  if (courseLoading && !currentCourse) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Loading course...</span>
      </div>
    );
  }

  if (!currentCourse) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="p-8 text-center">
          <h2 className="text-lg font-semibold mb-2">Course not found</h2>
          <Button onClick={() => navigate("/")} variant="outline">Back to Home</Button>
        </Card>
      </div>
    );
  }

  // Completion screen (shown after finishCourse(), hidden in review mode)
  if (isCourseCompleted && !isReviewMode) {
    return (
      <div className="flex flex-col h-screen bg-background">
        <CourseHeader
          course={currentCourse}
          activeSceneIdx={activeSceneIdx}
          totalScenes={totalScenes}
          completedScenes={completedScenes}
          onSceneChange={handleSceneChange}
        />
        <CourseCompletionScreen
          course={currentCourse}
          completedScenes={completedScenes}
          quizScores={quizScores}
          totalScenes={totalScenes}
          onReview={() => setIsReviewMode(true)}
          onRestart={() => {
            resetProgress();
            setIsReviewMode(false);
            setActiveSceneIdx(0);
          }}
        />
      </div>
    );
  }

  const isCurrentSceneCompleted = completedScenes.has(activeSceneIdx);
  const isLastScene = activeSceneIdx >= totalScenes - 1;

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <CourseHeader
        course={currentCourse}
        activeSceneIdx={activeSceneIdx}
        totalScenes={totalScenes}
        completedScenes={completedScenes}
        onSceneChange={handleSceneChange}
      />

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Scene sidebar */}
        <SceneSidebar
          scenes={currentCourse.scenes || []}
          activeIdx={activeSceneIdx}
          onSelect={handleSceneChange}
          completedScenes={completedScenes}
        />

        {/* Scene content + continue bar */}
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-auto">
            {activeScene ? (
              <SceneRenderer
                scene={activeScene}
                courseId={Number(courseId)}
                onComplete={handleSceneComplete}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Select a scene to begin
              </div>
            )}
          </div>

          {/* Continue bar — visible once current scene is marked complete */}
          {isCurrentSceneCompleted && (
            <div className="border-t bg-background/95 backdrop-blur p-3 flex items-center justify-between shrink-0">
              <span className="text-sm text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                场景已完成
              </span>
              <Button onClick={handleContinue} className="gap-2">
                {isLastScene ? "完成课程" : "继续"}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SceneRenderer({ scene, courseId, onComplete }) {
  switch (scene.scene_type) {
    case "dictation":
      return <DictationRenderer scene={scene} courseId={courseId} onComplete={onComplete} />;
    case "quiz":
      return <QuizRenderer scene={scene} onComplete={onComplete} />;
    case "interactive":
      return <InteractiveRenderer scene={scene} onComplete={onComplete} />;
    case "discussion":
      return <DiscussionRenderer scene={scene} courseId={courseId} onComplete={onComplete} />;
    default:
      return (
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">Unknown scene type: {scene.scene_type}</p>
        </div>
      );
  }
}
