import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";


const __filename = fileURLToPath(import.meta.url);
const desktopRoot = path.resolve(path.dirname(__filename), "..");
const repoRoot = path.resolve(desktopRoot, "..");


function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || "").trim();
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = String(argv[index + 1] || "").trim();
    if (!next || next.startsWith("--")) {
      parsed[key] = "true";
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}


function resolveCommand(command) {
  return command;
}


function run(command, args, cwd, env) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env,
    shell: process.platform === "win32",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}


async function findArtifacts(distDir) {
  const output = [];
  async function walk(targetDir) {
    let entries = [];
    try {
      entries = await fs.readdir(targetDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const absolutePath = path.join(targetDir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }
      if (!/\.(exe|yml|yaml|blockmap)$/i.test(entry.name)) {
        continue;
      }
      output.push({
        name: entry.name,
        path: absolutePath,
      });
    }
  }
  await walk(distDir);
  return output;
}


const args = parseArgs(process.argv.slice(2));
const channel = String(args.channel || process.env.DESKTOP_RELEASE_CHANNEL || "stable").trim().toLowerCase() === "preview" ? "preview" : "stable";
const version = String(args.version || process.env.DESKTOP_RELEASE_VERSION || process.env.npm_package_version || "").trim();
const metadataBaseUrl = String(args["metadata-base-url"] || process.env.DESKTOP_RELEASE_API_BASE_URL || process.env.DESKTOP_CLOUD_API_BASE_URL || "").trim().replace(/\/+$/, "");
const appBaseUrl = String(args["app-base-url"] || process.env.DESKTOP_RELEASE_APP_URL || process.env.DESKTOP_CLOUD_APP_URL || metadataBaseUrl || "").trim().replace(/\/+$/, "");
const entryUrl = String(args["entry-url"] || process.env.DESKTOP_RELEASE_ENTRY_URL || "").trim() || (appBaseUrl ? `${appBaseUrl}/download/desktop${channel === "preview" ? "?channel=preview" : ""}` : "");
const releaseNotes = String(args["release-notes"] || process.env.DESKTOP_RELEASE_NOTES || "").trim();
const releaseName = String(args["release-name"] || process.env.DESKTOP_RELEASE_NAME || "").trim() || `Bottle Desktop ${version || channel}`;
const publishDir = path.resolve(desktopRoot, String(args["publish-dir"] || process.env.DESKTOP_RELEASE_PUBLISH_DIR || "dist/release").trim());
const target = String(args.target || process.env.DESKTOP_RELEASE_TARGET || "nsis").trim() || "nsis";
const certFile = String(args["cert-file"] || process.env.DESKTOP_SIGN_CERT_FILE || "").trim();
const certPassword = String(args["cert-password"] || process.env.DESKTOP_SIGN_CERT_PASSWORD || "").trim();
const certSubjectName = String(args["cert-subject"] || process.env.DESKTOP_SIGN_CERT_SUBJECT_NAME || "").trim();
const signatureRequired = channel === "stable";

if (!version) {
  throw new Error("release-win requires --version or DESKTOP_RELEASE_VERSION");
}

if (signatureRequired && (!certFile || !certPassword)) {
  throw new Error("stable releases require DESKTOP_SIGN_CERT_FILE and DESKTOP_SIGN_CERT_PASSWORD");
}

const buildEnv = {
  ...process.env,
  DESKTOP_RELEASE_CHANNEL: channel,
  DESKTOP_CLIENT_LATEST_VERSION: version,
  DESKTOP_CLIENT_RELEASE_NAME: releaseName,
  DESKTOP_CLIENT_RELEASE_NOTES: releaseNotes,
  DESKTOP_CLIENT_PUBLISHED_AT: new Date().toISOString(),
  DESKTOP_CLIENT_ENTRY_URL: entryUrl,
  DESKTOP_CLIENT_UPDATE_ENTRY_URL: entryUrl,
  DESKTOP_CLOUD_API_BASE_URL: metadataBaseUrl,
  DESKTOP_CLOUD_APP_URL: appBaseUrl,
};

if (metadataBaseUrl) {
  buildEnv.DESKTOP_CLIENT_UPDATE_METADATA_URL = `${metadataBaseUrl}/desktop/client/channels/${channel}.json`;
}

if (signatureRequired) {
  buildEnv.CSC_LINK = pathToFileURL(path.resolve(certFile)).href;
  buildEnv.CSC_KEY_PASSWORD = certPassword;
  if (certSubjectName) {
    buildEnv.WIN_CSC_NAME = certSubjectName;
  }
}

run(resolveCommand("node"), [path.resolve(desktopRoot, "scripts", "package-win.mjs"), target], repoRoot, buildEnv);

const artifacts = await findArtifacts(path.resolve(desktopRoot, "dist"));
await fs.mkdir(publishDir, { recursive: true });

const releaseRecord = {
  schemaVersion: 1,
  channel,
  version,
  releaseName,
  publishedAt: buildEnv.DESKTOP_CLIENT_PUBLISHED_AT,
  entryUrl,
  notes: releaseNotes,
  metadataUrl: metadataBaseUrl ? `${metadataBaseUrl}/desktop/client/channels/${channel}.json` : "",
  signatureRequired,
  signed: signatureRequired,
  artifacts,
};

const channelFile = path.join(publishDir, `${channel}.json`);
const registryFile = path.join(publishDir, "desktop-releases.json");
let existingRegistry = { schemaVersion: 1, channels: {} };
try {
  existingRegistry = JSON.parse(await fs.readFile(registryFile, "utf8"));
} catch {
  existingRegistry = { schemaVersion: 1, channels: {} };
}
if (!existingRegistry.channels || typeof existingRegistry.channels !== "object") {
  existingRegistry.channels = {};
}
existingRegistry.schemaVersion = 1;
existingRegistry.channels[channel] = releaseRecord;

await fs.writeFile(channelFile, JSON.stringify(releaseRecord, null, 2), "utf8");
await fs.writeFile(registryFile, JSON.stringify(existingRegistry, null, 2), "utf8");

console.log(`release metadata written: ${channelFile}`);
console.log(`release registry written: ${registryFile}`);
