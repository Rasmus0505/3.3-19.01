import { create } from "zustand";

import { createAuthSlice } from "./slices/authSlice";
import { createLessonSlice } from "./slices/lessonSlice";
import { createMediaSlice } from "./slices/mediaSlice";
import { createUiSlice } from "./slices/uiSlice";

type AuthSlice = ReturnType<typeof createAuthSlice>;
type LessonSlice = ReturnType<typeof createLessonSlice>;
type MediaSlice = ReturnType<typeof createMediaSlice>;
type UiSlice = ReturnType<typeof createUiSlice>;

export type AppStore = AuthSlice & LessonSlice & MediaSlice & UiSlice;

export const useAppStore = create<AppStore>()((set, get, api) => ({
  ...createAuthSlice(set, get, api),
  ...createLessonSlice(set, get, api),
  ...createMediaSlice(set, get, api),
  ...createUiSlice(set, get, api),
}));


