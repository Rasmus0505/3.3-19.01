import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const desktopRoot = process.cwd();
const repoRoot = path.resolve(desktopRoot, "..");
const shouldCleanDist = process.argv.includes("--clean-dist");
const distRoot = path.join(desktopRoot, "dist");

const requiredPaths = [
  path.join(desktopRoot, "electron", "main.mjs"),
  path.join(desktopRoot, "electron", "preload.mjs"),
  path.join(repoRoot, "scripts", "run_desktop_backend.py"),
  path.join(repoRoot, "app", "main.py"),
  path.join(repoRoot, "app", "static", "index.html"),
];

const missing = requiredPaths.filter((item) => !fs.existsSync(item));
if (missing.length > 0) {
  console.error("desktop build prerequisites are missing:");
  for (const item of missing) {
    console.error(`- ${path.relative(repoRoot, item)}`);
  }
  console.error("Run `npm --prefix frontend run build:app-static` before packaging the desktop client.");
  process.exit(1);
}

if (shouldCleanDist && fs.existsSync(distRoot)) {
  fs.rmSync(distRoot, { recursive: true, force: true });
  console.log(`removed previous desktop artifacts: ${path.relative(repoRoot, distRoot)}`);
}

console.log("desktop build prerequisites are ready");
