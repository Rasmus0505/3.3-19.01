/**
 * Course state management (Zustand slice)
 */
import { api, parseResponse, toErrorText } from "../../shared/api/client";

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
      const accessToken = _get().accessToken;
      if (!accessToken) {
        set({ courses: [], currentCourse: null, courseLoading: false, courseError: "" });
        return [];
      }
      try {
        set({ courseLoading: true, courseError: "" });
        const res = await api("/api/courses", {}, accessToken);
        const data = await parseResponse(res);
        if (!res.ok) {
          const message = toErrorText(data, "Failed to fetch courses");
          if (res.status === 401 || res.status === 403) {
            _get().markAuthExpired(message);
          }
          set({ courses: [], currentCourse: null, courseLoading: false, courseError: message });
          return [];
        }
        set({ courses: data, courseLoading: false });
        return data;
      } catch (err: any) {
        set({ courseError: err?.message || "Failed to fetch courses", courseLoading: false });
        return [];
      }
    },

    fetchCourse: async (courseId: number) => {
      const accessToken = _get().accessToken;
      if (!courseId || !accessToken) {
        set({ currentCourse: null, courseLoading: false, courseError: !accessToken ? "" : "Invalid course id" });
        return null;
      }
      try {
        set({ courseLoading: true, courseError: "" });
        const res = await api(`/api/courses/${courseId}`, {}, accessToken);
        const data = await parseResponse(res);
        if (!res.ok) {
          const message = toErrorText(data, "Failed to fetch course");
          if (res.status === 401 || res.status === 403) {
            _get().markAuthExpired(message);
          }
          set({ currentCourse: null, courseLoading: false, courseError: message });
          return null;
        }
        set({ currentCourse: data, courseLoading: false });
        return data;
      } catch (err: any) {
        set({ courseError: err?.message || "Failed to fetch course", courseLoading: false });
        return null;
      }
    },

    createCourse: async (payload: {
      title: string;
      source_type: string;
      material_text: string;
      cefr_level_original: string;
      cefr_level_target: string;
    }) => {
      const accessToken = _get().accessToken;
      if (!accessToken) {
        throw new Error("请先登录");
      }
      const res = await api("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }, accessToken);
      const data = await parseResponse(res);
      if (!res.ok) {
        const message = toErrorText(data, "Course creation failed");
        if (res.status === 401 || res.status === 403) {
          _get().markAuthExpired(message);
        }
        throw new Error(message);
      }
      return data;
    },

    generateCourse: async (courseId: number) => {
      const accessToken = _get().accessToken;
      if (!accessToken) {
        throw new Error("请先登录");
      }
      const res = await api(`/api/courses/${courseId}/generate`, {
        method: "POST",
      }, accessToken);
      const data = await parseResponse(res);
      if (!res.ok) {
        const message = toErrorText(data, "Course generation failed");
        if (res.status === 401 || res.status === 403) {
          _get().markAuthExpired(message);
        }
        throw new Error(message);
      }
      return data;
    },

    deleteCourse: async (courseId: number) => {
      const accessToken = _get().accessToken;
      if (!accessToken) {
        throw new Error("请先登录");
      }
      const res = await api(`/api/courses/${courseId}`, { method: "DELETE" }, accessToken);
      const data = await parseResponse(res);
      if (!res.ok) {
        const message = toErrorText(data, "Failed to delete course");
        if (res.status === 401 || res.status === 403) {
          _get().markAuthExpired(message);
        }
        throw new Error(message);
      }
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
