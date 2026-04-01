import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";


function trimText(value) {
  return String(value ?? "").trim();
}

function normalizeFiles(manifest = {}) {
  return Array.isArray(manifest?.files) ? manifest.files.filter((item) => item && typeof item === "object") : [];
}

function fileMap(manifest = {}) {
  const map = new Map();
  for (const item of normalizeFiles(manifest)) {
    map.set(trimText(item.name), item);
  }
  return map;
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function hashFile(filePath) {
  const digest = createHash("sha256");
  digest.update(await fs.readFile(filePath));
  return digest.digest("hex");
}

async function listActualFiles(modelDir) {
  const output = [];
  if (!(await pathExists(modelDir))) {
    return output;
  }
  for (const entry of await fs.readdir(modelDir, { withFileTypes: true })) {
    if (entry.name === ".model-version.json") {
      continue;
    }
    const absolutePath = path.join(modelDir, entry.name);
    if (entry.isDirectory()) {
      const nestedFiles = await listActualFiles(absolutePath);
      for (const item of nestedFiles) {
        output.push({
          ...item,
          name: path.posix.join(entry.name, item.name),
        });
      }
      continue;
    }
    output.push({
      name: entry.name,
      size_bytes: (await fs.stat(absolutePath)).size,
      sha256: await hashFile(absolutePath),
    });
  }
  return output.sort((left, right) => left.name.localeCompare(right.name));
}

export async function copyDirectory(sourceDir, targetDir) {
  await fs.mkdir(targetDir, { recursive: true });
  if (!(await pathExists(sourceDir))) {
    return;
  }
  for (const entry of await fs.readdir(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath);
    } else {
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.copyFile(sourcePath, targetPath);
    }
  }
}

export function computeModelUpdateDelta(localManifest = {}, remoteManifest = {}) {
  const localByName = fileMap(localManifest);
  const missing = [];
  const changed = [];
  for (const remoteFile of normalizeFiles(remoteManifest)) {
    const fileName = trimText(remoteFile.name);
    const localFile = localByName.get(fileName);
    if (!localFile) {
      missing.push(remoteFile);
      continue;
    }
    if (Number(localFile.size_bytes || 0) !== Number(remoteFile.size_bytes || 0) || trimText(localFile.sha256) !== trimText(remoteFile.sha256)) {
      changed.push(remoteFile);
    }
  }
  return { missing, changed };
}


export async function readLocalManifest(modelDir, modelKey = "") {
  const resolvedModelDir = path.resolve(String(modelDir || ""));
  const versionFile = path.join(resolvedModelDir, ".model-version.json");
  let versionPayload = {};
  if (await pathExists(versionFile)) {
    try {
      versionPayload = JSON.parse(await fs.readFile(versionFile, "utf8"));
    } catch {
      versionPayload = {};
    }
  }
  const files = await listActualFiles(resolvedModelDir);
  return {
    model_key: trimText(versionPayload.model_key) || trimText(modelKey),
    model_version: trimText(versionPayload.model_version) || (files.length > 0 ? "local" : ""),
    file_count: files.length,
    files,
  };
}


export async function performIncrementalModelUpdate({
  apiBaseUrl,
  modelKey,
  remoteManifest,
  baseModelDir,
  targetModelDir,
}) {
  const resolvedTargetDir = path.resolve(String(targetModelDir || ""));
  const resolvedBaseDir = path.resolve(String(baseModelDir || ""));
  const backupDir = `${resolvedTargetDir}.backup`;
  await fs.mkdir(resolvedTargetDir, { recursive: true });

  const initialFiles = await listActualFiles(resolvedTargetDir);
  if (initialFiles.length === 0 && (await pathExists(resolvedBaseDir))) {
    await copyDirectory(resolvedBaseDir, resolvedTargetDir);
  }

  const localManifest = await readLocalManifest(resolvedTargetDir, modelKey);
  const delta = computeModelUpdateDelta(localManifest, remoteManifest);
  const remoteFiles = [...delta.missing, ...delta.changed];

  for (const file of remoteFiles) {
    const relativeName = trimText(file.name);
    const targetPath = path.join(resolvedTargetDir, ...relativeName.split("/"));
    const backupPath = path.join(backupDir, ...relativeName.split("/"));
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    if (await pathExists(targetPath)) {
      await fs.mkdir(path.dirname(backupPath), { recursive: true });
      await fs.copyFile(targetPath, backupPath);
    }
    const response = await fetch(
      `${trimText(apiBaseUrl).replace(/\/+$/, "")}/api/local-asr-assets/download-models/${encodeURIComponent(trimText(modelKey))}/files/${relativeName
        .split("/")
        .map((item) => encodeURIComponent(item))
        .join("/")}`,
    );
    if (!response.ok) {
      throw new Error(`Model update download failed: ${response.status}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(targetPath, bytes);
  }

  const nextManifest = {
    model_key: trimText(remoteManifest?.model_key) || trimText(modelKey),
    model_version: trimText(remoteManifest?.model_version) || trimText(localManifest?.model_version),
    file_count: normalizeFiles(remoteManifest).length,
    files: normalizeFiles(remoteManifest),
  };
  await fs.writeFile(path.join(resolvedTargetDir, ".model-version.json"), JSON.stringify(nextManifest, null, 2), "utf8");
  return {
    updated: remoteFiles.length > 0,
    missingCount: delta.missing.length,
    changedCount: delta.changed.length,
    backupDir,
  };
}
