const EDGE_PUNCT_REGEX = /^[\s\.,!?;:"'`~\-\(\)\[\]\{\}]+|[\s\.,!?;:"'`~\-\(\)\[\]\{\}]+$/g;

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".mkv", ".avi", ".webm"]);
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".flac", ".aac", ".ogg", ".opus"]);

export function normalizeToken(token) {
  return String(token || "")
    .trim()
    .toLowerCase()
    .replaceAll("’", "'")
    .replace(EDGE_PUNCT_REGEX, "");
}

export function getMediaExt(filename) {
  const lower = String(filename || "").toLowerCase();
  const idx = lower.lastIndexOf(".");
  if (idx < 0) {
    return "";
  }
  return lower.slice(idx);
}

export function isVideoFilename(filename) {
  return VIDEO_EXTENSIONS.has(getMediaExt(filename));
}

export function isAudioFilename(filename) {
  return AUDIO_EXTENSIONS.has(getMediaExt(filename));
}
