import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const MODEL_VERSION_FILE_NAME = ".model-version.json";
const BACKUP_DIR_NAME = ".backup";
const BACKUP_SNAPSHOT_DIR_NAME = "current";
const STAGING_DIR_NAME = ".update-tmp";

function createAbortError(message = "Model update was cancelled.") {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function normalizeModelKey(modelKey) {
  return String(modelKey || "").trim() || "faster-whisper-medium";
}

function normalizeDirectoryPath(targetPath) {
  return path.resolve(String(targetPath || ""));
}

function sameDirectory(leftPath, rightPath) {
  return normalizeDirectoryPath(leftPath) === normalizeDirectoryPath(rightPath);
}

function normalizeApiBaseUrl(apiBaseUrl) {
  const baseUrl = String(apiBaseUrl || "").trim();
  if (!baseUrl) {
    throw new Error("Cloud API base URL is empty.");
  }
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

function versionFilePath(targetModelDir) {
  return path.join(targetModelDir, MODEL_VERSION_FILE_NAME);
}

function backupRootPath(targetModelDir) {
  return path.join(targetModelDir, BACKUP_DIR_NAME);
}

function backupSnapshotPath(targetModelDir) {
  return path.join(backupRootPath(targetModelDir), BACKUP_SNAPSHOT_DIR_NAME);
}

function stagingRootPath(targetModelDir) {
  return path.join(targetModelDir, STAGING_DIR_NAME);
}

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureParentDir(targetPath) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  const handle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (!bytesRead) {
        break;
      }
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    await handle.close();
  }
  return hash.digest("hex");
}

async function writeJsonFile(targetPath, payload) {
  await ensureParentDir(targetPath);
  await fs.writeFile(targetPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function readJsonFile(targetPath) {
  try {
    const raw = await fs.readFile(targetPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function listManagedFileEntries(rootDir) {
  const entries = [];
  if (!(await exists(rootDir))) {
    return entries;
  }
  const rootResolved = path.resolve(rootDir);
  async function walk(currentDir) {
    const children = await fs.readdir(currentDir, { withFileTypes: true });
    for (const child of children) {
      if (child.name === BACKUP_DIR_NAME || child.name === STAGING_DIR_NAME) {
        continue;
      }
      const fullPath = path.join(currentDir, child.name);
      if (child.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (child.name === MODEL_VERSION_FILE_NAME) {
        continue;
      }
      const relativeName = path.relative(rootResolved, fullPath).split(path.sep).join("/");
      const stat = await fs.stat(fullPath);
      entries.push({
        name: relativeName,
        size_bytes: stat.size,
        sha256: await sha256File(fullPath),
      });
    }
  }
  await walk(rootResolved);
  entries.sort((left, right) => left.name.localeCompare(right.name));
  return entries;
}

function mergeStoredManifestVersion(storedManifest, scannedManifest) {
  const normalizedStoredVersion = String(storedManifest?.model_version || "").trim();
  if (!normalizedStoredVersion) {
    return scannedManifest;
  }
  return {
    ...scannedManifest,
    model_version: normalizedStoredVersion,
  };
}

function normalizeManifest(rawManifest = {}) {
  const files = Array.isArray(rawManifest?.files)
    ? rawManifest.files
        .map((file) => ({
          name: String(file?.name || "").trim(),
          size_bytes: Math.max(0, Number(file?.size_bytes || 0)),
          sha256: String(file?.sha256 || "").trim().toLowerCase(),
        }))
        .filter((file) => file.name)
    : [];
  return {
    model_key: normalizeModelKey(rawManifest?.model_key),
    model_version: String(rawManifest?.model_version || "").trim() || "unversioned",
    file_count: files.length,
    total_size_bytes: files.reduce((sum, file) => sum + Number(file.size_bytes || 0), 0),
    files,
  };
}

export async function readLocalManifest(targetModelDir, modelKey = "faster-whisper-medium") {
  const stored = await readJsonFile(versionFilePath(targetModelDir));
  const scannedManifest = normalizeManifest({
    model_key: modelKey,
    model_version: "unversioned",
    files: await listManagedFileEntries(targetModelDir),
  });
  if (stored && typeof stored === "object") {
    return mergeStoredManifestVersion(stored, scannedManifest);
  }
  return scannedManifest;
}

export async function fetchRemoteManifest(apiBaseUrl, modelKey) {
  const normalizedBaseUrl = normalizeApiBaseUrl(apiBaseUrl);
  const response = await fetch(new URL(`/api/local-asr-assets/download-models/${encodeURIComponent(normalizeModelKey(modelKey))}/manifest`, normalizedBaseUrl), {
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = String(payload?.detail || payload?.message || response.statusText || "").trim();
    throw new Error(detail || `Model manifest request failed with ${response.status}`);
  }
  return normalizeManifest(payload);
}

export function computeModelUpdateDelta(localManifest, remoteManifest) {
  const localFiles = new Map((Array.isArray(localManifest?.files) ? localManifest.files : []).map((file) => [file.name, file]));
  const missing = [];
  const changed = [];
  for (const remoteFile of Array.isArray(remoteManifest?.files) ? remoteManifest.files : []) {
    const localFile = localFiles.get(remoteFile.name);
    if (!localFile) {
      missing.push(remoteFile);
      continue;
    }
    const sizeChanged = Number(localFile.size_bytes || 0) !== Number(remoteFile.size_bytes || 0);
    const hashChanged = String(localFile.sha256 || "").toLowerCase() !== String(remoteFile.sha256 || "").toLowerCase();
    if (sizeChanged || hashChanged) {
      changed.push(remoteFile);
    }
  }
  return { missing, changed };
}

async function clearDirectoryContents(targetDir) {
  if (!(await exists(targetDir))) {
    return;
  }
  const children = await fs.readdir(targetDir, { withFileTypes: true });
  for (const child of children) {
    const fullPath = path.join(targetDir, child.name);
    if (child.name === BACKUP_DIR_NAME || child.name === STAGING_DIR_NAME) {
      continue;
    }
    await fs.rm(fullPath, { recursive: true, force: true });
  }
}

async function copyRelativeFiles(sourceDir, targetDir, options = {}) {
  const { includeVersionFile = true } = options;
  if (!(await exists(sourceDir))) {
    return;
  }
  const children = await fs.readdir(sourceDir, { withFileTypes: true });
  for (const child of children) {
    if (child.name === BACKUP_DIR_NAME || child.name === STAGING_DIR_NAME) {
      continue;
    }
    if (!includeVersionFile && child.name === MODEL_VERSION_FILE_NAME) {
      continue;
    }
    const sourcePath = path.join(sourceDir, child.name);
    const targetPath = path.join(targetDir, child.name);
    if (child.isDirectory()) {
      await fs.mkdir(targetPath, { recursive: true });
      await copyRelativeFiles(sourcePath, targetPath, options);
      continue;
    }
    await ensureParentDir(targetPath);
    await fs.copyFile(sourcePath, targetPath);
  }
}

export async function backupCurrentModel(targetModelDir) {
  const backupRoot = backupRootPath(targetModelDir);
  const snapshotDir = backupSnapshotPath(targetModelDir);
  await fs.rm(backupRoot, { recursive: true, force: true });
  await fs.mkdir(snapshotDir, { recursive: true });
  const managedFiles = await listManagedFileEntries(targetModelDir);
  for (const file of managedFiles) {
    const sourcePath = path.join(targetModelDir, file.name);
    const targetPath = path.join(snapshotDir, file.name);
    await ensureParentDir(targetPath);
    await fs.copyFile(sourcePath, targetPath);
  }
  const versionPayload = await readJsonFile(versionFilePath(targetModelDir));
  if (versionPayload) {
    await writeJsonFile(path.join(snapshotDir, MODEL_VERSION_FILE_NAME), versionPayload);
  }
  return {
    created: managedFiles.length > 0 || Boolean(versionPayload),
    backup_dir: snapshotDir,
    file_count: managedFiles.length,
  };
}

export async function rollbackFromBackup(targetModelDir) {
  const snapshotDir = backupSnapshotPath(targetModelDir);
  if (!(await exists(snapshotDir))) {
    throw new Error("Model backup is unavailable.");
  }
  await clearDirectoryContents(targetModelDir);
  await copyRelativeFiles(snapshotDir, targetModelDir);
  return { restored: true, backup_dir: snapshotDir };
}

function encodeFilePath(fileName) {
  return String(fileName || "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

export async function downloadModelFile({ apiBaseUrl, modelKey, file, stagingDir, signal }) {
  throwIfAborted(signal);
  const response = await fetch(
    new URL(`/api/local-asr-assets/download-models/${encodeURIComponent(normalizeModelKey(modelKey))}/files/${encodeFilePath(file.name)}`, normalizeApiBaseUrl(apiBaseUrl)),
    { cache: "no-store", signal },
  );
  if (!response.ok) {
    throw new Error(`Failed to download model file: ${file.name}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const downloadedHash = createHash("sha256").update(bytes).digest("hex");
  if (downloadedHash !== String(file.sha256 || "").toLowerCase()) {
    throw new Error(`SHA256 mismatch for ${file.name}`);
  }
  const targetPath = path.join(stagingDir, file.name);
  await ensureParentDir(targetPath);
  await fs.writeFile(targetPath, bytes);
  return targetPath;
}

function versionChanged(localManifest, remoteManifest) {
  return String(localManifest?.model_version || "").trim() !== String(remoteManifest?.model_version || "").trim();
}

async function copyBaseModelIntoStaging(baseModelDir, stagingDir) {
  if (!(await exists(baseModelDir))) {
    return;
  }
  await copyRelativeFiles(baseModelDir, stagingDir, { includeVersionFile: false });
}

async function applyStagingDirectoryToTarget(stagingDir, targetModelDir) {
  await clearDirectoryContents(targetModelDir);
  await copyRelativeFiles(stagingDir, targetModelDir, { includeVersionFile: true });
}

function withRollbackErrorMessage(error, rollbackError) {
  const primaryMessage = error instanceof Error ? error.message : String(error);
  const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
  return new Error(`${primaryMessage} Rollback failed: ${rollbackMessage}`);
}

export async function performIncrementalModelUpdate({
  apiBaseUrl,
  modelKey = "faster-whisper-medium",
  remoteManifest,
  baseModelDir,
  targetModelDir,
  signal,
  onProgress,
} = {}) {
  const normalizedModelKey = normalizeModelKey(modelKey);
  const normalizedRemoteManifest = normalizeManifest(remoteManifest);
  const resolvedTargetModelDir = normalizeDirectoryPath(targetModelDir);
  const resolvedBaseModelDir = normalizeDirectoryPath(baseModelDir || resolvedTargetModelDir);
  const targetMatchesBase = sameDirectory(resolvedTargetModelDir, resolvedBaseModelDir);
  const localManifest = await readLocalManifest(resolvedBaseModelDir, normalizedModelKey);
  const delta = computeModelUpdateDelta(localManifest, normalizedRemoteManifest);
  const filesToDownload = [...delta.missing, ...delta.changed];
  const manifestVersionChanged = versionChanged(localManifest, normalizedRemoteManifest);
  const requiresWritableClone = !targetMatchesBase && (manifestVersionChanged || filesToDownload.length > 0);
  const requiresVersionRefresh = targetMatchesBase && manifestVersionChanged;
  if (!filesToDownload.length && !requiresWritableClone && !requiresVersionRefresh) {
    return {
      updated: false,
      delta,
      localManifest,
      remoteManifest: normalizedRemoteManifest,
    };
  }

  await fs.mkdir(resolvedTargetModelDir, { recursive: true });
  if (requiresVersionRefresh && !filesToDownload.length) {
    await writeJsonFile(versionFilePath(resolvedTargetModelDir), normalizedRemoteManifest);
    onProgress?.({
      phase: "completed",
      totalFiles: 0,
      completedFiles: 0,
      currentFile: "",
      modelVersion: normalizedRemoteManifest.model_version,
    });
    return {
      updated: true,
      delta,
      localManifest,
      remoteManifest: normalizedRemoteManifest,
    };
  }

  await backupCurrentModel(resolvedTargetModelDir);
  const stagingDir = stagingRootPath(resolvedTargetModelDir);
  await fs.rm(stagingDir, { recursive: true, force: true });
  await fs.mkdir(stagingDir, { recursive: true });

  let applied = false;
  try {
    if (!targetMatchesBase) {
      await copyBaseModelIntoStaging(resolvedBaseModelDir, stagingDir);
    }

    for (let index = 0; index < filesToDownload.length; index += 1) {
      const file = filesToDownload[index];
      throwIfAborted(signal);
      onProgress?.({
        phase: "downloading",
        totalFiles: filesToDownload.length,
        completedFiles: index,
        currentFile: file.name,
      });
      await downloadModelFile({
        apiBaseUrl,
        modelKey: normalizedModelKey,
        file,
        stagingDir,
        signal,
      });
    }

    for (let index = 0; index < filesToDownload.length; index += 1) {
      const file = filesToDownload[index];
      throwIfAborted(signal);
      onProgress?.({
        phase: "applying",
        totalFiles: filesToDownload.length,
        completedFiles: index,
        currentFile: file.name,
      });
      if (targetMatchesBase) {
        const stagedPath = path.join(stagingDir, file.name);
        const targetPath = path.join(resolvedTargetModelDir, file.name);
        await ensureParentDir(targetPath);
        await fs.copyFile(stagedPath, targetPath);
      }
    }
    if (!targetMatchesBase) {
      await applyStagingDirectoryToTarget(stagingDir, resolvedTargetModelDir);
    }
    applied = true;
    await writeJsonFile(versionFilePath(resolvedTargetModelDir), normalizedRemoteManifest);
    onProgress?.({
      phase: "completed",
      totalFiles: filesToDownload.length,
      completedFiles: filesToDownload.length,
      currentFile: "",
      modelVersion: normalizedRemoteManifest.model_version,
    });
    return {
      updated: true,
      delta,
      remoteManifest: normalizedRemoteManifest,
    };
  } catch (error) {
    if (applied || error?.name !== "AbortError") {
      try {
        await rollbackFromBackup(resolvedTargetModelDir);
      } catch (rollbackError) {
        throw withRollbackErrorMessage(error, rollbackError);
      }
    }
    throw error;
  } finally {
    await fs.rm(stagingDir, { recursive: true, force: true });
  }
}
