import { useParams } from "react-router-dom";
import { ImmersiveLessonPage } from "../features/immersive/ImmersiveLessonPage";

export default function ImmersivePage() {
  const { lessonId } = useParams();

  // For now, ImmersiveLessonPage still needs the full props
  // Future: this page will fetch lesson data and pass to ImmersiveLessonPage
  return <ImmersiveLessonPage lessonId={lessonId} />;
}
