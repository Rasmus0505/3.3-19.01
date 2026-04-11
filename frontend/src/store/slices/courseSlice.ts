/**
 * Course state management (Zustand slice)
 */
import { api, parseResponse } from "../../shared/api/client";

type Setter = (partial: Record<string, unknown> | ((state: any) => Record<string, unknown>)) => void;
type Getter = () => any;

export interface CourseScene {
  id: number;
  idx: number;
  scene_type: string;
  title: string;
  status: string;
  content: Record<string, any> | null;
  models_used: string[];
}

export interface CourseData {
  id: number;
  title: string;
  source_type: string;
  cefr_level_original: string;
  cefr_level_target: string;
  status: string;
  scene_count: number;
  models_used: string[];
  scenes: CourseScene[];
  created_at: string;
  updated_at: string;
}

export function createCourseSlice(set: Setter, _get: Getter) {
  return {
    // State
    courses: [] as CourseData[],
    currentCourse: null as CourseData | null,
    courseLoading: false,
    courseError: "",

    // Actions
    fetchCourses: async () => {
      try {
        set({ courseLoading: true, courseError: "" });
        const res = await api("/api/courses");
        const data = await parseResponse(res);
        set({ courses: data, courseLoading: false });
      } catch (err: any) {
        set({ courseError: err?.message || "Failed to fetch courses", courseLoading: false });
      }
    },

    fetchCourse: async (courseId: number) => {
      try {
        set({ courseLoading: true, courseError: "" });
        const res = await api(`/api/courses/${courseId}`);
        const data = await parseResponse(res);
        set({ currentCourse: data, courseLoading: false });
      } catch (err: any) {
        set({ courseError: err?.message || "Failed to fetch course", courseLoading: false });
      }
    },

    createCourse: async (payload: {
      title: string;
      source_type: string;
      material_text: string;
      cefr_level_original: string;
      cefr_level_target: string;
    }) => {
      const res = await api("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return parseResponse(res);
    },

    generateCourse: async (courseId: number) => {
      const res = await api(`/api/courses/${courseId}/generate`, {
        method: "POST",
      });
      return parseResponse(res);
    },

    deleteCourse: async (courseId: number) => {
      await api(`/api/courses/${courseId}`, { method: "DELETE" });
      set((state: any) => ({
        courses: (state.courses || []).filter((c: CourseData) => c.id !== courseId),
        currentCourse: state.currentCourse?.id === courseId ? null : state.currentCourse,
      }));
    },

    clearCurrentCourse: () => {
      set({ currentCourse: null, courseError: "" });
    },
  };
}
