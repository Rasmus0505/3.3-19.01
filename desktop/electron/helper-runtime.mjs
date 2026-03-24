import fs from "node:fs";
import path from "node:path";

export const DESKTOP_INSTALL_STATE_FILE_NAME = "desktop-install-state.json";
export const PACKAGED_HELPER_DIR_NAME = "desktop-helper-runtime";
export const PACKAGED_HELPER_APP_DIR_NAME = "BottleLocalHelper";
export const PACKAGED_HELPER_EXECUTABLE_NAME = process.platform === "win32" ? "BottleLocalHelper.exe" : "BottleLocalHelper";
export const PACKAGED_PREINSTALLED_MODEL_ROOT_NAME = "preinstalled-models";
export const PACKAGED_RUNTIME_TOOLS_DIR_NAME = "runtime-tools";
export const PACKAGED_FFMPEG_DIR_NAME = "ffmpeg";
export const PACKAGED_YTDLP_DIR_NAME = "yt-dlp";
export const BOTTLE_1_MODEL_DIR_NAME = "faster-distil-small.en";

function resolveAbsolutePath(inputPath) {
  return path.resolve(String(inputPath || ""));
}

function readJsonObject(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const rawText = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(rawText);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_) {
    return null;
  }
}

function directoryHasFiles(directoryPath) {
  if (!fs.existsSync(directoryPath)) {
    return false;
  }
  try {
    return fs.statSync(directoryPath).isDirectory() && fs.readdirSync(directoryPath).length > 0;
  } catch (_) {
    return false;
  }
}

function inferBottleInstallChoice(recordedChoice, modelAvailable) {
  if (recordedChoice === true) {
    return modelAvailable ? "preinstalled" : "missing";
  }
  if (recordedChoice === false) {
    return "opted_out";
  }
  return modelAvailable ? "detected" : "unrecorded";
}

function shouldUseBundledModel(recordedChoice, modelAvailable) {
  if (!modelAvailable) {
    return false;
  }
  if (recordedChoice === false) {
    return false;
  }
  return true;
}

export function resolvePackagedDesktopRuntime(resourcesPath) {
  const normalizedResourcesPath = resolveAbsolutePath(resourcesPath);
  const installStatePath = path.join(normalizedResourcesPath, DESKTOP_INSTALL_STATE_FILE_NAME);
  const rawInstallState = readJsonObject(installStatePath) || {};
  const recordedBottleChoice = typeof rawInstallState.bottle1Preinstalled === "boolean" ? rawInstallState.bottle1Preinstalled : null;
  const bottle1ModelDir = path.join(normalizedResourcesPath, PACKAGED_PREINSTALLED_MODEL_ROOT_NAME, BOTTLE_1_MODEL_DIR_NAME);
  const bottle1ModelAvailable = directoryHasFiles(bottle1ModelDir);
  const helperRootDir = path.join(normalizedResourcesPath, PACKAGED_HELPER_DIR_NAME);
  const helperAppDir = path.join(helperRootDir, PACKAGED_HELPER_APP_DIR_NAME);
  const helperExecutablePath = path.join(helperAppDir, PACKAGED_HELPER_EXECUTABLE_NAME);
  const runtimeToolsDir = path.join(normalizedResourcesPath, PACKAGED_RUNTIME_TOOLS_DIR_NAME);
  const ffmpegBinDir = path.join(runtimeToolsDir, PACKAGED_FFMPEG_DIR_NAME);
  const ffmpegExecutablePath = path.join(ffmpegBinDir, process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
  const ffprobeExecutablePath = path.join(ffmpegBinDir, process.platform === "win32" ? "ffprobe.exe" : "ffprobe");
  const ytdlpDir = path.join(runtimeToolsDir, PACKAGED_YTDLP_DIR_NAME);
  const ytdlpExecutablePath = path.join(ytdlpDir, process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");

  return {
    resourcesPath: normalizedResourcesPath,
    installStatePath,
    installStateExists: fs.existsSync(installStatePath),
    installState: rawInstallState,
    helperRootDir,
    helperAppDir,
    helperExecutablePath,
    helperExists: fs.existsSync(helperExecutablePath),
    runtimeToolsDir,
    ffmpegBinDir,
    ffmpegExecutablePath,
    ffprobeExecutablePath,
    ffmpegExists: fs.existsSync(ffmpegExecutablePath),
    ffprobeExists: fs.existsSync(ffprobeExecutablePath),
    ytdlpDir,
    ytdlpExecutablePath,
    ytdlpExists: fs.existsSync(ytdlpExecutablePath),
    bottle1ModelDir,
    bottle1ModelAvailable,
    bottle1Preinstalled: bottle1ModelAvailable,
    bottle1PreinstallRequested: recordedBottleChoice,
    bottle1InstallChoice: inferBottleInstallChoice(recordedBottleChoice, bottle1ModelAvailable),
    bottle1UseAsRuntime: shouldUseBundledModel(recordedBottleChoice, bottle1ModelAvailable),
  };
}

export function selectDesktopModelDir(resourcesPath, fallbackModelDir) {
  const packagedRuntime = resolvePackagedDesktopRuntime(resourcesPath);
  const resolvedFallbackModelDir = resolveAbsolutePath(fallbackModelDir);
  if (directoryHasFiles(resolvedFallbackModelDir)) {
    return resolvedFallbackModelDir;
  }
  if (packagedRuntime.bottle1UseAsRuntime) {
    return packagedRuntime.bottle1ModelDir;
  }
  return resolvedFallbackModelDir;
}
