import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";


const __filename = fileURLToPath(import.meta.url);
const desktopRoot = path.resolve(path.dirname(__filename), "..");
const repoRoot = path.resolve(desktopRoot, "..");
const frontendRoot = path.resolve(repoRoot, "frontend");
const frontendDistDir = path.resolve(frontendRoot, "dist");
const cachedFrontendDir = path.resolve(desktopRoot, ".cache", "frontend-dist");


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

async function copyDirectory(sourceDir, targetDir) {
  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.mkdir(targetDir, { recursive: true });
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

run(resolveCommand("npm"), ["--prefix", frontendRoot, "run", "build"], {
  cwd: repoRoot,
  env: {
    BOTTLE_DESKTOP_RENDERER_BUILD: "1",
    VITE_DESKTOP_RENDERER_BUILD: "1",
  },
});
await copyDirectory(frontendDistDir, cachedFrontendDir);
