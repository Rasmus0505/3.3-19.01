import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(currentFile);
const desktopRoot = path.resolve(scriptsDir, "..");
const repoRoot = path.resolve(desktopRoot, "..");
const distDir = path.join(desktopRoot, "dist");
const localCacheRoot = path.join(desktopRoot, ".cache");
const electronRuntimeCacheDir = path.join(localCacheRoot, "electron-runtime");
const builderCacheDir = path.join(localCacheRoot, "electron-builder");
const nsisResourcesVersion = "3.4.1";
const nsisResourcesArchivePath = path.join(builderCacheDir, `nsis-resources-${nsisResourcesVersion}.7z`);
const nsisResourcesDir = path.join(builderCacheDir, "nsis-resources");
const sevenZipPath = path.join(desktopRoot, "node_modules", "7zip-bin", "win", "x64", "7za.exe");
const buildScriptPath = path.join(scriptsDir, "build.mjs");
const buildHelperRuntimeScriptPath = path.join(scriptsDir, "build-helper-runtime.mjs");
const writeRuntimeDefaultsScriptPath = path.join(scriptsDir, "write-runtime-defaults.mjs");
const builderCliPath = path.join(desktopRoot, "node_modules", "electron-builder", "cli.js");
const electronInstallScriptPath = path.join(desktopRoot, "node_modules", "electron", "install.js");
const bundledModelSourceDir = path.join(repoRoot, "asr-test", "models", "faster-distil-small.en");

function resolveElectronCacheDir() {
  const configured = String(process.env.ELECTRON_CACHE || "").trim();
  if (configured) {
    return configured;
  }
  const localAppData = String(process.env.LOCALAPPDATA || "").trim();
  if (localAppData) {
    return path.join(localAppData, "electron", "Cache");
  }
  return electronRuntimeCacheDir;
}

function resolveElectronMirror() {
  const configured = String(process.env.ELECTRON_MIRROR || "").trim();
  if (configured) {
    return configured;
  }
  return "https://npmmirror.com/mirrors/electron/";
}

function runCommand(command, args = [], envOverrides = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: desktopRoot,
      env: {
        ...process.env,
        ...envOverrides,
      },
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Command failed for ${path.basename(command)} with code=${code ?? "null"} signal=${signal ?? "null"}`));
    });
  });
}

function runNodeScript(scriptPath, args = [], envOverrides = {}) {
  return runCommand(process.execPath, [scriptPath, ...args], envOverrides);
}

async function preparePackageWorkspace() {
  await fsp.mkdir(builderCacheDir, { recursive: true });
  await fsp.mkdir(electronRuntimeCacheDir, { recursive: true });
}

async function downloadFile(url, destinationPath) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed for ${url} with status ${response.status}`);
  }
  await fsp.mkdir(path.dirname(destinationPath), { recursive: true });
  const fileHandle = fs.createWriteStream(destinationPath);
  await new Promise((resolve, reject) => {
    response.body.pipe(fileHandle);
    response.body.on("error", reject);
    fileHandle.on("error", reject);
    fileHandle.on("finish", resolve);
  });
}

async function ensureNsisResources() {
  if (fs.existsSync(path.join(nsisResourcesDir, "plugins"))) {
    return;
  }
  if (!fs.existsSync(nsisResourcesArchivePath)) {
    await downloadFile(
      `https://github.com/electron-userland/electron-builder-binaries/releases/download/nsis-resources-${nsisResourcesVersion}/nsis-resources-${nsisResourcesVersion}.7z`,
      nsisResourcesArchivePath
    );
  }
  await fsp.rm(nsisResourcesDir, { recursive: true, force: true });
  await fsp.mkdir(nsisResourcesDir, { recursive: true });
  await runCommand(sevenZipPath, ["x", nsisResourcesArchivePath, `-o${nsisResourcesDir}`, "-y"]);
}

async function syncArtifactsToDist(packageOutputDir) {
  await fsp.rm(distDir, { recursive: true, force: true });
  await fsp.mkdir(distDir, { recursive: true });
  const entries = await fsp.readdir(packageOutputDir);
  for (const entry of entries) {
    await fsp.cp(path.join(packageOutputDir, entry), path.join(distDir, entry), { recursive: true, force: true });
  }
}

async function verifyInstallerArtifacts(outputDir) {
  const entries = await fsp.readdir(outputDir);
  const portableArtifacts = entries.filter((entry) => /portable/i.test(entry));
  if (portableArtifacts.length > 0) {
    throw new Error(`portable artifacts must not be produced: ${portableArtifacts.join(", ")}`);
  }
  const setupArtifacts = entries.filter((entry) => /setup.*\.exe$/i.test(entry) || /-setup-.*\.exe$/i.test(entry));
  if (setupArtifacts.length === 0) {
    throw new Error("NSIS setup executable was not produced.");
  }
}

async function main() {
  const packageOutputDir = path.join(localCacheRoot, `package-output-${Date.now()}`);
  await runNodeScript(buildScriptPath, ["--clean-dist"]);
  if (!fs.existsSync(bundledModelSourceDir)) {
    throw new Error(`Bottle 1.0 bundled model directory is missing: ${bundledModelSourceDir}`);
  }
  await runNodeScript(writeRuntimeDefaultsScriptPath);
  await runNodeScript(buildHelperRuntimeScriptPath);
  await preparePackageWorkspace();
  await ensureNsisResources();
  await runNodeScript(electronInstallScriptPath, [], {
    ELECTRON_CACHE: resolveElectronCacheDir(),
    ELECTRON_MIRROR: resolveElectronMirror(),
  });
  await runNodeScript(
    builderCliPath,
    ["--win", "nsis", "--x64", `--config.directories.output=${packageOutputDir}`, `--config.electronDist=${path.join("node_modules", "electron", "dist")}`],
    {
      CSC_IDENTITY_AUTO_DISCOVERY: "false",
      ELECTRON_CACHE: resolveElectronCacheDir(),
      ELECTRON_MIRROR: resolveElectronMirror(),
      ELECTRON_BUILDER_CACHE: builderCacheDir,
      ELECTRON_BUILDER_NSIS_RESOURCES_DIR: nsisResourcesDir,
    }
  );
  await verifyInstallerArtifacts(packageOutputDir);
  await syncArtifactsToDist(packageOutputDir);
  await verifyInstallerArtifacts(distDir);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
