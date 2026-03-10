export const uiInitialState = {
  globalStatus: "",
  commandOpen: false,
  commandQuery: "",
  mobileNavOpen: false,
  immersiveActive: false,
  uploadTaskState: null,
};

export function createUiSlice(set) {
  return {
    ...uiInitialState,
    resetUiState: () => set({ ...uiInitialState }),
    setGlobalStatus: (globalStatus) => set({ globalStatus: String(globalStatus || "") }),
    setCommandOpen: (commandOpen) =>
      set((state) => ({
        commandOpen: Boolean(commandOpen),
        commandQuery: commandOpen ? state.commandQuery : "",
      })),
    setCommandQuery: (commandQuery) => set({ commandQuery: String(commandQuery || "") }),
    setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen: Boolean(mobileNavOpen) }),
    setImmersiveActive: (immersiveActive) => set({ immersiveActive: Boolean(immersiveActive) }),
    setUploadTaskState: (uploadTaskState) => set({ uploadTaskState: uploadTaskState || null }),
  };
}
