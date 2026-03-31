import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";


const require = createRequire(import.meta.url);
const asar = require("asar");

const __filename = fileURLToPath(import.meta.url);
const desktopRoot = path.resolve(path.dirname(__filename), "..");
const repoRoot = path.resolve(desktopRoot, "..");
const frontendRoot = path.resolve(repoRoot, "frontend");
const fixedDir = path.resolve(desktopRoot, "dist-fixed", "win-unpacked");
const fixedResourcesDir = path.join(fixedDir, "resources");
const fixedExePath = path.join(fixedDir, "Bottle.exe");
const frontendCacheDir = path.resolve(desktopRoot, ".cache", "frontend-dist");
const helperRuntimeDir = path.resolve(desktopRoot, ".cache", "helper-runtime", "BottleLocalHelper");
const runtimeDefaultsPath = path.resolve(desktopRoot, ".cache", "runtime-defaults.json");
const helperManifestPath = path.resolve(desktopRoot, ".cache", "helper-runtime-manifest.json");
const updateStageDir = path.resolve(desktopRoot, ".cache", "update-app-stage");
const electronBinarySourcePath = path.resolve(desktopRoot, "node_modules", "electron", "dist", "electron.exe");
const runtimeToolSources = [
  {
    source: path.resolve(repoRoot, "tools", "ffmpeg", "bin"),
    target: path.join(fixedResourcesDir, "runtime-tools", "ffmpeg"),
  },
  {
    source: path.resolve(repoRoot, "tools", "yt-dlp"),
    target: path.join(fixedResourcesDir, "runtime-tools", "yt-dlp"),
  },
  {
    source: path.resolve(repoRoot, "asr-test", "models", "faster-distil-small.en"),
    target: path.join(fixedResourcesDir, "preinstalled-models", "faster-distil-small.en"),
  },
];
const helperSourcePaths = [
  path.resolve(repoRoot, "app"),
  path.resolve(repoRoot, "config"),
  path.resolve(repoRoot, "scripts", "run_desktop_backend.py"),
  path.resolve(repoRoot, "requirements.txt"),
  path.resolve(repoRoot, "requirements-dev.txt"),
];

const CLOUD_APP_URL = "https://351636.preview.aliyun-zeabur.cn";
const CLOUD_API_BASE_URL = "https://351636.preview.aliyun-zeabur.cn";
const FULL_REBUILD_REQUIRED_EXIT_CODE = 20;

function logStep(label, message) {
  console.log(`\n[${label}] ${message}`);
}

function resolveCommand(command) {
  return command;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || repoRoot,
    stdio: "inherit",
    env: { ...process.env, ...(options.env || {}) },
    shell: process.platform === "win32",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function getMtimeMs(targetPath) {
  try {
    const stats = await fs.stat(targetPath);
    return stats.mtimeMs;
  } catch {
    return 0;
  }
}

async function getLatestMtimeMs(targetPath) {
  if (!(await exists(targetPath))) return 0;
  const stats = await fs.stat(targetPath);
  if (!stats.isDirectory()) return stats.mtimeMs;
  let latest = stats.mtimeMs;
  for (const entry of await fs.readdir(targetPath, { withFileTypes: true })) {
    latest = Math.max(latest, await getLatestMtimeMs(path.join(targetPath, entry.name)));
  }
  return latest;
}

async function rmForce(targetPath) {
  await fs.rm(targetPath, { recursive: true, force: true });
}

async function ensureDir(targetPath) {
  await fs.mkdir(targetPath, { recursive: true });
}

async function copyPath(sourcePath, targetPath) {
  await rmForce(targetPath);
  await ensureDir(path.dirname(targetPath));
  await fs.cp(sourcePath, targetPath, { recursive: true, force: true });
}

async function copyIfStale(sourcePath, targetPath) {
  const sourceMtime = await getLatestMtimeMs(sourcePath);
  const targetMtime = await getLatestMtimeMs(targetPath);
  if (!(await exists(targetPath)) || sourceMtime > targetMtime + 1) {
    await copyPath(sourcePath, targetPath);
  }
}

async function collectFingerprintEntries(targetPath, basePath = path.dirname(targetPath)) {
  if (!(await exists(targetPath))) return [];
  const stats = await fs.stat(targetPath);
  const relPath = path.relative(basePath, targetPath).replace(/\\/g, "/");
  if (!stats.isDirectory()) {
    return [`F|${relPath}|${stats.size}|${Math.round(stats.mtimeMs)}`];
  }
  const entries = [`D|${relPath}|${Math.round(stats.mtimeMs)}`];
  const children = await fs.readdir(targetPath, { withFileTypes: true });
  for (const child of children.sort((left, right) => left.name.localeCompare(right.name))) {
    entries.push(...(await collectFingerprintEntries(path.join(targetPath, child.name), basePath)));
  }
  return entries;
}

async function computeFingerprint(targetPaths) {
  const hash = createHash("sha256");
  for (const targetPath of targetPaths) {
    const parentPath = path.dirname(targetPath);
    const entries = await collectFingerprintEntries(targetPath, parentPath);
    for (const entry of entries) {
      hash.update(entry);
      hash.update("\n");
    }
  }
  return hash.digest("hex");
}

async function readJsonFile(filePath, fallbackValue) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallbackValue;
  }
}

async function writeJsonFile(filePath, payload) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
}

async function ensureFastUpdatePrerequisites() {
  if (!(await exists(fixedExePath))) return false;
  if (!(await exists(path.join(fixedResourcesDir, "app.asar")))) return false;
  if (!(await exists(path.join(fixedResourcesDir, "app.asar.unpacked")))) return false;
  const sourceElectronMtime = await getMtimeMs(electronBinarySourcePath);
  const targetExeMtime = await getMtimeMs(fixedExePath);
  if (sourceElectronMtime > 0 && sourceElectronMtime > targetExeMtime + 1) {
    return false;
  }
  return true;
}

async function buildFrontendCache() {
  logStep("1/5", "Building latest frontend bundle");
  run(resolveCommand("npm"), ["--prefix", frontendRoot, "run", "build"], {
    cwd: repoRoot,
    env: {
      BOTTLE_DESKTOP_RENDERER_BUILD: "1",
      VITE_DESKTOP_RENDERER_BUILD: "1",
    },
  });
  await copyPath(path.resolve(frontendRoot, "dist"), frontendCacheDir);
}

async function writeRuntimeDefaults() {
  logStep("2/5", "Refreshing runtime defaults");
  run(resolveCommand("node"), [path.resolve(desktopRoot, "scripts", "write-runtime-defaults.mjs")], {
    cwd: repoRoot,
    env: {
      DESKTOP_CLOUD_APP_URL: CLOUD_APP_URL,
      DESKTOP_CLOUD_API_BASE_URL: CLOUD_API_BASE_URL,
    },
  });
}

async function ensureHelperRuntime() {
  const nextFingerprint = await computeFingerprint(helperSourcePaths);
  const previousManifest = await readJsonFile(helperManifestPath, {});
  const shouldReuse =
    previousManifest?.fingerprint === nextFingerprint &&
    (await exists(path.join(helperRuntimeDir, "BottleLocalHelper.exe")));

  if (shouldReuse) {
    logStep("3/5", "Reusing cached helper runtime");
    return;
  }

  logStep("3/5", "Rebuilding desktop helper runtime");
  run(resolveCommand("node"), [path.resolve(desktopRoot, "scripts", "build-helper-runtime.mjs")], {
    cwd: repoRoot,
  });
  await writeJsonFile(helperManifestPath, {
    fingerprint: nextFingerprint,
    rebuiltAt: new Date().toISOString(),
  });
}

async function stageAppContents() {
  await rmForce(updateStageDir);
  await ensureDir(updateStageDir);
  await copyPath(path.resolve(desktopRoot, "electron"), path.join(updateStageDir, "electron"));
  if (await exists(path.resolve(desktopRoot, "build"))) {
    await copyPath(path.resolve(desktopRoot, "build"), path.join(updateStageDir, "build"));
  }
  await copyPath(frontendCacheDir, path.join(updateStageDir, ".cache", "frontend-dist"));
  await fs.copyFile(path.resolve(desktopRoot, "package.json"), path.join(updateStageDir, "package.json"));
}

async function rebuildAppAsar() {
  logStep("4/5", "Updating app.asar and unpacked frontend assets");
  await stageAppContents();
  const targetAsarPath = path.join(fixedResourcesDir, "app.asar");
  const tempAsarPath = `${targetAsarPath}.tmp`;
  await rmForce(tempAsarPath);
  await ensureDir(fixedResourcesDir);
  await asar.createPackage(updateStageDir, tempAsarPath);
  await rmForce(targetAsarPath);
  await fs.rename(tempAsarPath, targetAsarPath);
  await copyPath(frontendCacheDir, path.join(fixedResourcesDir, "app.asar.unpacked", ".cache", "frontend-dist"));
}

async function syncExtraResources() {
  await copyPath(helperRuntimeDir, path.join(fixedResourcesDir, "desktop-helper-runtime", "BottleLocalHelper"));
  await ensureDir(path.dirname(path.join(fixedResourcesDir, "runtime-defaults.json")));
  await fs.copyFile(runtimeDefaultsPath, path.join(fixedResourcesDir, "runtime-defaults.json"));
  for (const item of runtimeToolSources) {
    await copyIfStale(item.source, item.target);
  }
}

async function assertPathExists(targetPath, label) {
  if (!(await exists(targetPath))) {
    throw new Error(`${label} not found: ${targetPath}`);
  }
}

async function validateBundle() {
  logStep("5/5", "Validating updated desktop bundle");
  const requiredPaths = [
    [fixedExePath, "Desktop executable"],
    [path.join(fixedResourcesDir, "app.asar"), "app.asar"],
    [path.join(fixedResourcesDir, "app.asar.unpacked", ".cache", "frontend-dist", "index.html"), "Frontend entry"],
    [path.join(fixedResourcesDir, "desktop-helper-runtime", "BottleLocalHelper", "BottleLocalHelper.exe"), "Desktop helper"],
    [path.join(fixedResourcesDir, "runtime-defaults.json"), "Runtime defaults"],
    [path.join(fixedResourcesDir, "runtime-tools", "ffmpeg", "ffmpeg.exe"), "FFmpeg"],
    [path.join(fixedResourcesDir, "runtime-tools", "yt-dlp", "yt-dlp.exe"), "yt-dlp"],
    [path.join(fixedResourcesDir, "preinstalled-models", "faster-distil-small.en"), "Model directory"],
  ];

  for (const [targetPath, label] of requiredPaths) {
    await assertPathExists(targetPath, label);
  }
}

async function main() {
  const canFastUpdate = await ensureFastUpdatePrerequisites();
  if (!canFastUpdate) {
    console.log("FAST_UPDATE_UNAVAILABLE");
    process.exit(FULL_REBUILD_REQUIRED_EXIT_CODE);
  }

  await buildFrontendCache();
  await writeRuntimeDefaults();
  await ensureHelperRuntime();
  await rebuildAppAsar();
  await syncExtraResources();
  await validateBundle();

  console.log(`\nUpdated desktop bundle: ${fixedExePath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
