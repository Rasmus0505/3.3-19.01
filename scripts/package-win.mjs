import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";


const __filename = fileURLToPath(import.meta.url);
const desktopRoot = path.resolve(path.dirname(__filename), "..");
const repoRoot = path.resolve(desktopRoot, "..");
const bundledModelSourceDir = path.resolve(repoRoot, "asr-test", "models", "faster-distil-small.en");
const requestedTarget = (process.argv[2] || "dir").trim();
const supportedTargets = new Set(["dir", "nsis"]);


function resolveCommand(command) {
  return command;
}

function run(command, args, cwd = repoRoot) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env },
    shell: process.platform === "win32",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

if (!supportedTargets.has(requestedTarget)) {
  throw new Error(`unsupported desktop package target: ${requestedTarget}`);
}

run(resolveCommand("node"), [path.resolve(desktopRoot, "scripts", "build.mjs")], repoRoot);
run(resolveCommand("node"), [path.resolve(desktopRoot, "scripts", "write-runtime-defaults.mjs")], repoRoot);
run(resolveCommand("node"), [path.resolve(desktopRoot, "scripts", "build-helper-runtime.mjs")], repoRoot);

const electronBuilderArgs = ["--win", requestedTarget, "--x64"];
run(resolveCommand("npx"), ["electron-builder", ...electronBuilderArgs], desktopRoot);

const outputDescription = requestedTarget === "dir" ? "win-unpacked bundle" : "NSIS installer";
console.log(`packaged ${outputDescription} with bundled model source: ${bundledModelSourceDir}`);
