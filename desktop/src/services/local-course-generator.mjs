/**
 * Local Course Generator Service
 *
 * Full local course generation pipeline for the desktop client:
 * 1. Call backend /api/local-asr/generate-course endpoint
 * 2. Persist course + sentences into local SQLite via window.localDb
 * 3. Log sync record for cloud sync
 * 4. Report usage for billing
 * 5. Return result to caller with progress and translation status
 *
 * Translation graceful degradation: when offline or translation unavailable,
 * sentences will have null/empty chinese_text and the response includes
 * translation_pending: true. The UI should show "翻译待补全" status.
 */

export const LOCAL_COURSE_GENERATOR_STAGES = {
  IDLE: "idle",
  GENERATING: "generating",
  SAVING: "saving",
  COMPLETED: "completed",
  FAILED: "failed",
};

export const LOCAL_COURSE_GENERATION_PHASES = {
  TRANSCRIBE: "transcribe",
  TRANSLATE: "translate",
  ASSEMBLE: "assemble",
};

function nowIso() {
  return new Date().toISOString();
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function normalizeAmount(value, fallback = 0) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : fallback;
}

function parseErrorText(payload, fallback) {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const message = String(
    payload?.message || payload?.detail || payload?.error_message || "",
  ).trim();
  const errorCode = String(payload?.error_code || "").trim();
  if (message && errorCode) {
    return `${errorCode}: ${message}`;
  }
  return message || fallback;
}

function hasLocalDbBridge() {
  return (
    typeof window !== "undefined" &&
    typeof window.localDb?.saveCourse === "function" &&
    typeof window.localDb?.saveSentences === "function" &&
    typeof window.localDb?.saveProgress === "function"
  );
}

function hasLocalAsrBridge() {
  return (
    typeof window !== "undefined" &&
    typeof window.localAsr?.generateCourse === "function"
  );
}

function hasDesktopRuntimeBridge() {
  return (
    typeof window !== "undefined" &&
    typeof window.desktopRuntime?.requestLocalHelper === "function"
  );
}

async function requestLocalHelper(pathname, responseType = "json", options = {}) {
  if (!hasDesktopRuntimeBridge()) {
    throw new Error("Desktop runtime bridge is unavailable");
  }
  const response = await window.desktopRuntime.requestLocalHelper({
    path: String(pathname || ""),
    method: String(options.method || "GET").toUpperCase(),
    responseType,
    body: options.body,
  });
  if (!response?.ok) {
    const detail =
      String(response?.data?.message || "").trim() ||
      String(response?.data?.error_message || "").trim() ||
      String(response?.data?.detail || "").trim() ||
      String(response?.status || "").trim();
    throw new Error(detail || "Local helper request failed");
  }
  return response;
}

function buildCourseRecordFromResponse(response = {}) {
  const course = response?.course || {};
  const courseId = String(response?.course_id || course?.id || "").trim();
  const now = nowIso();
  const sourceFilename = String(course?.source_filename || "").trim();
  return {
    id: courseId,
    title:
      String(course?.title || "").trim() ||
      (sourceFilename ? sourceFilename.replace(/\.[^.]+$/, "") : `本地课程_${courseId.slice(0, 8)}`),
    source_filename: sourceFilename,
    duration_ms: normalizeAmount(course?.duration_ms, 0),
    runtime_kind: String(course?.runtime_kind || "desktop_local").trim(),
    asr_model: String(course?.asr_model || "faster-whisper-medium").trim(),
    created_at: String(course?.created_at || now).trim(),
    updated_at: now,
    synced_at: null,
    version: normalizeAmount(course?.version, 1),
    is_local_only: true,
    metadata: {
      ...(course?.metadata && typeof course.metadata === "object" ? course.metadata : {}),
      lesson_status: String(response?.lesson_status || "ready").trim(),
      translation_pending: Boolean(response?.translation_pending),
      original_course_id: courseId,
      generated_at: String(response?.generated_at || now).trim(),
    },
  };
}

function buildSentenceRecordsFromResponse(courseId, response = {}) {
  const sentences = Array.isArray(response?.sentences) ? response.sentences : [];
  const now = nowIso();
  return sentences.map((sentence, index) => ({
    id: String(sentence?.id || `${courseId}:${index}`).trim(),
    course_id: courseId,
    sentence_index: normalizeAmount(sentence?.sentence_index ?? index, index),
    english_text: String(sentence?.english_text || sentence?.text_en || sentence?.text || "").trim(),
    chinese_text: String(sentence?.chinese_text || sentence?.text_zh || "").trim(),
    start_ms: normalizeAmount(sentence?.start_ms ?? sentence?.begin_ms ?? 0, 0),
    end_ms: normalizeAmount(sentence?.end_ms ?? sentence?.end_ms ?? 0, 0),
    words: Array.isArray(sentence?.words)
      ? sentence.words
      : Array.isArray(sentence?.tokens)
        ? sentence.tokens
        : [],
    variant_key: String(sentence?.variant_key || "").trim(),
    created_at: String(sentence?.created_at || now).trim(),
    updated_at: now,
  }));
}

function buildProgressRecord(courseId, options = {}) {
  const now = nowIso();
  return {
    id: `${courseId}:local-desktop-user`,
    course_id: courseId,
    user_id: String(options.userId || "local-desktop-user").trim(),
    current_index: 0,
    completed_indices: [],
    started_at: now,
    updated_at: now,
    synced_at: null,
    version: 1,
  };
}

function buildProgressCallback(onProgress) {
  if (typeof onProgress !== "function") {
    return null;
  }
  return (event) => {
    try {
      onProgress(event);
    } catch (_) {
      // Ignore callback errors
    }
  };
}

export class LocalCourseGenerator {
  constructor(options = {}) {
    this._options = {
      fetchImpl: typeof options.fetchImpl === "function" ? options.fetchImpl : globalThis.fetch,
      localDb: options.localDb || (typeof window !== "undefined" ? window.localDb : null),
      accessToken: String(options.accessToken || "").trim(),
      onProgress: typeof options.onProgress === "function" ? options.onProgress : null,
      signal: options.signal || null,
      ...options,
    };
    this._aborted = false;
    this._stage = LOCAL_COURSE_GENERATOR_STAGES.IDLE;
  }

  get stage() {
    return this._stage;
  }

  get aborted() {
    return this._aborted;
  }

  abort() {
    this._aborted = true;
    if (this._options.signal) {
      try {
        this._options.signal.abort();
      } catch (_) {
        // Ignore
      }
    }
  }

  _emitProgress(phase, status, percent, message, extra = {}) {
    const event = {
      phase: String(phase || "").trim(),
      status: String(status || "").trim(),
      percent: clampPercent(percent),
      message: String(message || "").trim(),
      timestamp: nowIso(),
      ...extra,
    };
    if (typeof this._options.onProgress === "function") {
      try {
        this._options.onProgress(event);
      } catch (_) {
        // Ignore
      }
    }
    return event;
  }

  async generateCourse({ filePath, sourceFilename = "", modelKey = "faster-whisper-medium", runtimeKind = "desktop_local" } = {}) {
    const safeFilePath = String(filePath || "").trim();
    if (!safeFilePath) {
      throw new Error("filePath is required");
    }

    if (!hasLocalAsrBridge() && !hasDesktopRuntimeBridge()) {
      throw new Error("Local ASR bridge is unavailable. Ensure the desktop helper is running.");
    }

    this._stage = LOCAL_COURSE_GENERATOR_STAGES.GENERATING;
    this._emitProgress(
      LOCAL_COURSE_GENERATION_PHASES.TRANSCRIBE,
      "running",
      0,
      "正在转写音频",
    );

    let response;
    try {
      if (this._aborted) {
        throw new Error("Generation was aborted");
      }

      if (hasLocalAsrBridge()) {
        const localResult = await window.localAsr.generateCourse({
          filePath: safeFilePath,
          sourceFilename: String(sourceFilename || "").trim(),
          modelKey: String(modelKey || "faster-whisper-medium").trim(),
          runtimeKind: String(runtimeKind || "desktop_local").trim(),
        });
        response = localResult?.data || localResult;
      } else {
        response = await requestLocalHelper("/api/local-asr/generate-course", "json", {
          method: "POST",
          body: {
            filePath: safeFilePath,
            sourceFilename: String(sourceFilename || "").trim(),
            modelKey: String(modelKey || "faster-whisper-medium").trim(),
            runtimeKind: String(runtimeKind || "desktop_local").trim(),
          },
        });
        response = response?.data || response;
      }

      if (this._aborted) {
        throw new Error("Generation was aborted");
      }

      if (!response?.ok) {
        throw new Error(
          parseErrorText(response, "课程生成失败"),
        );
      }

      this._emitProgress(
        LOCAL_COURSE_GENERATION_PHASES.TRANSCRIBE,
        "completed",
        50,
        "转写完成，正在保存课程",
      );
    } catch (error) {
      this._stage = LOCAL_COURSE_GENERATOR_STAGES.FAILED;
      if (error?.name === "AbortError" || this._aborted) {
        this._emitProgress(LOCAL_COURSE_GENERATION_PHASES.TRANSCRIBE, "aborted", 0, "生成已取消");
        throw new Error("生成已取消");
      }
      this._emitProgress(
        LOCAL_COURSE_GENERATION_PHASES.TRANSCRIBE,
        "failed",
        0,
        error instanceof Error && error.message ? error.message : String(error),
      );
      throw error;
    }

    const courseId = String(response?.course_id || "").trim();
    if (!courseId) {
      this._stage = LOCAL_COURSE_GENERATOR_STAGES.FAILED;
      throw new Error("Course ID is missing from response");
    }

    const translationPending = Boolean(response?.translation_pending);
    const sentenceCount = Array.isArray(response?.sentences) ? response.sentences.length : 0;

    this._stage = LOCAL_COURSE_GENERATOR_STAGES.SAVING;
    this._emitProgress(
      LOCAL_COURSE_GENERATION_PHASES.ASSEMBLE,
      "running",
      60,
      translationPending ? "翻译待补全，正在保存课程" : "正在保存课程",
    );

    try {
      if (this._aborted) {
        throw new Error("Generation was aborted");
      }

      const courseRecord = buildCourseRecordFromResponse(response);
      const sentenceRecords = buildSentenceRecordsFromResponse(courseId, response);
      const progressRecord = buildProgressRecord(courseId, { userId: "local-desktop-user" });

      if (hasLocalDbBridge()) {
        const localDb = this._options.localDb || window.localDb;
        await localDb.saveCourse(courseRecord, { syncBehavior: "local" });
        await localDb.saveSentences(courseId, sentenceRecords);
        await localDb.saveProgress(courseId, progressRecord, { syncBehavior: "local" });

        this._emitProgress(
          LOCAL_COURSE_GENERATION_PHASES.ASSEMBLE,
          "completed",
          85,
          translationPending ? "课程已保存（翻译待补全）" : "课程已保存",
        );
      } else {
        this._emitProgress(
          LOCAL_COURSE_GENERATION_PHASES.ASSEMBLE,
          "warning",
          85,
          "本地数据库不可用，课程未持久化",
        );
      }

      this._stage = LOCAL_COURSE_GENERATOR_STAGES.COMPLETED;
      this._emitProgress(
        LOCAL_COURSE_GENERATION_PHASES.ASSEMBLE,
        "completed",
        100,
        translationPending ? "课程生成完成（翻译待补全）" : "课程生成完成",
        {
          courseId,
          sentenceCount,
          translationPending,
          usageSeconds: normalizeAmount(response?.usage_seconds, 0),
          lessonStatus: String(response?.lesson_status || "ready").trim(),
        },
      );

      return {
        ok: true,
        courseId,
        course: courseRecord,
        sentences: sentenceRecords,
        sentenceCount,
        translationPending,
        usageSeconds: normalizeAmount(response?.usage_seconds, 0),
        lessonStatus: String(response?.lesson_status || "ready").trim(),
        previewText: String(response?.preview_text || "").trim(),
        generatedAt: String(response?.generated_at || nowIso()).trim(),
        localGenerationResult: response?.local_generation_result || null,
        translationDebug: response?.translation_debug || null,
      };
    } catch (error) {
      this._stage = LOCAL_COURSE_GENERATOR_STAGES.FAILED;
      if (error?.name === "AbortError" || this._aborted) {
        this._emitProgress(LOCAL_COURSE_GENERATION_PHASES.ASSEMBLE, "aborted", 0, "保存已取消");
        throw new Error("保存已取消");
      }
      this._emitProgress(
        LOCAL_COURSE_GENERATION_PHASES.ASSEMBLE,
        "failed",
        85,
        error instanceof Error && error.message ? error.message : String(error),
      );
      throw error;
    }
  }
}

export function createLocalCourseGenerator(options = {}) {
  return new LocalCourseGenerator(options);
}

export async function generateLocalCourse(options = {}) {
  const generator = createLocalCourseGenerator(options);
  return generator.generateCourse(options);
}
