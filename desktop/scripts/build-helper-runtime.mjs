import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(currentFile);
const desktopRoot = path.resolve(scriptsDir, "..");
const repoRoot = path.resolve(desktopRoot, "..");
const entryScriptPath = path.join(repoRoot, "scripts", "run_desktop_backend.py");
const cacheRoot = path.join(desktopRoot, ".cache");
const distPath = path.join(cacheRoot, "helper-runtime");
const workPath = path.join(cacheRoot, "helper-runtime-build");
const specPath = path.join(cacheRoot, "helper-runtime-spec");
const appName = "BottleLocalHelper";
const pyInstallerVersion = "6.13.0";

function getPythonCandidates() {
  const configured = String(process.env.DESKTOP_PYTHON_EXECUTABLE || "").trim();
  const candidates = [];
  if (configured) {
    candidates.push({ command: configured, args: [] });
  }
  candidates.push({ command: "py", args: ["-3.11"] });
  candidates.push({ command: "python", args: [] });
  candidates.push({ command: "python3", args: [] });
  return candidates;
}

function resolvePythonCommand() {
  for (const candidate of getPythonCandidates()) {
    const probe = spawnSync(candidate.command, [...candidate.args, "--version"], {
      stdio: "ignore",
      timeout: 5000,
      windowsHide: true,
    });
    if (probe.status === 0) {
      return candidate;
    }
  }
  throw new Error("No usable Python 3.11 runtime was found for building the bundled desktop helper.");
}

function runCommand(command, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: process.env,
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

function checkPyInstaller(pythonRuntime) {
  const probe = spawnSync(pythonRuntime.command, [...pythonRuntime.args, "-m", "PyInstaller", "--version"], {
    stdio: "ignore",
    timeout: 10000,
    windowsHide: true,
  });
  return probe.status === 0;
}

async function ensurePyInstaller(pythonRuntime) {
  if (checkPyInstaller(pythonRuntime)) {
    return;
  }
  console.log(`PyInstaller is missing. Installing pyinstaller==${pyInstallerVersion} into the active Python environment...`);
  await runCommand(pythonRuntime.command, [
    ...pythonRuntime.args,
    "-m",
    "pip",
    "install",
    "--disable-pip-version-check",
    `pyinstaller==${pyInstallerVersion}`,
  ]);
  if (!checkPyInstaller(pythonRuntime)) {
    throw new Error("PyInstaller is still unavailable after installation.");
  }
}

async function main() {
  if (process.platform !== "win32") {
    throw new Error("The bundled desktop helper build currently supports Windows packaging only.");
  }
  if (!fs.existsSync(entryScriptPath)) {
    throw new Error(`Desktop helper entry script is missing: ${entryScriptPath}`);
  }

  const pythonRuntime = resolvePythonCommand();
  await ensurePyInstaller(pythonRuntime);
  await fsp.rm(distPath, { recursive: true, force: true });
  await fsp.rm(workPath, { recursive: true, force: true });
  await fsp.rm(specPath, { recursive: true, force: true });
  await fsp.mkdir(cacheRoot, { recursive: true });

  const pyInstallerArgs = [
    ...pythonRuntime.args,
    "-m",
    "PyInstaller",
    "--noconfirm",
    "--clean",
    "--onedir",
    "--name",
    appName,
    "--paths",
    repoRoot,
    "--distpath",
    distPath,
    "--workpath",
    workPath,
    "--specpath",
    specPath,
    "--collect-all",
    "fastapi",
    "--collect-all",
    "starlette",
    "--collect-all",
    "pydantic",
    "--collect-all",
    "uvicorn",
    "--collect-all",
    "anyio",
    "--collect-all",
    "sniffio",
    "--hidden-import",
    "app.api.routers.local_asr_assets",
    "--hidden-import",
    "app.api.routers.desktop_asr",
    "--hidden-import",
    "app.core.config",
    "--hidden-import",
    "uvicorn.logging",
    "--hidden-import",
    "uvicorn.loops.auto",
    "--hidden-import",
    "uvicorn.protocols.http.auto",
    "--hidden-import",
    "uvicorn.protocols.websockets.auto",
    "--hidden-import",
    "uvicorn.lifespan.on",
    "--hidden-import",
    "uvicorn.lifespan.off",
    entryScriptPath,
  ];

  await runCommand(pythonRuntime.command, pyInstallerArgs);
  const executablePath = path.join(distPath, appName, `${appName}.exe`);
  if (!fs.existsSync(executablePath)) {
    throw new Error(`Bundled helper executable was not produced: ${executablePath}`);
  }
  console.log(`built bundled desktop helper: ${path.relative(repoRoot, executablePath)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
