import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(currentFile);
const frontendDir = path.resolve(scriptsDir, "..");
const distDir = path.join(frontendDir, "dist");
const appStaticDir = path.resolve(frontendDir, "..", "app", "static");

if (!existsSync(distDir)) {
  throw new Error(`frontend dist not found: ${distDir}`);
}

rmSync(appStaticDir, { recursive: true, force: true });
mkdirSync(appStaticDir, { recursive: true });
cpSync(distDir, appStaticDir, { recursive: true });
