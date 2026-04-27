import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(currentFile);
const frontendDir = path.resolve(scriptsDir, "..");
const distDir = path.join(frontendDir, "dist");
const configuredStaticDir = String(process.env.APP_STATIC_DIR || "").trim();
const appStaticDir = configuredStaticDir
  ? path.resolve(configuredStaticDir)
  : path.resolve(frontendDir, "..", "app", "static");

if (!existsSync(distDir)) {
  throw new Error(`frontend dist not found: ${distDir}`);
}

rmSync(appStaticDir, { recursive: true, force: true });
mkdirSync(appStaticDir, { recursive: true });
cpSync(distDir, appStaticDir, { recursive: true });
