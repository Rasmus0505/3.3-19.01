import fs from "node:fs";
import path from "node:path";


const HELPER_RUNTIME_DIR = "desktop-helper-runtime";
const HELPER_APP_DIR = "BottleLocalHelper";
const HELPER_EXE_NAME = "BottleLocalHelper.exe";
const RUNTIME_TOOLS_DIR = "runtime-tools";
const PREINSTALLED_MODELS_DIR = "preinstalled-models";
const INSTALL_STATE_FILE = "desktop-install-state.json";


function readJsonFile(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      return {};
    }
    const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return payload && typeof payload === "object" ? payload : {};
  } catch {
    return {};
  }
}

function existingFile(filePath) {
  return Boolean(filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile());
}

function existingDir(dirPath) {
  return Boolean(dirPath && fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory());
}

function bundledModelDir(resourcesDir) {
  return path.resolve(resourcesDir, PREINSTALLED_MODELS_DIR, "faster-distil-small.en");
}

export function resolvePackagedDesktopRuntime(resourcesDir) {
  const resolvedResourcesDir = path.resolve(String(resourcesDir || ""));
  const statePath = path.join(resolvedResourcesDir, INSTALL_STATE_FILE);
  const installState = readJsonFile(statePath);
  const helperDir = path.join(resolvedResourcesDir, HELPER_RUNTIME_DIR, HELPER_APP_DIR);
  const helperExePath = path.join(helperDir, HELPER_EXE_NAME);
  const ffmpegDir = path.join(resolvedResourcesDir, RUNTIME_TOOLS_DIR, "ffmpeg");
  const ytdlpDir = path.join(resolvedResourcesDir, RUNTIME_TOOLS_DIR, "yt-dlp");
  const bundledDir = bundledModelDir(resolvedResourcesDir);
  const bottle1InstallChoice = String(installState?.bottle1InstallChoice || "").trim();
  const bottle1UseAsRuntime = bottle1InstallChoice === "preinstalled" && existingDir(bundledDir);

  return {
    resourcesDir: resolvedResourcesDir,
    helperDir,
    helperExePath,
    helperExists: existingFile(helperExePath),
    ffmpegDir,
    ffmpegExists: existingFile(path.join(ffmpegDir, "ffmpeg.exe")),
    ffprobeExists: existingFile(path.join(ffmpegDir, "ffprobe.exe")),
    ytdlpPath: path.join(ytdlpDir, "yt-dlp.exe"),
    ytdlpExists: existingFile(path.join(ytdlpDir, "yt-dlp.exe")),
    bundledModelDir: bundledDir,
    bundledModelExists: existingDir(bundledDir),
    installStatePath: statePath,
    bottle1Preinstalled: Boolean(installState?.bottle1Preinstalled),
    bottle1InstallChoice,
    bottle1UseAsRuntime,
  };
}


export function selectDesktopModelDir(resourcesDir, fallbackModelDir) {
  const resolvedFallbackModelDir = path.resolve(String(fallbackModelDir || ""));
  if (existingDir(resolvedFallbackModelDir)) {
    return resolvedFallbackModelDir;
  }
  const runtime = resolvePackagedDesktopRuntime(resourcesDir);
  if (runtime.bottle1UseAsRuntime && existingDir(runtime.bundledModelDir)) {
    return path.resolve(runtime.bundledModelDir);
  }
  return resolvedFallbackModelDir;
}
