import { ASR_MODEL_KEYS, buildAsrModelCatalogMap } from "../../shared/lib/asrModels";

export const QWEN_MODEL = "qwen3-asr-flash-filetrans";
export const STEPFUN_MODEL = "stepaudio-2.5-asr";
export const FASTER_WHISPER_MODEL = "faster-whisper-medium";
export const MT_PRICE_MODEL = "qwen-mt-flash";
export const ESTIMATED_MT_TOKENS_PER_MINUTE = 320;
export const UPLOAD_PROGRESS_PERSIST_INTERVAL_MS = 800;
export const AI_CATALOG_API_BASE = "/api/ai/catalog";
export const ASR_MODELS_API_BASE = "/api/asr-models";
export const DESKTOP_CLIENT_OFFLINE_MESSAGE = "离线模式下无法生成课程，请联网后重试";
export const DESKTOP_CLIENT_INSUFFICIENT_BALANCE_MESSAGE = "余额不足，充值后即可继续生成当前内容";
export const BOTTLE1_DESKTOP_ONLY_MESSAGE = "Bottle 1.0 仅支持在客户端使用，请下载桌面端继续";
export const LINK_IMPORT_DESKTOP_ONLY_MESSAGE = "链接导入仅支持在客户端使用，请下载桌面端继续";
export const LARGE_FILE_DESKTOP_RECOMMEND_MESSAGE = "当前素材推荐使用客户端生成，效果和稳定性更好";
export const DEFAULT_ASR_MODEL_CATALOG_MAP = buildAsrModelCatalogMap();
export const DEFAULT_FAST_UPLOAD_MODEL = QWEN_MODEL;
export const FAST_RUNTIME_TRACK_CLOUD = "cloud";
export const FAST_RUNTIME_TRACK_BROWSER_LOCAL = "browser_local";
export const FAST_RUNTIME_TRACK_DESKTOP_LOCAL = "desktop_local";
export const DESKTOP_LOCAL_TRANSCRIBING_PHASE = "desktop_local_transcribing";
export const DESKTOP_LINK_IMPORTING_PHASE = "desktop_link_importing";
export const DESKTOP_LOCAL_GENERATING_PHASE = "desktop_local_generating";
export const DESKTOP_UPLOAD_SOURCE_MODE_FILE = "file";
export const DESKTOP_UPLOAD_SOURCE_MODE_LINK = "link";
export const FILE_PICKER_ACTION_SELECT = "select";
export const FILE_PICKER_ACTION_DESKTOP_LOCAL_GENERATE = "desktop_local_generate";
export const LOCAL_BROWSER_ASR_ENABLED = import.meta.env.VITE_LOCAL_BROWSER_ASR_ENABLED === "true";
export const LOCAL_ASR_ASSET_BASE_URL = import.meta.env.VITE_LOCAL_ASR_ASSET_BASE_URL || "/static/assets/asr-assets";
export const LOCAL_BROWSER_RUNTIME_BASE_URL = String(import.meta.env.VITE_LOCAL_BROWSER_RUNTIME_BASE_URL || "").trim().replace(/\/+$/, "");
export const LOCAL_ASR_LONG_AUDIO_HINT_SECONDS = 300;
export const LOCAL_ASR_STORAGE_MODE_BROWSER = "browser";
export const LOCAL_ASR_TARGET_SAMPLE_RATE = 16000;
export const LOCAL_ASR_FILE_ACCEPT = ".mp3,.mp4,.m4a,.wav,.flac,.ogg,.aac,.webm,.mkv,.mov,.avi";
export const LOCAL_STAGE_PROGRESS_INTERVAL_MS = 500;
export const LOCAL_RECOGNITION_STOPPED_MESSAGE = "已停止生成，可重新开始。";
export const DESKTOP_CLIENT_ENTRY_URL = String(import.meta.env.VITE_DESKTOP_CLIENT_ENTRY_URL || import.meta.env.VITE_DESKTOP_CLIENT_DOWNLOAD_URL || "/download/desktop").trim();
export const DESKTOP_CLIENT_DISTRIBUTION_NOTE = String(import.meta.env.VITE_DESKTOP_CLIENT_DISTRIBUTION_NOTE || "").trim();
export const BOTTLE2_CLOUD_DESKTOP_RECOMMEND_SIZE_BYTES = 300 * 1024 * 1024;
export const BOTTLE2_CLOUD_DESKTOP_RECOMMEND_DURATION_SECONDS = 45 * 60;
export const SNAPANY_FALLBACK_URL = "https://snapany.com/zh";
export const DESKTOP_LINK_INVALID_MESSAGE = "未识别到可导入链接。";
export const DESKTOP_LINK_RESTRICTED_MESSAGE = "该链接可能需要登录或平台限制，建议改用 SnapAny";
export const DESKTOP_LINK_UNSUPPORTED_MESSAGE = "当前桌面工具暂不支持该链接，建议改用 SnapAny";
export const DESKTOP_LINK_PUBLIC_SUPPORT_MESSAGE = "支持常见公开视频链接：YouTube、B站、常见播客页面、公开视频直链";
export const DESKTOP_LINK_PUBLIC_ONLY_MESSAGE = "仅支持公开单条链接，不支持 cookies、账号登录、会员内容、受限内容导入";

export const LOCAL_MODEL_OPTIONS = [
  {
    key: ASR_MODEL_KEYS.fasterWhisper,
    workerModelId: ASR_MODEL_KEYS.fasterWhisper,
    title: "Bottle 1.0",
    subtitle: "先准备桌面端模型，再开始生成。",
    uploadEnabled: true,
    sizeEstimateMb: { wasm: 180 },
  },
];

export const UPLOAD_MODEL_OPTIONS = [
  {
    key: QWEN_MODEL,
    title: "Bottle 2.0",
    subtitle: "网页端默认路径。",
    mode: "fast",
    note: "无需准备模型，选中文件后可直接开始。",
  },
  {
    key: STEPFUN_MODEL,
    title: "StepAudio 2.5 ASR",
    subtitle: "英文素材默认识别路径。",
    mode: "fast",
    note: "使用 StepAudio 2.5 云端识别，默认英文与学习字幕格式。",
  },
];

export const DISPLAY_STAGES = [
  { key: "convert_audio", label: "抽音频" },
  { key: "asr_transcribe", label: "识别字幕" },
  { key: "forced_alignment", label: "时间戳对齐" },
  { key: "build_lesson", label: "生成课程结构" },
  { key: "translate_zh", label: "翻译" },
  { key: "vocabulary_annotation", label: "生词标注" },
  { key: "word_explanation", label: "生成讲解" },
  { key: "write_lesson", label: "保存完成" },
];

export const STAGE_PROGRESS_BOUNDS = {
  convert_audio: { start: 0, end: 15 },
  asr_transcribe: { start: 15, end: 45 },
  forced_alignment: { start: 45, end: 60 },
  build_lesson: { start: 60, end: 70 },
  translate_zh: { start: 70, end: 88 },
  vocabulary_annotation: { start: 88, end: 93 },
  word_explanation: { start: 93, end: 97 },
  write_lesson: { start: 97, end: 100 },
};

export const BOTTLE2_CLOUD_DISPLAY_STAGES = [
  { key: "upload", label: "上传素材" },
  { key: "submit_cloud_task", label: "提交云端任务" },
  { key: "transcribing", label: "转写中" },
  { key: "generating_lesson", label: "生成课程" },
  { key: "content_enrichment", label: "补充内容" },
  { key: "completed", label: "已完成" },
];

export const SERVER_PREPARABLE_MODELS = new Set([]);
export const ACTIVE_SERVER_TASK_STATUSES = new Set(["pending", "running", "pausing", "terminating"]);
export const STOPPABLE_SERVER_TASK_STATUSES = new Set(["pending", "running"]);
export const RECOVERABLE_SERVER_TASK_STATUSES = new Set([]);
export const RESTORE_BANNER_MODES = {
  NONE: "none",
  VERIFYING: "verifying",
  STALE: "stale",
  INTERRUPTED: "interrupted",
};
export const BOTTLE_LESSON_SCHEMA_VERSION = "1";
export const BOTTLE_LESSON_FILE_SUFFIX = ".bottle-lesson.json";
export const LOCAL_LESSON_UPDATE_EVENT = "bottle-local-lessons-updated";
export const POLL_RETRY_LIMIT = 3;
export const POLL_RETRY_DELAY_MS = 1500;



