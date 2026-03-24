type Setter = (partial: Record<string, unknown> | ((state: any) => Record<string, unknown>)) => void;

export const uiInitialState = {
  globalStatus: "",
  commandOpen: false,
  commandQuery: "",
  mobileNavOpen: false,
  immersiveActive: false,
  uploadTaskState: null,
};

export function createUiSlice(set: Setter) {
  return {
    ...uiInitialState,
    resetUiState: () => set({ ...uiInitialState }),
    setGlobalStatus: (globalStatus: unknown) => set({ globalStatus: String(globalStatus || "") }),
    setCommandOpen: (commandOpen: unknown) =>
      set((state) => ({
        commandOpen: Boolean(commandOpen),
        commandQuery: commandOpen ? state.commandQuery : "",
      })),
    setCommandQuery: (commandQuery: unknown) => set({ commandQuery: String(commandQuery || "") }),
    setMobileNavOpen: (mobileNavOpen: unknown) => set({ mobileNavOpen: Boolean(mobileNavOpen) }),
    setImmersiveActive: (immersiveActive: unknown) => set({ immersiveActive: Boolean(immersiveActive) }),
    setUploadTaskState: (uploadTaskState: unknown) => set({ uploadTaskState: uploadTaskState || null }),
  };
}
