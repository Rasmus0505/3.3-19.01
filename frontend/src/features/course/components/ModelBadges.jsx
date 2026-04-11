/**
 * ModelBadges — Display which AI models were used in generating the course.
 */
import { Badge } from "../../../shared/ui";
import { Cpu } from "lucide-react";

const MODEL_LABELS = {
  "deepseek-v3.2": "LLM",
  "qwen3-asr": "ASR",
  "qwen-mt": "Translation",
  "qwen-tts": "TTS",
  "qwen-vl-plus": "OCR",
  "qwen-image": "Image Gen",
  "qwen3-tts": "TTS",
  "qwen3-tts-flash": "TTS",
};

const MODEL_COLORS = {
  "deepseek-v3.2": "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300",
  "qwen3-asr": "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  "qwen-mt": "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  "qwen-tts": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  "qwen-vl-plus": "bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300",
  "qwen-image": "bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300",
  "qwen3-tts": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  "qwen3-tts-flash": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
};

export function ModelBadges({ models, className }) {
  if (!models?.length) return null;

  return (
    <div className={`flex flex-wrap gap-1.5 items-center ${className || ""}`}>
      <Cpu className="w-3.5 h-3.5 text-muted-foreground" />
      {models.map((model) => (
        <Badge
          key={model}
          variant="secondary"
          className={`text-[10px] px-1.5 py-0 font-medium ${MODEL_COLORS[model] || "bg-muted text-muted-foreground"}`}
        >
          {MODEL_LABELS[model] || model}
        </Badge>
      ))}
    </div>
  );
}
