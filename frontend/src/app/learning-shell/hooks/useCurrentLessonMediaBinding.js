import { useEffect } from "react";

export function useCurrentLessonMediaBinding({ currentLesson, detectCurrentLessonMediaBinding }) {
  useEffect(() => {
    void detectCurrentLessonMediaBinding(currentLesson);
  }, [currentLesson, detectCurrentLessonMediaBinding]);
}
