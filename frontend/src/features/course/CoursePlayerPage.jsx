/**
 * CoursePlayerPage — Main course playback page.
 *
 * Layout: Scene sidebar | Main content area | Right sidebar
 * Supports 4 scene types: dictation, quiz, interactive, discussion
 */
import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAppStore } from "../../store/index";
import { SceneSidebar } from "./components/SceneSidebar";
import { CourseHeader } from "./components/CourseHeader";
import { DictationRenderer } from "./scenes/DictationRenderer";
import { QuizRenderer } from "./scenes/QuizRenderer";
import { InteractiveRenderer } from "./scenes/InteractiveRenderer";
import { DiscussionRenderer } from "./scenes/DiscussionRenderer";
import { Card, Button } from "../../shared/ui";
import { Loader2 } from "lucide-react";

export function CoursePlayerPage() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { currentCourse, fetchCourse, courseLoading } = useAppStore((s) => s);
  const [activeSceneIdx, setActiveSceneIdx] = useState(0);

  useEffect(() => {
    if (courseId) {
      fetchCourse(Number(courseId));
    }
  }, [courseId]);

  const activeScene = currentCourse?.scenes?.[activeSceneIdx];

  const handleSceneChange = useCallback((idx) => {
    setActiveSceneIdx(idx);
  }, []);

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

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <CourseHeader
        course={currentCourse}
        activeSceneIdx={activeSceneIdx}
        totalScenes={currentCourse.scenes?.length || 0}
        onSceneChange={handleSceneChange}
      />

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Scene sidebar */}
        <SceneSidebar
          scenes={currentCourse.scenes || []}
          activeIdx={activeSceneIdx}
          onSelect={handleSceneChange}
        />

        {/* Scene content */}
        <div className="flex-1 overflow-auto">
          {activeScene ? (
            <SceneRenderer scene={activeScene} courseId={Number(courseId)} />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Select a scene to begin
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SceneRenderer({ scene, courseId }) {
  switch (scene.scene_type) {
    case "dictation":
      return <DictationRenderer scene={scene} courseId={courseId} />;
    case "quiz":
      return <QuizRenderer scene={scene} />;
    case "interactive":
      return <InteractiveRenderer scene={scene} />;
    case "discussion":
      return <DiscussionRenderer scene={scene} courseId={courseId} />;
    default:
      return (
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">Unknown scene type: {scene.scene_type}</p>
        </div>
      );
  }
}
