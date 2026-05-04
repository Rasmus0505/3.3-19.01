import { toast } from "sonner";

import {
  DESKTOP_CLIENT_OFFLINE_MESSAGE,
  DESKTOP_LINK_IMPORTING_PHASE,
  DESKTOP_LINK_INVALID_MESSAGE,
  DESKTOP_LINK_PUBLIC_SUPPORT_MESSAGE,
  DESKTOP_LOCAL_TRANSCRIBING_PHASE,
  LINK_IMPORT_DESKTOP_ONLY_MESSAGE,
  RESTORE_BANNER_MODES,
  UPLOAD_PROGRESS_PERSIST_INTERVAL_MS,
} from "../uploadConstants";
import { clampPercent, getDefaultBalancedModelKey, getDefaultUploadModelKey } from "../uploadHelpers";
import { buildDesktopLinkErrorMessage, getInterruptedLocalAsrStatus, sanitizeDesktopLinkInput, sanitizeUserFacingText } from "../uploadTaskViewModel";
import { isBlobBackedSourceFile, materializeDesktopSelectedFile, restoreSavedSourceFile } from "../uploadPanelHelpers";

export function useUploadWorkflow(deps) {
  const {
    file,
    taskId,
    phase,
    mode,
    taskSnapshot,
    selectedUploadModel,
    generationOptions,
    coverDataUrl,
    coverWidth,
    coverHeight,
    coverAspectRatio,
    durationSec,
    isVideoSource,
    uploadPercent,
    status,
    bindingCompleted,
    loading,
    restoreBannerMode,
    pendingPersistedRestore,
    ownerUserId,
    configuredDefaultAsrModel,
    desktopRuntimeAvailable,
    desktopLinkModeSupported,
    networkOnline,
    desktopLinkInput,
    desktopLinkTitle,
    desktopLinkTaskId,
    onWalletChanged,
    setPendingPersistedRestore,
    setDesktopLinkInput,
    setDesktopLinkTitle,
    setDesktopLinkTaskId,
    setFile,
    setTaskId,
    setLoading,
    setStatus,
    setDurationSec,
    setPhase,
    setCoverDataUrl,
    setCoverAspectRatio,
    setCoverWidth,
    setCoverHeight,
    setIsVideoSource,
    setTaskSnapshot,
    setUploadPercent,
    setLocalProgressSnapshot,
    setBindingCompleted,
    setLocalBusyModelKey,
    setLocalBusyText,
    setServerBusyModelKey,
    setServerBusyText,
    setMode,
    setSelectedUploadModel,
    setSelectedBalancedModel,
    setGenerationOptions,
    setRestoreBannerMode,
    clearActiveGenerationTask,
    clearUploadPanelSuccessSnapshot,
    saveUploadPanelSuccessSnapshot,
    saveActiveGenerationTask,
    resolveDesktopSelectedSourcePath,
    resetLocalSessionState,
    updateDesktopLinkProgressState,
    clearDesktopLinkTaskTracking,
    stopPollingSession,
    resetUploadPersistState,
    clearLocalStageProgressTimer,
    requestDesktopLocalHelper,
    loadDesktopImportedSourceFile,
    extractMediaCoverPreview,
    onSelectFile,
    submit,
    desktopBillingReportRef,
    uploadAbortRef,
    localRunAbortRef,
    desktopLinkPollTokenRef,
    desktopLinkTaskIdRef,
    localRunTokenRef,
    uploadPersistRef,
    successStateOriginRef,
    fallbackToastTaskRef,
    clearUploadPersistTimer,
  } = deps;

  async function persistSession(overrides = {}) {
    const nextFile = overrides.file ?? file;
    const nextTaskId = overrides.taskId ?? taskId;
    const nextPhase = overrides.phase ?? phase;
    const nextMode = overrides.mode ?? mode;
    const nextDesktopSourcePath = resolveDesktopSelectedSourcePath(nextFile);
    const restorablePhase =
      nextPhase === "local_transcribing" || nextPhase === DESKTOP_LOCAL_TRANSCRIBING_PHASE ? (nextFile ? "ready" : "idle") : nextPhase;
    const restorableStatus =
      nextPhase === "local_transcribing" || nextPhase === DESKTOP_LOCAL_TRANSCRIBING_PHASE
        ? getInterruptedLocalAsrStatus(Boolean(nextFile))
        : String(overrides.status ?? status ?? "");
    if (!ownerUserId) return;
    if (!nextFile && !nextTaskId && restorablePhase === "idle") {
      await clearActiveGenerationTask(ownerUserId);
      return;
    }
    await saveActiveGenerationTask(ownerUserId, {
      task_id: nextTaskId,
      phase: restorablePhase,
      task_snapshot: overrides.taskSnapshot ?? taskSnapshot,
      selected_upload_model: String(overrides.selectedUploadModel ?? selectedUploadModel ?? ""),
      generation_options: { ...(overrides.generationOptions ?? generationOptions ?? {}) },
      file_blob: isBlobBackedSourceFile(nextFile) ? nextFile : null,
      file_name: String(nextFile?.name || ""),
      media_type: String(nextFile?.type || ""),
      file_size_bytes: Math.max(0, Number(nextFile?.size || 0)),
      file_last_modified_ms: Math.max(0, Number(nextFile?.lastModified || 0)),
      desktop_source_path: nextDesktopSourcePath,
      cover_data_url: String(overrides.coverDataUrl ?? coverDataUrl ?? ""),
      cover_width: Number(overrides.coverWidth ?? coverWidth ?? 0),
      cover_height: Number(overrides.coverHeight ?? coverHeight ?? 0),
      aspect_ratio: Number(overrides.aspectRatio ?? coverAspectRatio ?? 0),
      duration_seconds: Number(overrides.durationSec ?? durationSec ?? 0),
      is_video_source: Boolean(overrides.isVideoSource ?? isVideoSource),
      generation_mode: nextMode === "fast" ? "fast" : "balanced",
      upload_percent: Number(overrides.uploadPercent ?? uploadPercent ?? 0),
      status_text: restorableStatus,
      binding_completed: Boolean(overrides.bindingCompleted ?? bindingCompleted),
    });
  }

  async function applyTaskViewState({
    nextTaskId = taskId,
    nextTaskSnapshot = taskSnapshot,
    nextPhase = phase,
    nextStatus = status,
    nextUploadPercent = uploadPercent,
    nextLoading = loading,
    nextRestoreBannerMode = restoreBannerMode,
    nextBindingCompleted = bindingCompleted,
    persistState = true,
  } = {}) {
    const normalizedTaskId = String(nextTaskId || "");
    const normalizedStatus = String(nextStatus || "");
    const normalizedUploadPercent = clampPercent(nextUploadPercent);
    const normalizedTaskSnapshot = nextTaskSnapshot ?? null;
    setTaskId(normalizedTaskId);
    setTaskSnapshot(normalizedTaskSnapshot);
    setPhase(nextPhase);
    setStatus(normalizedStatus);
    setLoading(Boolean(nextLoading));
    setUploadPercent(normalizedUploadPercent);
    setRestoreBannerMode(nextRestoreBannerMode);
    setBindingCompleted(Boolean(nextBindingCompleted));
    if (persistState) {
      await persistSession({
        taskId: normalizedTaskId,
        phase: nextPhase,
        taskSnapshot: normalizedTaskSnapshot,
        uploadPercent: normalizedUploadPercent,
        status: normalizedStatus,
        bindingCompleted: Boolean(nextBindingCompleted),
      });
    }
  }

  async function handleTaskFailureState({
    message,
    nextTaskId = taskId,
    nextTaskSnapshot = taskSnapshot,
    nextUploadPercent = uploadPercent,
    nextRestoreBannerMode = restoreBannerMode,
    nextBindingCompleted = bindingCompleted,
    showToast = true,
    refreshWallet = false,
    persistState = true,
  } = {}) {
    desktopBillingReportRef.current = null;
    const normalizedMessage = String(message || "").trim() || "生成失败";
    await applyTaskViewState({
      nextTaskId,
      nextTaskSnapshot,
      nextPhase: "error",
      nextStatus: normalizedMessage,
      nextUploadPercent,
      nextLoading: false,
      nextRestoreBannerMode,
      nextBindingCompleted,
      persistState,
    });
    if (refreshWallet) {
      await onWalletChanged?.();
    }
    if (showToast) {
      toast.error(normalizedMessage);
    }
  }

  async function resetSession() {
    desktopBillingReportRef.current = null;
    setPendingPersistedRestore(null);
    resetLocalSessionState();
    setDesktopLinkInput("");
    setDesktopLinkTitle("");
    if (!ownerUserId) return;
    await clearUploadPanelSuccessSnapshot(ownerUserId);
    await clearActiveGenerationTask(ownerUserId);
  }

  async function restoreSuccessSnapshot(saved) {
    const restoredFile = restoreSavedSourceFile(saved);
    const restoredMode = String(saved?.generation_mode || "").trim().toLowerCase() === "balanced" ? "balanced" : "fast";
    const restoredModelKey = String(saved?.selected_upload_model || configuredDefaultAsrModel || "");
    const restoredGenerationOptions = saved?.generation_options && typeof saved.generation_options === "object" ? saved.generation_options : null;
    setFile(restoredFile);
    setTaskId("");
    setLoading(false);
    setStatus(String(saved?.status_text || ""));
    setDurationSec(Number(saved?.duration_seconds || 0) || null);
    setPhase("success");
    setMode(restoredMode);
    setSelectedUploadModel(getDefaultUploadModelKey(restoredModelKey));
    setSelectedBalancedModel(getDefaultBalancedModelKey(restoredModelKey));
    if (restoredGenerationOptions) {
      setGenerationOptions(restoredGenerationOptions);
    }
    setCoverDataUrl(String(saved?.cover_data_url || ""));
    setCoverWidth(Number(saved?.cover_width || 0));
    setCoverHeight(Number(saved?.cover_height || 0));
    setCoverAspectRatio(Number(saved?.aspect_ratio || 0));
    setIsVideoSource(Boolean(saved?.is_video_source));
    setTaskSnapshot(saved?.task_snapshot || null);
    setUploadPercent(100);
    uploadPersistRef.current.latestPercent = 100;
    setBindingCompleted(Boolean(saved?.binding_completed));
    setLocalBusyModelKey("");
    setLocalBusyText("");
    successStateOriginRef.current = "revisit";
    if (ownerUserId) {
      await clearActiveGenerationTask(ownerUserId);
      await clearUploadPanelSuccessSnapshot(ownerUserId);
    }
  }

  function applyRestoredMediaState(saved, restoredFile) {
    setFile(restoredFile);
    setCoverDataUrl(String(saved?.cover_data_url || ""));
    setCoverWidth(Number(saved?.cover_width || 0));
    setCoverHeight(Number(saved?.cover_height || 0));
    setCoverAspectRatio(Number(saved?.aspect_ratio || 0));
    setDurationSec(Number(saved?.duration_seconds || 0) || null);
    setIsVideoSource(Boolean(saved?.is_video_source));
  }

  async function restorePersistedTaskSnapshot(saved) {
    const restoredFile = restoreSavedSourceFile(saved);
    const restoredMode = String(saved?.generation_mode || "").trim().toLowerCase() === "balanced" ? "balanced" : "fast";
    const restoredModelKey = String(saved?.selected_upload_model || configuredDefaultAsrModel || "");
    const restoredGenerationOptions = saved?.generation_options && typeof saved.generation_options === "object" ? saved.generation_options : null;
    const restoredTaskId = String(saved?.task_id || saved?.task_snapshot?.task_id || "");
    const restoredTaskSnapshot = saved?.task_snapshot || null;
    const restoredPhase = String(saved?.phase || "").trim().toLowerCase();
    const restoredStatus = String(saved?.status_text || "").trim();
    const restoredUploadPercent = clampPercent(saved?.upload_percent || 0);
    const restoredBindingCompleted = Boolean(saved?.binding_completed);
    const hasRestoredFile = Boolean(restoredFile);

    applyRestoredMediaState(saved, restoredFile);
    setMode(restoredMode);
    setSelectedUploadModel(getDefaultUploadModelKey(restoredModelKey));
    setSelectedBalancedModel(getDefaultBalancedModelKey(restoredModelKey));
    if (restoredGenerationOptions) {
      setGenerationOptions(restoredGenerationOptions);
    }
    setLocalProgressSnapshot(null);
    setLocalBusyModelKey("");
    setLocalBusyText("");
    setServerBusyModelKey("");
    setServerBusyText("");
    successStateOriginRef.current = "revisit";
    fallbackToastTaskRef.current = "";

    if (restoredTaskSnapshot?.lesson?.id && String(restoredTaskSnapshot?.status || "").trim().toLowerCase() === "succeeded") {
      if (ownerUserId) {
        await clearActiveGenerationTask(ownerUserId);
      }
      await restoreSuccessSnapshot(saved);
      return;
    }

    if (restoredTaskId) {
      const nextPhase = restoredPhase === "processing" ? "processing" : hasRestoredFile ? "ready" : "idle";
      setTaskId(restoredTaskId);
      setTaskSnapshot(restoredTaskSnapshot);
      setPhase(nextPhase);
      setStatus(restoredStatus || "正在检查上次任务状态");
      setLoading(restoredPhase === "processing");
      setUploadPercent(restoredPhase === "processing" ? 100 : restoredUploadPercent);
      uploadPersistRef.current.latestPercent = restoredPhase === "processing" ? 100 : restoredUploadPercent;
      setBindingCompleted(restoredBindingCompleted);
      setRestoreBannerMode(RESTORE_BANNER_MODES.VERIFYING);
      await persistSession({
        file: restoredFile,
        taskId: restoredTaskId,
        phase: nextPhase,
        taskSnapshot: restoredTaskSnapshot,
        selectedUploadModel: getDefaultUploadModelKey(restoredModelKey),
        generationOptions: restoredGenerationOptions || undefined,
        durationSec: Number(saved?.duration_seconds || 0) || null,
        coverDataUrl: String(saved?.cover_data_url || ""),
        coverWidth: Number(saved?.cover_width || 0),
        coverHeight: Number(saved?.cover_height || 0),
        aspectRatio: Number(saved?.aspect_ratio || 0),
        isVideoSource: Boolean(saved?.is_video_source),
        uploadPercent: restoredPhase === "processing" ? 100 : restoredUploadPercent,
        status: restoredStatus || "正在检查上次任务状态",
        bindingCompleted: restoredBindingCompleted,
      });
      return;
    }

    if ((restoredPhase === "uploading" || restoredPhase === "upload_paused") && hasRestoredFile) {
      const nextStatus = restoredStatus || "上次上传已中断，可继续上传当前素材。";
      setTaskId("");
      setTaskSnapshot(null);
      setPhase("upload_paused");
      setStatus(nextStatus);
      setLoading(false);
      setUploadPercent(restoredUploadPercent);
      uploadPersistRef.current.latestPercent = restoredUploadPercent;
      setBindingCompleted(false);
      setRestoreBannerMode(RESTORE_BANNER_MODES.NONE);
      await persistSession({
        file: restoredFile,
        taskId: "",
        phase: "upload_paused",
        taskSnapshot: null,
        selectedUploadModel: getDefaultUploadModelKey(restoredModelKey),
        generationOptions: restoredGenerationOptions || undefined,
        durationSec: Number(saved?.duration_seconds || 0) || null,
        coverDataUrl: String(saved?.cover_data_url || ""),
        coverWidth: Number(saved?.cover_width || 0),
        coverHeight: Number(saved?.cover_height || 0),
        aspectRatio: Number(saved?.aspect_ratio || 0),
        isVideoSource: Boolean(saved?.is_video_source),
        uploadPercent: restoredUploadPercent,
        status: nextStatus,
        bindingCompleted: false,
      });
      return;
    }

    setTaskId(restoredTaskId);
    setTaskSnapshot(restoredTaskSnapshot);
    setPhase(hasRestoredFile ? (restoredPhase === "error" ? "error" : "ready") : "idle");
    setStatus(restoredStatus);
    setLoading(false);
    setUploadPercent(restoredPhase === "error" ? restoredUploadPercent : 0);
    uploadPersistRef.current.latestPercent = restoredPhase === "error" ? restoredUploadPercent : 0;
    setBindingCompleted(restoredBindingCompleted);
    setRestoreBannerMode(RESTORE_BANNER_MODES.NONE);
    await persistSession({
      file: restoredFile,
      taskId: restoredTaskId,
      phase: hasRestoredFile ? (restoredPhase === "error" ? "error" : "ready") : "idle",
      taskSnapshot: restoredTaskSnapshot,
      selectedUploadModel: getDefaultUploadModelKey(restoredModelKey),
      generationOptions: restoredGenerationOptions || undefined,
      durationSec: Number(saved?.duration_seconds || 0) || null,
      coverDataUrl: String(saved?.cover_data_url || ""),
      coverWidth: Number(saved?.cover_width || 0),
      coverHeight: Number(saved?.cover_height || 0),
      aspectRatio: Number(saved?.aspect_ratio || 0),
      isVideoSource: Boolean(saved?.is_video_source),
      uploadPercent: restoredPhase === "error" ? restoredUploadPercent : 0,
      status: restoredStatus,
      bindingCompleted: restoredBindingCompleted,
    });
  }

  async function continuePersistedSessionRestore(snapshot = pendingPersistedRestore) {
    if (!snapshot) return;
    setPendingPersistedRestore(null);
    if (snapshot.successSnapshot?.task_snapshot?.lesson?.id) {
      await restoreSuccessSnapshot(snapshot.successSnapshot);
      return;
    }
    if (snapshot.taskSnapshot) {
      await restorePersistedTaskSnapshot(snapshot.taskSnapshot);
    }
  }

  async function startNewTaskFromPersistedRestore() {
    setPendingPersistedRestore(null);
    desktopBillingReportRef.current = null;
    resetLocalSessionState();
    setDesktopLinkInput("");
    setDesktopLinkTitle("");
    if (!ownerUserId) return;
    await clearUploadPanelSuccessSnapshot(ownerUserId);
    await clearActiveGenerationTask(ownerUserId);
  }

  async function cancelDesktopLinkImport(options = {}) {
    const { showToast = true } = options;
    const activeTaskId = desktopLinkTaskIdRef.current || desktopLinkTaskId;
    if (!activeTaskId) {
      clearDesktopLinkTaskTracking(true);
      return;
    }
    try {
      await requestDesktopLocalHelper(`/api/desktop-asr/url-import/tasks/${encodeURIComponent(activeTaskId)}/cancel`, "json", {
        method: "POST",
      });
      setStatus("正在取消下载");
      setLoading(true);
      updateDesktopLinkProgressState(uploadPercent, "正在取消下载");
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : String(error);
      if (showToast) {
        toast.error(message);
      }
      await handleTaskFailureState({
        message,
        nextTaskId: "",
        nextTaskSnapshot: null,
        nextUploadPercent: 0,
        nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
        nextBindingCompleted: false,
        persistState: false,
      });
    }
  }

  async function pollDesktopLinkImportTask(linkTaskId, pollToken) {
    if (!linkTaskId || pollToken !== desktopLinkPollTokenRef.current) {
      return;
    }
    try {
      const response = await requestDesktopLocalHelper(`/api/desktop-asr/url-import/tasks/${encodeURIComponent(linkTaskId)}`, "json");
      if (pollToken !== desktopLinkPollTokenRef.current) {
        return;
      }
      const payload = response.data || {};
      const nextStatus = String(payload.status || "").trim().toLowerCase();
      const nextMessage = sanitizeUserFacingText(String(payload.status_text || "正在下载素材"));
      setLoading(true);
      setPhase(DESKTOP_LINK_IMPORTING_PHASE);
      setStatus(nextMessage);
      updateDesktopLinkProgressState(Number(payload.progress_percent || 0), nextMessage);

      if (nextStatus === "succeeded") {
        setStatus("素材下载完成，正在载入文件");
        updateDesktopLinkProgressState(100, "素材下载完成，正在载入文件");
        if (payload?.title) {
          setDesktopLinkTitle((prev) => prev || String(payload.title || "").trim());
        }
        const thumbnailUrl = String(payload?.thumbnail || "").trim();
        const sourceFile = await loadDesktopImportedSourceFile(payload);
        if (pollToken !== desktopLinkPollTokenRef.current) {
          return;
        }
        if (thumbnailUrl) {
          try {
            Object.defineProperty(sourceFile, "thumbnail", { value: thumbnailUrl, configurable: true, writable: true });
          } catch (_) {
            try { sourceFile.thumbnail = thumbnailUrl; } catch (_) { void 0; }
          }
        } else if (String(sourceFile?.desktopSourcePath || sourceFile?.path || "").trim()) {
          try {
            const materializedFile = await materializeDesktopSelectedFile(sourceFile);
            if (materializedFile && isBlobBackedSourceFile(materializedFile)) {
              const coverPreview = await extractMediaCoverPreview(materializedFile, materializedFile.name || "");
              if (coverPreview?.coverDataUrl) {
                try {
                  Object.defineProperty(sourceFile, "thumbnail", { value: coverPreview.coverDataUrl, configurable: true, writable: true });
                } catch (_) {
                  try { sourceFile.thumbnail = coverPreview.coverDataUrl; } catch (_) { void 0; }
                }
              }
            }
          } catch (_) {
            void 0;
          }
        }
        clearDesktopLinkTaskTracking(false);
        const selectionMeta = await onSelectFile(sourceFile);
        const sourceDurationSeconds = Number(selectionMeta?.durationSec || payload.duration_seconds || 0);
        await submit({
          sourceFile,
          sourceDurationSec: sourceDurationSeconds,
          skipDesktopRecommendation: true,
          bypassDesktopLinkMode: true,
        });
        return;
      }

      if (nextStatus === "failed") {
        clearDesktopLinkTaskTracking(false);
        setLocalProgressSnapshot(null);
        await handleTaskFailureState({
          message: buildDesktopLinkErrorMessage(payload.error_message || nextMessage || "下载链接素材失败"),
          nextTaskId: "",
          nextTaskSnapshot: null,
          nextUploadPercent: 0,
          nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
          nextBindingCompleted: false,
          persistState: false,
        });
        return;
      }

      if (nextStatus === "cancelled") {
        clearDesktopLinkTaskTracking(false);
        setLocalProgressSnapshot(null);
        await handleTaskFailureState({
          message: nextMessage || "已取消链接下载，可重新开始。",
          nextTaskId: "",
          nextTaskSnapshot: null,
          nextUploadPercent: 0,
          nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
          nextBindingCompleted: false,
          showToast: false,
          persistState: false,
        });
        return;
      }

      setTimeout(() => {
        void pollDesktopLinkImportTask(linkTaskId, pollToken);
      }, 1000);
    } catch (error) {
      if (pollToken !== desktopLinkPollTokenRef.current) {
        return;
      }
      clearDesktopLinkTaskTracking(false);
      setLocalProgressSnapshot(null);
      const message = error instanceof Error && error.message ? error.message : `网络错误: ${String(error)}`;
      await handleTaskFailureState({
        message: buildDesktopLinkErrorMessage(message),
        nextTaskId: "",
        nextTaskSnapshot: null,
        nextUploadPercent: 0,
        nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
        nextBindingCompleted: false,
        persistState: false,
      });
    }
  }

  async function submitDesktopLinkImport() {
    const sanitizedLinkInput = sanitizeDesktopLinkInput(desktopLinkInput);
    if (!desktopRuntimeAvailable) {
      await handleTaskFailureState({ message: LINK_IMPORT_DESKTOP_ONLY_MESSAGE, nextTaskId: "", nextTaskSnapshot: null, nextUploadPercent: 0, nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE, nextBindingCompleted: false, persistState: false });
      return;
    }
    if (!desktopLinkModeSupported) {
      await handleTaskFailureState({ message: LINK_IMPORT_DESKTOP_ONLY_MESSAGE, nextTaskId: "", nextTaskSnapshot: null, nextUploadPercent: 0, nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE, nextBindingCompleted: false, persistState: false });
      return;
    }
    if (!networkOnline) {
      await handleTaskFailureState({ message: DESKTOP_CLIENT_OFFLINE_MESSAGE, nextTaskId: "", nextTaskSnapshot: null, nextUploadPercent: 0, nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE, nextBindingCompleted: false, persistState: false });
      return;
    }
    if (!sanitizedLinkInput) {
      setDesktopLinkInput("");
      await handleTaskFailureState({
        message: `${DESKTOP_LINK_INVALID_MESSAGE} ${DESKTOP_LINK_PUBLIC_SUPPORT_MESSAGE}，或改用 SnapAny`,
        nextTaskId: "",
        nextTaskSnapshot: null,
        nextUploadPercent: 0,
        nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
        nextBindingCompleted: false,
        persistState: false,
      });
      return;
    }
    setDesktopLinkInput(sanitizedLinkInput);

    if (ownerUserId) {
      await clearUploadPanelSuccessSnapshot(ownerUserId);
    }
    successStateOriginRef.current = "none";
    stopPollingSession();
    resetUploadPersistState();
    uploadAbortRef.current?.abort();
    uploadAbortRef.current = null;
    localRunAbortRef.current?.abort();
    localRunAbortRef.current = null;
    clearLocalStageProgressTimer();
    clearDesktopLinkTaskTracking(true);
    setTaskId("");
    setTaskSnapshot(null);
    setUploadPercent(0);
    setLoading(true);
    setStatus("正在解析链接");
    setPhase(DESKTOP_LINK_IMPORTING_PHASE);
    setBindingCompleted(false);
    updateDesktopLinkProgressState(0, "正在解析链接");

    try {
      const response = await requestDesktopLocalHelper("/api/desktop-asr/url-import/tasks", "json", {
        method: "POST",
        body: { source_url: sanitizedLinkInput },
      });
      const payload = response.data || {};
      const nextTaskId = String(payload.task_id || "");
      if (!nextTaskId) {
        throw new Error("链接下载任务创建成功但缺少 task_id");
      }
      const linkPollToken = desktopLinkPollTokenRef.current || 1;
      desktopLinkTaskIdRef.current = nextTaskId;
      setDesktopLinkTaskId(nextTaskId);
      if (!desktopLinkTitle && payload?.title) {
        setDesktopLinkTitle(String(payload.title || "").trim());
      }
      const nextMessage = sanitizeUserFacingText(String(payload.status_text || "正在下载素材"));
      setStatus(nextMessage);
      updateDesktopLinkProgressState(Number(payload.progress_percent || 0), nextMessage);
      await pollDesktopLinkImportTask(nextTaskId, linkPollToken);
    } catch (error) {
      clearDesktopLinkTaskTracking(false);
      setLocalProgressSnapshot(null);
      const message = buildDesktopLinkErrorMessage(error instanceof Error ? error.message : String(error));
      await handleTaskFailureState({
        message,
        nextTaskId: "",
        nextTaskSnapshot: null,
        nextUploadPercent: 0,
        nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
        nextBindingCompleted: false,
        persistState: false,
      });
    }
  }

  async function saveSuccessSnapshot(sourceFile, data, nextStatus = "") {
    if (!ownerUserId || !data?.lesson?.id) return;
    await saveUploadPanelSuccessSnapshot(ownerUserId, {
      phase: "success",
      task_snapshot: data,
      selected_upload_model: String(selectedUploadModel || ""),
      generation_options: { ...(generationOptions || {}) },
      file_blob: isBlobBackedSourceFile(sourceFile) ? sourceFile : null,
      file_name: String(sourceFile?.name || data.lesson.source_filename || ""),
      media_type: String(sourceFile?.type || ""),
      file_size_bytes: Math.max(0, Number(sourceFile?.size || 0)),
      file_last_modified_ms: Math.max(0, Number(sourceFile?.lastModified || 0)),
      desktop_source_path: resolveDesktopSelectedSourcePath(sourceFile),
      cover_data_url: String(coverDataUrl || ""),
      cover_width: Number(coverWidth || 0),
      cover_height: Number(coverHeight || 0),
      aspect_ratio: Number(coverAspectRatio || 0),
      duration_seconds: Number(durationSec || 0),
      is_video_source: Boolean(isVideoSource),
      generation_mode: mode === "fast" ? "fast" : "balanced",
      upload_percent: 100,
      status_text: String(nextStatus || status || ""),
      binding_completed: Boolean(bindingCompleted),
    });
  }

  function persistUploadProgress(nextPercent, sourceFileOverride = undefined) {
    const persistedFile = sourceFileOverride ?? file;
    if (!ownerUserId || !persistedFile) return;
    const normalizedPercent = clampPercent(nextPercent);
    uploadPersistRef.current.latestPercent = normalizedPercent;
    const now = Date.now();
    const elapsed = now - Number(uploadPersistRef.current.lastSavedAt || 0);
    const shouldPersistImmediately =
      uploadPersistRef.current.lastSavedPercent < 0 ||
      normalizedPercent >= 100 ||
      elapsed >= UPLOAD_PROGRESS_PERSIST_INTERVAL_MS;

    clearUploadPersistTimer();

    const flush = () => {
      uploadPersistRef.current.lastSavedAt = Date.now();
      uploadPersistRef.current.lastSavedPercent = normalizedPercent;
      void persistSession({ file: persistedFile, phase: "uploading", uploadPercent: normalizedPercent, status: "" });
    };

    if (shouldPersistImmediately) {
      flush();
      return;
    }

    uploadPersistRef.current.timer = setTimeout(() => {
      uploadPersistRef.current.timer = null;
      flush();
    }, Math.max(80, UPLOAD_PROGRESS_PERSIST_INTERVAL_MS - elapsed));
  }

  return {
    applyTaskViewState,
    cancelDesktopLinkImport,
    continuePersistedSessionRestore,
    handleTaskFailureState,
    persistSession,
    persistUploadProgress,
    resetSession,
    restorePersistedTaskSnapshot,
    restoreSuccessSnapshot,
    saveSuccessSnapshot,
    startNewTaskFromPersistedRestore,
    submitDesktopLinkImport,
  };
}


