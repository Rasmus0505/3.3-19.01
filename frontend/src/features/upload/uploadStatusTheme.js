const RUNNING_PHASES = new Set(["probing", "uploading", "processing", "local_transcribing", "desktop_local_transcribing"]);
const ACTIONABLE_PHASES = new Set(["ready"]);
const RECOVERABLE_PHASES = new Set(["upload_paused"]);
const ACTIVE_TASK_STATUSES = new Set(["pending", "running", "pausing", "terminating"]);
const RECOVERABLE_TASK_STATUSES = new Set(["paused", "terminated"]);
const RECOVERABLE_RESTORE_MODES = new Set(["interrupted", "stale"]);
const TONE_ALIAS_MAP = Object.freeze({
  idle: "neutral",
  neutral: "neutral",
  selected: "brand",
  brand: "brand",
  running: "running",
  recoverable: "recoverable",
  success: "success",
  error: "error",
});

const UPLOAD_TONE_CLASSES = Object.freeze({
  neutral: {
    subtleSurface: "border-border bg-muted/15 text-foreground",
    badgeSubtle: "border-border bg-background text-foreground",
    badgeSolid: "border-border bg-foreground text-background",
    progressBar: "bg-muted-foreground/30",
    floatingCard: "border-border bg-background/95 hover:border-upload-brand/20",
    emphasisText: "text-foreground",
    supportingText: "text-muted-foreground",
    actionButton: "bg-foreground text-background hover:bg-foreground/90",
    outlineButton: "border-border text-foreground hover:bg-muted/70 hover:text-foreground",
  },
  brand: {
    subtleSurface: "border-upload-brand/30 bg-upload-brand/10 text-upload-brand-ink",
    badgeSubtle: "border-upload-brand/30 bg-upload-brand/10 text-upload-brand-ink",
    badgeSolid: "border-upload-brand bg-upload-brand text-upload-brand-foreground",
    progressBar: "bg-upload-brand",
    floatingCard: "border-upload-brand/30 bg-background/95 hover:border-upload-brand/45",
    emphasisText: "text-upload-brand-ink",
    supportingText: "text-upload-brand-ink/80",
    actionButton: "bg-upload-brand text-upload-brand-foreground hover:bg-upload-brand/90",
    outlineButton: "border-upload-brand/30 text-upload-brand-ink hover:bg-upload-brand/10 hover:text-upload-brand-ink",
  },
  running: {
    subtleSurface: "border-upload-running/30 bg-upload-running/10 text-upload-running-ink",
    badgeSubtle: "border-upload-running/30 bg-upload-running/10 text-upload-running-ink",
    badgeSolid: "border-upload-running bg-upload-running text-upload-running-foreground",
    progressBar: "bg-upload-running",
    floatingCard: "border-upload-running/30 bg-background/95 hover:border-upload-running/45",
    emphasisText: "text-upload-running-ink",
    supportingText: "text-upload-running-ink/80",
    actionButton: "bg-upload-running text-upload-running-foreground hover:bg-upload-running/90",
    outlineButton: "border-upload-running/30 text-upload-running-ink hover:bg-upload-running/10 hover:text-upload-running-ink",
  },
  recoverable: {
    subtleSurface: "border-upload-recoverable/35 bg-upload-recoverable/12 text-upload-recoverable-ink",
    badgeSubtle: "border-upload-recoverable/35 bg-upload-recoverable/12 text-upload-recoverable-ink",
    badgeSolid: "border-upload-recoverable bg-upload-recoverable text-upload-recoverable-foreground",
    progressBar: "bg-upload-recoverable",
    floatingCard: "border-upload-recoverable/35 bg-background/95 hover:border-upload-recoverable/50",
    emphasisText: "text-upload-recoverable-ink",
    supportingText: "text-upload-recoverable-ink/85",
    actionButton: "bg-upload-recoverable text-upload-recoverable-foreground hover:bg-upload-recoverable/90",
    outlineButton: "border-upload-recoverable/35 text-upload-recoverable-ink hover:bg-upload-recoverable/10 hover:text-upload-recoverable-ink",
  },
  success: {
    subtleSurface: "border-upload-success/30 bg-upload-success/10 text-upload-success-ink",
    badgeSubtle: "border-upload-success/30 bg-upload-success/10 text-upload-success-ink",
    badgeSolid: "border-upload-success bg-upload-success text-upload-success-foreground",
    progressBar: "bg-upload-success",
    floatingCard: "border-upload-success/30 bg-background/95 hover:border-upload-success/45",
    emphasisText: "text-upload-success-ink",
    supportingText: "text-upload-success-ink/80",
    actionButton: "bg-upload-success text-upload-success-foreground hover:bg-upload-success/90",
    outlineButton: "border-upload-success/30 text-upload-success-ink hover:bg-upload-success/10 hover:text-upload-success-ink",
  },
  error: {
    subtleSurface: "border-upload-danger/30 bg-upload-danger/10 text-upload-danger-ink",
    badgeSubtle: "border-upload-danger/30 bg-upload-danger/10 text-upload-danger-ink",
    badgeSolid: "border-upload-danger bg-upload-danger text-upload-danger-foreground",
    progressBar: "bg-upload-danger",
    floatingCard: "border-upload-danger/30 bg-background/95 hover:border-upload-danger/45",
    emphasisText: "text-upload-danger-ink",
    supportingText: "text-upload-danger-ink/85",
    actionButton: "bg-upload-danger text-upload-danger-foreground hover:bg-upload-danger/90",
    outlineButton: "border-upload-danger/30 text-upload-danger-ink hover:bg-upload-danger/10 hover:text-upload-danger-ink",
  },
});

export function getUploadToneClasses(tone = "neutral") {
  return UPLOAD_TONE_CLASSES[TONE_ALIAS_MAP[tone] || "neutral"] || UPLOAD_TONE_CLASSES.neutral;
}

export function getUploadToneStyles(tone = "neutral") {
  const classes = getUploadToneClasses(tone);
  return {
    surface: classes.subtleSurface,
    text: classes.supportingText,
    emphasisText: classes.emphasisText,
    progress: classes.progressBar,
    badge: classes.badgeSubtle,
    badgeSolid: classes.badgeSolid,
    floatingCard: classes.floatingCard,
    button: classes.actionButton,
    buttonSubtle: classes.outlineButton,
  };
}

export function getUploadStageTone(status = "") {
  if (status === "completed") return "success";
  if (status === "running") return "running";
  if (status === "failed") return "error";
  return "idle";
}

export function getUploadModelTone({ ready = false, busy = false, error = false, selected = false } = {}) {
  if (error) return "error";
  if (busy) return "running";
  if (selected) return "selected";
  if (ready) return "success";
  return "idle";
}

export function getUploadRestoreTone(restoreBannerMode = "") {
  const normalizedRestoreMode = String(restoreBannerMode || "").trim().toLowerCase();
  if (normalizedRestoreMode === "verifying") return "running";
  if (RECOVERABLE_RESTORE_MODES.has(normalizedRestoreMode)) return "recoverable";
  return "idle";
}

export function getUploadTaskTone({ phase = "", resumeAvailable = false, taskStatus = "", restoreBannerMode = "" } = {}) {
  const normalizedPhase = String(phase || "").trim().toLowerCase();
  const normalizedTaskStatus = String(taskStatus || "").trim().toLowerCase();
  const normalizedRestoreMode = String(restoreBannerMode || "").trim().toLowerCase();

  if (normalizedRestoreMode === "verifying") return "running";
  if (RECOVERABLE_RESTORE_MODES.has(normalizedRestoreMode)) return "recoverable";
  if (normalizedPhase === "success") return "success";
  if (normalizedPhase === "error") {
    return resumeAvailable || RECOVERABLE_TASK_STATUSES.has(normalizedTaskStatus) ? "recoverable" : "error";
  }
  if (RECOVERABLE_PHASES.has(normalizedPhase) || RECOVERABLE_TASK_STATUSES.has(normalizedTaskStatus)) return "recoverable";
  if (RUNNING_PHASES.has(normalizedPhase) || ACTIVE_TASK_STATUSES.has(normalizedTaskStatus)) return "running";
  if (ACTIONABLE_PHASES.has(normalizedPhase)) return "selected";
  return "idle";
}
