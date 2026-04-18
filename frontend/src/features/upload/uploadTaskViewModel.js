import { getUploadTaskTone } from "./uploadStatusTheme";
import { clampPercent } from "./uploadHelpers";
import {
  DESKTOP_LINK_IMPORTING_PHASE,
  DESKTOP_LINK_INVALID_MESSAGE,
  DESKTOP_LINK_PUBLIC_SUPPORT_MESSAGE,
  DESKTOP_LINK_RESTRICTED_MESSAGE,
  DESKTOP_LINK_UNSUPPORTED_MESSAGE,
  DESKTOP_LOCAL_GENERATING_PHASE,
  DESKTOP_LOCAL_TRANSCRIBING_PHASE,
  DISPLAY_STAGES,
  RESTORE_BANNER_MODES,
  STAGE_PROGRESS_BOUNDS,
} from "./uploadConstants";

export function sanitizeUserFacingText(text) {
  return String(text || "")
    .replace(/(?:funasr|faster-whisper|ctranslate2) import failed:[^\n]*/gi, "当前模型运行环境未就绪，请联系管理员检查服务端依赖。")
    .replace(/No module named ['"][^'"]+['"]/gi, "服务端依赖未安装")
    .replace(/本地识别/g, "识别")
    .replace(/本地模型/g, "模型")
    .replace(/本地 Bottle 1\.0/g, "Bottle 1.0")
    .replace(/本地字幕/g, "字幕")
    .replace(/本地音频/g, "音频")
    .replace(/本地视频/g, "视频")
    .replace(/本地解码/g, "直接解码")
    .replace(/本地解析/g, "解析")
    .replace(/在本地直接/g, "直接")
    .replace(/在本地运行/g, "运行")
    .replace(/本地运行/g, "运行")
    .replace(/本地/g, "")
    .replace(/均衡模式/g, "当前模型")
    .replace(/高速模式/g, "另一个模型")
    .replace(/WASM 模式/g, "当前模式")
    .replace(/WASM/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function extractFirstSupportedUrl(text) {
  const matches = String(text || "").match(/https?:\/\/[^\s<>'"，。；！？、\])}]+/gi) || [];
  for (const match of matches) {
    const candidate = String(match || "").trim().replace(/[.,!?;:)"'\]}，。；！？、]+$/g, "");
    if (candidate) {
      return candidate;
    }
  }
  return "";
}

export function sanitizeDesktopLinkInput(text) {
  const extracted = extractFirstSupportedUrl(text);
  if (extracted) {
    return extracted;
  }
  const normalized = String(text || "").trim();
  if (/^https?:\/\//i.test(normalized)) {
    return normalized.replace(/[.,!?;:)"'\]}，。；！？、]+$/g, "");
  }
  return "";
}

export function buildDesktopLinkErrorMessage(errorLike = "") {
  const normalized = sanitizeUserFacingText(
    typeof errorLike === "string" ? errorLike : errorLike?.message || errorLike?.detail || errorLike?.error_message || "",
  );
  const lowered = normalized.toLowerCase();
  if (!normalized) {
    return DESKTOP_LINK_UNSUPPORTED_MESSAGE;
  }
  if (normalized.includes(DESKTOP_LINK_INVALID_MESSAGE)) {
    return `${DESKTOP_LINK_INVALID_MESSAGE} ${DESKTOP_LINK_PUBLIC_SUPPORT_MESSAGE}，或改用 SnapAny`;
  }
  if (normalized.includes("登录") || normalized.includes("限制") || lowered.includes("login") || lowered.includes("cookie")) {
    return DESKTOP_LINK_RESTRICTED_MESSAGE;
  }
  if (normalized.includes("不支持") || lowered.includes("unsupported")) {
    return DESKTOP_LINK_UNSUPPORTED_MESSAGE;
  }
  return normalized;
}

export function getStageLabelByKey(stageKey) {
  if (!stageKey) return "";
  const stage = DISPLAY_STAGES.find((item) => item.key === stageKey);
  return stage ? stage.label : stageKey;
}

function buildBottle2CloudStageItem({ key, label, status = "pending", progressPercent = 0, detailText = "--", statusText = "等待开始" }) {
  return {
    key,
    label,
    status,
    progressPercent: clampPercent(progressPercent),
    detailText: detailText || "--",
    statusText,
  };
}

export function getBottle2CloudStageDisplayItems({ phase, uploadPercent, taskSnapshot, status = "" }) {
  const normalizedPhase = String(phase || "").trim();
  const normalizedStatusText = sanitizeUserFacingText(status);
  const taskStatus = String(taskSnapshot?.status || "").trim().toLowerCase();
  const currentTaskStageKey = taskSnapshot ? getCurrentTaskStageKey(taskSnapshot) : "";
  const currentTaskText = sanitizeUserFacingText(taskSnapshot?.current_text || "");
  const hasTask = Boolean(taskSnapshot);
  const isSubmittingTask = normalizedPhase === "uploading" && normalizedStatusText.includes("提交云端任务");
  const isUploadFailed = normalizedPhase === "error" && !hasTask && clampPercent(uploadPercent) < 100;
  const isSubmitFailed = normalizedPhase === "error" && !hasTask && clampPercent(uploadPercent) >= 100;
  const isTaskFailed = taskStatus === "failed";
  const isTaskSucceeded = normalizedPhase === "success" || taskStatus === "succeeded";
  const isTranscribingStage = hasTask && (currentTaskStageKey === "convert_audio" || currentTaskStageKey === "asr_transcribe");
  const isLessonBuildingStage = hasTask && (currentTaskStageKey === "build_lesson" || currentTaskStageKey === "translate_zh");
  const isCefrStage =
    hasTask &&
    (currentTaskStageKey === "cefr_annotation" || currentTaskStageKey === "word_explanation" || currentTaskStageKey === "write_lesson");
  const uploadStage = buildBottle2CloudStageItem({
    key: "upload",
    label: "上传素材",
    status: isUploadFailed ? "failed" : normalizedPhase === "uploading" && !isSubmittingTask ? "running" : (hasTask || normalizedPhase === "processing" || isSubmittingTask || isTaskSucceeded || isSubmitFailed ? "completed" : "pending"),
    progressPercent: normalizedPhase === "uploading" && !isSubmittingTask ? Math.max(6, clampPercent(uploadPercent)) : (hasTask || normalizedPhase === "processing" || isSubmittingTask || isTaskSucceeded || isSubmitFailed ? 100 : 0),
    detailText: normalizedPhase === "uploading" && !isSubmittingTask ? `${clampPercent(uploadPercent)}%` : (hasTask || normalizedPhase === "processing" || isSubmittingTask || isTaskSucceeded || isSubmitFailed ? "1/1" : "--"),
    statusText: isUploadFailed ? (normalizedStatusText || "上传失败") : normalizedPhase === "uploading" && !isSubmittingTask ? (normalizedStatusText || "上传中") : (hasTask || normalizedPhase === "processing" || isSubmittingTask || isTaskSucceeded || isSubmitFailed ? "已完成" : "等待开始"),
  });
  const submitStage = buildBottle2CloudStageItem({
    key: "submit_cloud_task",
    label: "提交云端任务",
    status: isSubmitFailed ? "failed" : (hasTask || normalizedPhase === "processing" || isTaskSucceeded ? "completed" : (isSubmittingTask ? "running" : "pending")),
    progressPercent: hasTask || normalizedPhase === "processing" || isTaskSucceeded ? 100 : (isSubmittingTask ? 70 : 0),
    detailText: hasTask || normalizedPhase === "processing" || isTaskSucceeded ? "1/1" : (isSubmittingTask ? "进行中" : "--"),
    statusText: isSubmitFailed ? (normalizedStatusText || "提交失败") : (hasTask || normalizedPhase === "processing" || isTaskSucceeded ? "已完成" : (isSubmittingTask ? (normalizedStatusText || "提交中") : "等待开始")),
  });
  const transcribingStage = buildBottle2CloudStageItem({
    key: "transcribing",
    label: "转写中",
    status: isTaskFailed && isTranscribingStage ? "failed" : (isTaskSucceeded || isLessonBuildingStage || isCefrStage ? "completed" : (isTranscribingStage ? "running" : "pending")),
    progressPercent: isTaskSucceeded || isLessonBuildingStage || isCefrStage ? 100 : (isTranscribingStage ? Math.max(8, clampPercent((Number(taskSnapshot?.overall_percent || 0) / 45) * 100)) : 0),
    detailText: isTaskSucceeded || isLessonBuildingStage || isCefrStage ? "1/1" : (isTranscribingStage ? `${Math.max(1, clampPercent(taskSnapshot?.overall_percent || 0))}%` : "--"),
    statusText: isTaskFailed && isTranscribingStage ? (currentTaskText || "转写失败") : (isTaskSucceeded || isLessonBuildingStage || isCefrStage ? "已完成" : (isTranscribingStage ? (currentTaskText || "转写中") : "等待开始")),
  });
  const generatingStage = buildBottle2CloudStageItem({
    key: "generating_lesson",
    label: "生成课程",
    status: isTaskFailed && !isTranscribingStage ? "failed" : (isTaskSucceeded || isCefrStage ? "completed" : (isLessonBuildingStage ? "running" : "pending")),
    progressPercent: isTaskSucceeded || isCefrStage ? 100 : (isLessonBuildingStage ? Math.max(10, clampPercent(((Math.max(45, Number(taskSnapshot?.overall_percent || 0)) - 45) / 40) * 100)) : 0),
    detailText: isTaskSucceeded || isCefrStage ? "1/1" : (isLessonBuildingStage ? `${Math.max(45, clampPercent(taskSnapshot?.overall_percent || 0))}%` : "--"),
    statusText: isTaskFailed && !isTranscribingStage ? (currentTaskText || "生成课程失败") : (isTaskSucceeded || isCefrStage ? "已完成" : (isLessonBuildingStage ? (currentTaskText || "生成课程中") : "等待开始")),
  });
  const cefrStage = buildBottle2CloudStageItem({
    key: "content_enrichment",
    label: "补充内容",
    status: isTaskFailed && isCefrStage && !isLessonBuildingStage ? "failed" : (isTaskSucceeded ? "completed" : (isCefrStage ? "running" : "pending")),
    progressPercent: isTaskSucceeded ? 100 : (isCefrStage ? Math.max(10, clampPercent(((Math.max(85, Number(taskSnapshot?.overall_percent || 0)) - 85) / 7) * 100)) : 0),
    detailText: isTaskSucceeded ? "1/1" : (isCefrStage ? `${Math.max(85, clampPercent(taskSnapshot?.overall_percent || 0))}%` : "--"),
    statusText: isTaskFailed && isCefrStage ? (currentTaskText || "补充内容失败") : (isTaskSucceeded ? "已完成" : (isCefrStage ? (currentTaskText || "补充内容中") : "等待开始")),
  });
  const completedStage = buildBottle2CloudStageItem({
    key: "completed",
    label: "已完成",
    status: isTaskSucceeded ? "completed" : "pending",
    progressPercent: isTaskSucceeded ? 100 : 0,
    detailText: isTaskSucceeded ? "1/1" : "--",
    statusText: isTaskSucceeded ? "课程已生成完成" : "等待完成",
  });
  return [uploadStage, submitStage, transcribingStage, generatingStage, cefrStage, completedStage];
}

export function getBottle2CloudProgressHeadline({ phase, uploadPercent, taskSnapshot, status = "" }) {
  const normalizedPhase = String(phase || "").trim();
  const normalizedStatusText = sanitizeUserFacingText(status);
  if (normalizedPhase === "uploading") {
    return normalizedStatusText.includes("提交云端任务") ? "提交云端任务" : `上传素材 ${clampPercent(uploadPercent)}%`;
  }
  if (normalizedPhase === "success") return "生成课程完成";
  if (normalizedPhase === "error") return "生成课程失败";
  if (!taskSnapshot) return "等待上传";
  const currentTaskStageKey = getCurrentTaskStageKey(taskSnapshot);
  const currentTaskText = sanitizeUserFacingText(taskSnapshot?.current_text || "");
  if (currentTaskStageKey === "convert_audio" || currentTaskStageKey === "asr_transcribe") {
    return currentTaskText || "转写中";
  }
  if (["build_lesson", "translate_zh"].includes(currentTaskStageKey)) {
    return currentTaskText || "生成课程";
  }
  if (["cefr_annotation", "word_explanation", "write_lesson"].includes(currentTaskStageKey)) {
    return currentTaskText || "补充内容";
  }
  return currentTaskText || "生成课程";
}

export function getStageItems(taskSnapshot) {
  const map = Object.fromEntries((Array.isArray(taskSnapshot?.stages) ? taskSnapshot.stages : []).map((item) => [item.key, item.status || "pending"]));
  return DISPLAY_STAGES.map((item) => ({ ...item, status: map[item.key] || "pending" }));
}

export function getCurrentTaskStageKey(taskSnapshot) {
  const items = getStageItems(taskSnapshot);
  return items.find((item) => item.status === "running")?.key || items.find((item) => item.status === "failed")?.key || items.find((item) => item.status !== "completed")?.key || "write_lesson";
}

export function getStageProgressRatioFromOverall(stageKey, overallPercent) {
  const bounds = STAGE_PROGRESS_BOUNDS[stageKey] || { start: 0, end: 100 };
  const safeOverallPercent = clampPercent(overallPercent);
  const span = Math.max(1, Number(bounds.end || 100) - Number(bounds.start || 0));
  if (safeOverallPercent <= bounds.start) return 0;
  if (safeOverallPercent >= bounds.end) return 1;
  return (safeOverallPercent - bounds.start) / span;
}

export function buildStageCounterDisplay(done, total, fallbackRatio, fallbackTotal = 0) {
  const safeDone = Math.max(0, Number(done || 0));
  const safeTotal = Math.max(safeDone, Number(total || 0));
  if (safeTotal > 0) {
    return {
      detailText: `${safeDone}/${safeTotal}`,
      progressPercent: clampPercent((safeDone / safeTotal) * 100),
    };
  }
  const safeFallbackRatio = Math.max(0, Math.min(1, Number(fallbackRatio) || 0));
  const normalizedFallbackTotal = Math.max(0, Number(fallbackTotal || 0));
  if (normalizedFallbackTotal <= 0) {
    return {
      detailText: "--",
      progressPercent: clampPercent(safeFallbackRatio * 100),
    };
  }
  const fallbackDone = safeFallbackRatio >= 1 ? normalizedFallbackTotal : Math.max(0, Math.floor(normalizedFallbackTotal * safeFallbackRatio));
  return {
    detailText: `${fallbackDone}/${normalizedFallbackTotal}`,
    progressPercent: clampPercent(safeFallbackRatio * 100),
  };
}

export function trimStageCounterSuffix(text) {
  return sanitizeUserFacingText(text).replace(/\s+\d+\/\d+$/, "").trim();
}

export function getStageStatusText(taskSnapshot, stageKey, stageStatus, currentStageKey) {
  const currentText = trimStageCounterSuffix(taskSnapshot?.current_text);
  if (stageStatus === "completed") return "已完成";
  if (stageStatus === "failed") return currentText || "执行失败";
  if (stageStatus === "running") {
    if (stageKey === currentStageKey && currentText) return currentText;
    if (stageKey === "convert_audio") return "抽音频中";
    if (stageKey === "asr_transcribe") return "识别字幕中";
    if (stageKey === "build_lesson") return "生成课程结构中";
    if (stageKey === "translate_zh") return "翻译中";
    if (stageKey === "cefr_annotation") return "生成生词标注中";
    if (stageKey === "word_explanation") return "生成讲解中";
    if (stageKey === "write_lesson") return "保存中";
  }
  return "等待开始";
}

export function getStageDisplayMeta(taskSnapshot, stageKey, stageStatus, currentStageKey) {
  const counters = taskSnapshot?.counters || {};
  const fallbackRatio = stageStatus === "completed" ? 1 : stageStatus === "pending" ? 0 : getStageProgressRatioFromOverall(stageKey, taskSnapshot?.overall_percent);
  let progressMeta = { detailText: "--", progressPercent: clampPercent(fallbackRatio * 100) };

  if (stageKey === "convert_audio") {
    progressMeta = buildStageCounterDisplay(stageStatus === "completed" ? 1 : 0, 1, fallbackRatio, 1);
  } else if (stageKey === "asr_transcribe") {
    const segmentDone = Math.max(0, Number(counters.segment_done || 0));
    const segmentTotal = Math.max(segmentDone, Number(counters.segment_total || 0));
    if (segmentTotal > 0) {
      progressMeta = buildStageCounterDisplay(segmentDone, segmentTotal, fallbackRatio, segmentTotal);
    } else {
      const done = Math.max(0, Number(counters.asr_done || 0));
      const total = Math.max(done, Number(counters.asr_estimated || 0));
      progressMeta = total > 0 ? buildStageCounterDisplay(done, total, fallbackRatio, total) : buildStageCounterDisplay(0, 0, fallbackRatio, 0);
    }
  } else if (stageKey === "translate_zh") {
    const done = Math.max(0, Number(counters.translate_done || 0));
    const total = Math.max(done, Number(counters.translate_total || 0));
    progressMeta = buildStageCounterDisplay(done, total, fallbackRatio, Math.max(1, total));
  } else if (stageKey === "cefr_annotation" || stageKey === "word_explanation" || stageKey === "write_lesson") {
    progressMeta = buildStageCounterDisplay(stageStatus === "completed" ? 1 : 0, 1, fallbackRatio, 1);
  }

  return {
    progressPercent: progressMeta.progressPercent,
    detailText: progressMeta.detailText,
    statusText: getStageStatusText(taskSnapshot, stageKey, stageStatus, currentStageKey),
  };
}

export function getStageDisplayItems(taskSnapshot) {
  const currentStageKey = getCurrentTaskStageKey(taskSnapshot);
  return getStageItems(taskSnapshot).map((item) => ({
    ...item,
    ...getStageDisplayMeta(taskSnapshot, item.key, item.status, currentStageKey),
  }));
}

export function getProgressHeadline(phase, uploadPercent, taskSnapshot) {
  if (phase === "success") return "课程已生成完成";
  if (phase === "uploading") return `上传素材 ${clampPercent(uploadPercent)}%`;
  if (phase === "upload_paused") return `上传素材 ${clampPercent(uploadPercent)}%`;
  if (phase === "error" && !taskSnapshot) return "上传失败";
  if (!taskSnapshot) return "等待开始";
  const taskStatus = String(taskSnapshot.status || "").toLowerCase();
  if (taskStatus === "paused" || taskStatus === "terminated") {
    return sanitizeUserFacingText(taskSnapshot.current_text || taskSnapshot.message || "已停止当前生成");
  }

  const stageKey = getCurrentTaskStageKey(taskSnapshot);
  const counters = taskSnapshot.counters || {};
  if (stageKey === "convert_audio" || stageKey === "asr_transcribe") {
    const segmentDone = Math.max(0, Number(counters.segment_done || 0));
    const segmentTotal = Math.max(segmentDone, Number(counters.segment_total || 0));
    if (segmentTotal > 0) {
      return `识别字幕 ${segmentDone}/${segmentTotal}`;
    }
    return sanitizeUserFacingText(taskSnapshot.current_text || "识别中");
  }
  if (stageKey === "build_lesson") return sanitizeUserFacingText(taskSnapshot.current_text || "生成课程结构");
  if (stageKey === "translate_zh") {
    const done = Math.max(0, Number(counters.translate_done || 0));
    const total = Math.max(done, Number(counters.translate_total || 0));
    return total > 0 ? `翻译字幕 ${done}/${total}` : sanitizeUserFacingText(taskSnapshot.current_text || "翻译字幕");
  }
  if (stageKey === "cefr_annotation" || stageKey === "word_explanation") {
    return sanitizeUserFacingText(taskSnapshot.current_text || "补充内容");
  }
  if (stageKey === "convert_audio") return sanitizeUserFacingText(taskSnapshot.current_text || "抽音频");
  if (stageKey === "write_lesson") return sanitizeUserFacingText(taskSnapshot.current_text || "保存完成");
  return sanitizeUserFacingText(taskSnapshot.current_text || "等待处理");
}

export function getVisualProgress(phase, uploadPercent, taskSnapshot) {
  if (phase === "success") return 100;
  if (phase === DESKTOP_LINK_IMPORTING_PHASE) {
    return taskSnapshot ? clampPercent(taskSnapshot?.overall_percent) : clampPercent(uploadPercent);
  }
  if (phase === DESKTOP_LOCAL_GENERATING_PHASE) {
    return clampPercent(uploadPercent);
  }
  if (phase === "local_transcribing" || phase === DESKTOP_LOCAL_TRANSCRIBING_PHASE) {
    return taskSnapshot ? clampPercent(taskSnapshot?.overall_percent) : 28;
  }
  if (phase === "processing" || taskSnapshot) return Math.round(42 + clampPercent(taskSnapshot?.overall_percent) * 0.58);
  if (phase === "uploading" || phase === "upload_paused") return Math.round(Math.max(3, Math.min(42, clampPercent(uploadPercent) * 0.42)));
  return 0;
}

export function getStageProgressPercent(stageKey, ratio = 1) {
  const safeRatio = Math.max(0, Math.min(1, Number(ratio) || 0));
  if (stageKey === "convert_audio") return Math.round(15 * safeRatio);
  if (stageKey === "asr_transcribe") return Math.round(15 + 30 * safeRatio);
  if (stageKey === "build_lesson") return Math.round(45 + 15 * safeRatio);
  if (stageKey === "translate_zh") return Math.round(60 + 25 * safeRatio);
  if (stageKey === "cefr_annotation") return Math.round(85 + 5 * safeRatio);
  if (stageKey === "word_explanation") return Math.round(90 + 5 * safeRatio);
  if (stageKey === "write_lesson") return Math.round(95 + 5 * safeRatio);
  return 0;
}

export function buildLocalProgressSnapshot({ stageKey, stageStatus = "running", ratio = 0, currentText = "", counters = {} }) {
  const stageIndex = DISPLAY_STAGES.findIndex((item) => item.key === stageKey);
  return {
    overall_percent: getStageProgressPercent(stageKey, ratio),
    current_text: String(currentText || ""),
    counters: { ...(counters || {}) },
    stages: DISPLAY_STAGES.map((item, index) => {
      let status = "pending";
      if (stageIndex >= 0) {
        if (index < stageIndex) status = "completed";
        if (index === stageIndex) status = stageStatus;
      }
      return { key: item.key, status };
    }),
  };
}

export function buildTaskState({ phase, taskId, taskSnapshot, uploadPercent, status }) {
  if (!taskId && !taskSnapshot && phase === "idle") return null;
  return {
    taskId: String(taskId || taskSnapshot?.task_id || ""),
    phase,
    tone: getUploadTaskTone({
      phase,
      resumeAvailable: Boolean(taskSnapshot?.resume_available),
      taskStatus: taskSnapshot?.status,
    }),
    headline: sanitizeUserFacingText(getProgressHeadline(phase, uploadPercent, taskSnapshot)),
    progressPercent: getVisualProgress(phase, uploadPercent, taskSnapshot),
    statusText: sanitizeUserFacingText(status),
    taskSnapshot,
    lessonId: Number(taskSnapshot?.lesson?.id || 0),
    resumeAvailable: Boolean(taskSnapshot?.resume_available),
  };
}

export function getRecoveryBannerText(taskSnapshot) {
  const taskStatus = String(taskSnapshot?.status || "").toLowerCase();
  const currentText = sanitizeUserFacingText(String(taskSnapshot?.current_text || taskSnapshot?.message || ""));
  if (taskStatus === "paused") {
    return currentText || "已暂停当前生成，可继续生成或重新开始。";
  }
  if (taskStatus === "terminated") {
    return currentText || "已终止当前生成，素材仍保留，可重新开始。";
  }
  return "";
}

export function getInterruptedLocalAsrStatus(hasFile) {
  return hasFile ? "上次生成已中断，请重新开始。" : "";
}

export function getTaskStatusCardText(restoreBannerMode, taskSnapshot, statusText = "") {
  if (restoreBannerMode === RESTORE_BANNER_MODES.VERIFYING) {
    return "正在检查上次任务状态...";
  }
  if (restoreBannerMode === RESTORE_BANNER_MODES.INTERRUPTED) {
    if (Boolean(taskSnapshot?.resume_available)) {
      return "上次生成已中断，可继续生成或重新开始。";
    }
    return "上次生成已中断，可重新开始或清空这次记录。";
  }
  if (restoreBannerMode === RESTORE_BANNER_MODES.STALE) {
    return String(statusText || "上次生成记录已失效，可重新开始或清空这次记录。");
  }
  return "";
}
