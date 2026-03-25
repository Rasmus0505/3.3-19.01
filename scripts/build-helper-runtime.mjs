import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";


const __filename = fileURLToPath(import.meta.url);
const desktopRoot = path.resolve(path.dirname(__filename), "..");
const repoRoot = path.resolve(desktopRoot, "..");
const helperOutputRoot = path.resolve(desktopRoot, ".cache", "helper-runtime");
const helperOutputDir = path.resolve(helperOutputRoot, "BottleLocalHelper");
const helperScript = path.resolve(repoRoot, "scripts", "run_desktop_backend.py");


function resolveCommand(command) {
  return command;
}

async function ensureCleanDir(dirPath) {
  await fs.rm(dirPath, { recursive: true, force: true });
  await fs.mkdir(dirPath, { recursive: true });
}

await ensureCleanDir(helperOutputRoot);

const pyInstallerCommand = resolveCommand("pyinstaller");
const pyInstallerArgs = [
  "--clean",
  "--noconfirm",
  "--name",
  "BottleLocalHelper",
  "--distpath",
  helperOutputRoot,
  "--workpath",
  path.resolve(desktopRoot, ".cache", "pyinstaller-work"),
  "--specpath",
  path.resolve(desktopRoot, ".cache", "pyinstaller-spec"),
  helperScript,
];

const result = spawnSync(pyInstallerCommand, pyInstallerArgs, {
  cwd: repoRoot,
  stdio: "inherit",
  env: { ...process.env, DESKTOP_BACKEND_ROOT: repoRoot },
  shell: process.platform === "win32",
});

if (result.error) {
  throw result.error;
}
if (result.status !== 0) {
  throw new Error("PyInstaller is required to build the packaged BottleLocalHelper runtime.");
}

await fs.mkdir(helperOutputDir, { recursive: true });
