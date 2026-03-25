/**
 * Sherpa-ONNX ASR Wrapper
 *
 * High-level interface for Sherpa-ONNX ASR in the desktop client.
 * Handles audio file validation, format conversion, and coordinates
 * with the ASR process manager.
 */

import { asrProcessManager, AsrResult } from "./asrProcess";
import { app } from "electron";
import { join, dirname } from "path";
import { execSync } from "child_process";
import log from "electron-log";

export interface TranscribeOptions {
  /** Source file path (mp4, mp3, wav, flac, etc.) */
  sourceFilePath: string;
  /** Callback for progress updates */
  onProgress?: (progress: { stage: string; percent: number }) => void;
}

export interface TranscribeResult {
  /** Full transcription text */
  text: string;
  /** Audio duration in seconds */
  duration: number;
  /** Time taken in ms */
  elapsedMs: number;
  /** Real-time factor (lower = faster) */
  rtf: number;
  /** Word-level segments with timestamps */
  segments: Array<{
    text: string;
    start: number;
    end: number;
  }>;
  /** Path to the converted WAV file (for cleanup) */
  tempWavPath?: string;
}

/** Get the path to ffmpeg executable */
function getFfmpegPath(): string {
  // In development, use the ffmpeg in PATH or node_modules
  // In production, bundle ffmpeg-static
  try {
    // Try system ffmpeg first
    const result = execSync("where ffmpeg", { windowsHide: true })
      .toString()
      .trim()
      .split("\n")[0];
    if (result) return result;
  } catch {
    // not found
  }

  // Try bundled ffmpeg-static
  try {
    return require("ffmpeg-static");
  } catch {
    throw new Error(
      "ffmpeg not found. Please install ffmpeg and add it to PATH, or install ffmpeg-static."
    );
  }
}

/**
 * Convert any audio/video file to 16kHz mono WAV using ffmpeg.
 * @param inputPath Source file path
 * @param outputPath Output WAV path
 * @param onProgress Optional progress callback
 */
async function convertToWav(
  inputPath: string,
  outputPath: string,
  onProgress?: (p: { stage: string; percent: number }) => void
): Promise<void> {
  const ffmpegPath = getFfmpegPath();
  onProgress?.({ stage: "converting", percent: 0 });

  return new Promise((resolve, reject) => {
    const { spawn } = require("child_process");
    const args = [
      "-i", inputPath,
      "-ar", "16000",
      "-ac", "1",
      "-acodec", "pcm_s16le",
      "-y",
      outputPath,
    ];

    const proc = spawn(ffmpegPath, args, { windowsHide: true });

    let stderr = "";
    proc.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code: number) => {
      if (code === 0) {
        onProgress?.({ stage: "converting", percent: 100 });
        resolve();
      } else {
        log.error("[FFmpeg] stderr:", stderr);
        reject(new Error(`FFmpeg conversion failed with code ${code}`));
      }
    });

    proc.on("error", (err: Error) => {
      reject(new Error(`FFmpeg spawn failed: ${err.message}`));
    });
  });
}

/**
 * Transcribe a local audio/video file using Sherpa-ONNX.
 *
 * @param options TranscribeOptions
 * @returns TranscribeResult with text and timing info
 */
export async function transcribeAudio(options: TranscribeOptions): Promise<TranscribeResult> {
  const { sourceFilePath, onProgress } = options;

  onProgress?.({ stage: "preparing", percent: 5 });

  // Determine temp directory (use app temp dir)
  const tempDir = app.getPath("temp");
  const baseName = `bottle_asr_${Date.now()}`;
  const wavPath = join(tempDir, `${baseName}.wav`);

  // Convert to 16kHz mono WAV
  await convertToWav(sourceFilePath, wavPath, onProgress);

  onProgress?.({ stage: "transcribing", percent: 50 });

  // Ensure ASR process is started
  await asrProcessManager.start();

  onProgress?.({ stage: "transcribing", percent: 60 });

  // Run ASR
  const result: AsrResult = await asrProcessManager.transcribe(wavPath);

  onProgress?.({ stage: "finalizing", percent: 95 });

  // Cleanup temp file
  try {
    const fs = require("fs");
    fs.unlinkSync(wavPath);
  } catch {
    // Ignore cleanup errors
  }

  onProgress?.({ stage: "done", percent: 100 });

  return {
    ...result,
    tempWavPath: undefined, // Already cleaned up
  };
}

/**
 * Check if Sherpa-ONNX ASR is ready.
 */
export async function checkAsrReady(): Promise<{
  ready: boolean;
  modelPath: string;
  tokensPath: string;
}> {
  try {
    const status = await asrProcessManager.healthcheck();
    return {
      ready: status.status === "ready",
      modelPath: status.modelPath,
      tokensPath: status.tokensPath,
    };
  } catch (e) {
    return { ready: false, modelPath: "", tokensPath: "" };
  }
}
