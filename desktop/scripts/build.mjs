import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const desktopRoot = process.cwd();
const repoRoot = path.resolve(desktopRoot, "..");
const frontendRoot = path.resolve(repoRoot, "frontend");
const shouldCleanDist = process.argv.includes("--clean-dist");
const isStandalone = process.argv.includes("--standalone");
const isCloudLinked = process.argv.includes("--cloud-linked") || !isStandalone;
const distRoot = path.join(desktopRoot, "dist");

// Mode summary for build output
console.log(`desktop build mode: ${isStandalone ? "standalone (bundled UI)" : "cloud-linked (remote UI)"}`);

const requiredPaths = [
  path.join(desktopRoot, "build", "installer.nsh"),
  path.join(desktopRoot, "electron", "main.mjs"),
  path.join(desktopRoot, "electron", "preload.mjs"),
  path.join(desktopRoot, "electron", "helper-runtime.mjs"),
  path.join(desktopRoot, "electron", "runtime-config.mjs"),
  path.join(desktopRoot, "electron", "app-protocol.mjs"),
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

// Step 1: Build frontend for standalone mode
if (isStandalone) {
  if (shouldCleanDist && fs.existsSync(distRoot)) {
    fs.rmSync(distRoot, { recursive: true, force: true });
    console.log(`removed previous desktop artifacts: ${path.relative(repoRoot, distRoot)}`);
  }

  if (!fs.existsSync(frontendRoot)) {
    console.error(`frontend root not found: ${path.relative(repoRoot, frontendRoot)}`);
    console.error("Cannot build in --standalone mode without the frontend source directory.");
    process.exit(1);
  }

  const frontendDist = path.join(frontendRoot, "dist");
  if (shouldCleanDist && fs.existsSync(frontendDist)) {
    fs.rmSync(frontendDist, { recursive: true, force: true });
    console.log(`removed previous frontend build: ${path.relative(repoRoot, frontendDist)}`);
  }

  console.log("building frontend (standalone mode)...");
  const buildResult = spawnSync("npm", ["run", "build"], {
    cwd: frontendRoot,
    stdio: "inherit",
    windowsHide: true,
  });
  if (buildResult.status !== 0) {
    console.error("frontend build failed, aborting.");
    process.exit(1);
  }

  if (!fs.existsSync(frontendDist)) {
    console.error(`frontend build did not produce dist/ directory: ${path.relative(repoRoot, frontendDist)}`);
    process.exit(1);
  }

  // Copy frontend dist into desktop/dist/
  fs.mkdirSync(distRoot, { recursive: true });
  const copyDir = (src, dest) => {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        copyDir(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  };
  copyDir(frontendDist, distRoot);
  console.log(`bundled frontend build into: ${path.relative(repoRoot, distRoot)}`);
} else {
  if (shouldCleanDist && fs.existsSync(distRoot)) {
    fs.rmSync(distRoot, { recursive: true, force: true });
    console.log(`removed previous desktop artifacts: ${path.relative(repoRoot, distRoot)}`);
  }
}

console.log("desktop build prerequisites are ready");
