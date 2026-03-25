/**
 * ASR Model Configuration
 *
 * Defines available ASR models for the desktop client.
 * Currently: Sherpa-ONNX SenseVoice (local)
 * Planned:   Faster-Whisper (local, via Python subprocess)
 */

export interface AsrModelConfig {
  /** Unique identifier for this ASR model */
  id: string;
  /** Human-readable name */
  displayName: string;
  /** Short subtitle shown in UI */
  subtitle: string;
  /** Whether this model runs locally on the user's machine */
  isLocal: boolean;
  /** Whether this model requires internet (false = fully offline) */
  requiresInternet: boolean;
  /** Path to the model directory (for local models) */
  modelDir?: string;
  /** Model file name (for local models) */
  modelFile?: string;
  /** Tokens file name (for local models) */
  tokensFile?: string;
}

export const ASR_MODELS: AsrModelConfig[] = [
  {
    id: "sense-voice-local",
    displayName: "SenseVoice (本地)",
    subtitle: "完全本地运行，无需网络",
    isLocal: true,
    requiresInternet: false,
    modelDir: "models/sherpa-onnx/sense-voice-zh-en-ja-ko-yue",
    modelFile: "model.onnx",
    tokensFile: "tokens.txt",
  },
];

export function getAsrModel(id: string): AsrModelConfig | undefined {
  return ASR_MODELS.find((m) => m.id === id);
}

export function getDefaultAsrModel(): AsrModelConfig {
  return ASR_MODELS[0];
}
