import { create } from "zustand";

import { createAuthSlice } from "./slices/authSlice";
import { createLessonSlice } from "./slices/lessonSlice";
import { createMediaSlice } from "./slices/mediaSlice";
import { createUiSlice } from "./slices/uiSlice";

export const useAppStore = create((set, get, api) => ({
  ...createAuthSlice(set, get, api),
  ...createLessonSlice(set, get, api),
  ...createMediaSlice(set, get, api),
  ...createUiSlice(set, get, api),
}));
