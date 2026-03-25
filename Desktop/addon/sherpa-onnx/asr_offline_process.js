/**
 * Sherpa-ONNX ASR Offline Process
 *
 * Runs as a standalone Node.js child process. Receives audio file paths
 * via stdin JSON-RPC, performs offline ASR, and writes results to stdout.
 *
 * This keeps heavy ASR inference out of the Electron main process,
 * preventing renderer UI freezes (Memo AI architecture pattern).
 *
 * Usage: node asr_offline_process.js
 * Input:  JSON-RPC via stdin
 * Output: JSON-RPC via stdout
 */

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

// Resolve paths relative to this script's location
const SCRIPT_DIR = path.dirname(path.resolve(__filename));
const MODELS_BASE = path.join(SCRIPT_DIR, "..", "..", "models", "sherpa-onnx", "sense-voice-zh-en-ja-ko-yue");
const MODEL_PATH = path.join(MODELS_BASE, "model.onnx");
const TOKENS_PATH = path.join(MODELS_BASE, "tokens.txt");

// Use dynamic require for ESM-only package in CJS context
let sherpa_onnx = null;

function loadSherpaOnnx() {
  if (!sherpa_onnx) {
    try {
      // Try requiring as CommonJS first
      sherpa_onnx = require("sherpa-onnx-node");
    } catch (e) {
      // If CJS fails, use createRequire for ESM package
      const { createRequire } = require("module");
      const req = createRequire(__filename);
      sherpa_onnx = req("sherpa-onnx-node");
    }
  }
  return sherpa_onnx;
}

let recognizer = null;

function initRecognizer() {
  const lib = loadSherpaOnnx();
  if (recognizer) return;

  if (!fs.existsSync(MODEL_PATH)) {
    throw new Error(`Model not found: ${MODEL_PATH}`);
  }
  if (!fs.existsSync(TOKENS_PATH)) {
    throw new Error(`Tokens not found: ${TOKENS_PATH}`);
  }

  const config = {
    featConfig: {
      sampleRate: 16000,
      featureDim: 80,
    },
    modelConfig: {
      senseVoice: {
        model: MODEL_PATH,
        useInverseTextNormalization: 1,
      },
      tokens: TOKENS_PATH,
      numThreads: 2,
      provider: "cpu",
      debug: 0,
    },
  };

  recognizer = new lib.OfflineRecognizer(config);
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", method: "ready", params: {} }) + "\n");
}

/**
 * Perform ASR on the given audio file path.
 * @param {string} audioFilePath - Absolute path to a .wav file (16kHz mono)
 */
function transcribeFile(audioFilePath) {
  if (!recognizer) {
    initRecognizer();
  }
  const lib = loadSherpaOnnx();

  if (!fs.existsSync(audioFilePath)) {
    throw new Error(`Audio file not found: ${audioFilePath}`);
  }

  const startTime = Date.now();
  const stream = recognizer.createStream();
  const wave = lib.readWave(audioFilePath);

  // Validate sample rate
  if (wave.sampleRate !== 16000) {
    throw new Error(
      `Audio must be 16kHz, got ${wave.sampleRate}Hz. Please preprocess the audio first.`
    );
  }

  stream.acceptWaveform({ sampleRate: wave.sampleRate, samples: wave.samples });
  recognizer.decode(stream);
  const result = recognizer.getResult(stream);
  const elapsedMs = Date.now() - startTime;
  const durationSec = wave.samples.length / wave.sampleRate;
  const rtf = elapsedMs / 1000 / durationSec;

  return {
    text: result.text,
    duration: durationSec,
    elapsedMs,
    rtf: parseFloat(rtf.toFixed(3)),
    segments: result.segments || [],
  };
}

// --- JSON-RPC stdin/stdout communication ---

let messageBuffer = "";

process.stdin.on("data", (chunk) => {
  messageBuffer += chunk.toString();
  let newlineIndex;
  while ((newlineIndex = messageBuffer.indexOf("\n")) !== -1) {
    const raw = messageBuffer.slice(0, newlineIndex);
    messageBuffer = messageBuffer.slice(newlineIndex + 1);
    if (!raw.trim()) continue;
    try {
      const msg = JSON.parse(raw);
      handleMessage(msg);
    } catch (e) {
      sendError(null, -32700, `Parse error: ${e.message}`);
    }
  }
});

function sendResult(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}

function sendError(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n");
}

function sendNotification(method, params) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

function handleMessage(msg) {
  const { id, method, params } = msg;

  switch (method) {
    case "init": {
      try {
        initRecognizer();
        sendResult(id, { status: "ready" });
      } catch (e) {
        sendError(id, -32603, `Init failed: ${e.message}`);
      }
      break;
    }
    case "transcribe": {
      const { audioFilePath } = params;
      try {
        sendNotification("progress", { status: "transcribing", audioFilePath });
        const result = transcribeFile(audioFilePath);
        sendResult(id, result);
        sendNotification("progress", { status: "done", audioFilePath });
      } catch (e) {
        sendError(id, -32603, `Transcription failed: ${e.message}`);
      }
      break;
    }
    case "healthcheck": {
      sendResult(id, {
        status: recognizer ? "ready" : "not_initialized",
        modelPath: MODEL_PATH,
        tokensPath: TOKENS_PATH,
      });
      break;
    }
    default:
      sendError(id, -32601, `Method not found: ${method}`);
  }
}
