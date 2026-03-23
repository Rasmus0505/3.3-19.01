import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const desktopRoot = process.cwd();
const repoRoot = path.resolve(desktopRoot, "..");
const shouldCleanDist = process.argv.includes("--clean-dist");
const distRoot = path.join(desktopRoot, "dist");

const requiredPaths = [
  path.join(desktopRoot, "build", "installer.nsh"),
  path.join(desktopRoot, "electron", "main.mjs"),
  path.join(desktopRoot, "electron", "preload.mjs"),
  path.join(desktopRoot, "electron", "helper-runtime.mjs"),
  path.join(desktopRoot, "electron", "runtime-config.mjs"),
  path.join(desktopRoot, "scripts", "build-helper-runtime.mjs"),
  path.join(desktopRoot, "scripts", "write-runtime-defaults.mjs"),
  path.join(repoRoot, "scripts", "run_desktop_backend.py"),
  path.join(repoRoot, "app", "api", "routers", "local_asr_assets.py"),
  path.join(repoRoot, "app", "core", "config.py"),
];

const missing = requiredPaths.filter((item) => !fs.existsSync(item));
if (missing.length > 0) {
  console.error("desktop build prerequisites are missing:");
  for (const item of missing) {
    console.error(`- ${path.relative(repoRoot, item)}`);
  }
  console.error("Desktop packaging requires the local helper entrypoints and Electron runtime files to exist.");
  process.exit(1);
}

if (shouldCleanDist && fs.existsSync(distRoot)) {
  fs.rmSync(distRoot, { recursive: true, force: true });
  console.log(`removed previous desktop artifacts: ${path.relative(repoRoot, distRoot)}`);
}

console.log("desktop build prerequisites are ready");
