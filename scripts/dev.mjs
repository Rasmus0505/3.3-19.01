import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";


const __filename = fileURLToPath(import.meta.url);
const desktopRoot = path.resolve(path.dirname(__filename), "..");
const repoRoot = path.resolve(desktopRoot, "..");
const frontendRoot = path.resolve(repoRoot, "frontend");
const devServerUrl = process.env.DESKTOP_FRONTEND_DEV_SERVER_URL || "http://127.0.0.1:5173";


function resolveCommand(command) {
  return command;
}

function waitForUrl(url, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const probe = () => {
      const request = http.get(url, (response) => {
        response.resume();
        resolve();
      });
      request.on("error", () => {
        if (Date.now() >= deadline) {
          reject(new Error(`Timed out waiting for ${url}`));
          return;
        }
        setTimeout(probe, 1000);
      });
    };
    probe();
  });
}

const frontendProcess = spawn(
  resolveCommand("npm"),
  ["--prefix", frontendRoot, "run", "dev", "--", "--host", "127.0.0.1", "--port", "5173"],
  {
    cwd: repoRoot,
    stdio: "inherit",
    env: { ...process.env },
    shell: process.platform === "win32",
  },
);

const shutdown = () => {
  if (!frontendProcess.killed) {
    frontendProcess.kill();
  }
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await waitForUrl(devServerUrl);

const electronProcess = spawn(resolveCommand("npx"), ["electron", "."], {
  cwd: desktopRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    DESKTOP_FRONTEND_DEV_SERVER_URL: devServerUrl,
  },
  shell: process.platform === "win32",
});

electronProcess.on("exit", (code) => {
  shutdown();
  process.exit(code ?? 0);
});
