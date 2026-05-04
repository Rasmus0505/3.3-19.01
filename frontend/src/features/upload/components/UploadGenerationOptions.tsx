// 生成选项（复选框网格）组件。

import { cn } from "../../../lib/utils";

interface GenerationOptionsValue {
  core_subtitles?: boolean;
  zh_translation?: boolean;
  vocabulary_annotation?: boolean;
  word_explanation?: boolean;
  forced_alignment?: boolean;
}

interface UploadGenerationOptionsProps {
  options: GenerationOptionsValue;
  disabled: boolean;
  mtCostHint: string | null;
  costHint: string | null;
  onOptionChange: (key: string, value: boolean) => void;
}

export function UploadGenerationOptions({
  options,
  disabled,
  mtCostHint,
  costHint,
  onOptionChange,
}: UploadGenerationOptionsProps) {
  return (
    <div className="space-y-3 rounded-2xl border bg-muted/10 px-4 py-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">生成内容</p>
        <p className="text-xs text-muted-foreground">英文字幕为必选项。关闭不需要的内容可以减少本次消耗。</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex items-start gap-3 rounded-xl border bg-background/80 px-3 py-3">
          <input type="checkbox" checked readOnly disabled className="mt-0.5 size-4 rounded border-input accent-primary" />
          <span className="space-y-1">
            <span className="block text-sm font-medium">英文字幕</span>
            <span className="block text-xs text-muted-foreground">课程最终使用句级时间戳；开启本地对齐后将覆盖 ASR 原始时间轴</span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-xl border bg-background/80 px-3 py-3">
          <input
            type="checkbox"
            checked={Boolean(options.zh_translation)}
            onChange={(event) => onOptionChange("zh_translation", event.target.checked)}
            disabled={disabled}
            className="mt-0.5 size-4 rounded border-input accent-primary"
          />
          <span className="space-y-1">
            <span className="block text-sm font-medium">中文翻译（qwen-mt-flash）</span>
            <span className="block text-xs text-muted-foreground">
              需要 DASHSCOPE_API_KEY，预计增加 {mtCostHint || "翻译成本"} 的显性消耗
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-xl border bg-background/80 px-3 py-3">
          <input
            type="checkbox"
            checked={Boolean(options.vocabulary_annotation)}
            onChange={(event) => {
              const checked = event.target.checked;
              onOptionChange("vocabulary_annotation", checked);
              if (!checked) {
                onOptionChange("word_explanation", false);
              }
            }}
            disabled={disabled}
            className="mt-0.5 size-4 rounded border-input accent-primary"
          />
          <span className="space-y-1">
            <span className="block text-sm font-medium">生词标注</span>
            <span className="block text-xs text-muted-foreground">生成 Collins 难度与重点词数据</span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-xl border bg-background/80 px-3 py-3">
          <input
            type="checkbox"
            checked={Boolean(options.forced_alignment)}
            onChange={(event) => onOptionChange("forced_alignment", event.target.checked)}
            disabled={disabled}
            className="mt-0.5 size-4 rounded border-input accent-primary"
          />
          <span className="space-y-1">
            <span className="block text-sm font-medium">启用本地时间戳对齐</span>
            <span className="block text-xs text-muted-foreground">使用本机 Qwen3-ForcedAligner 重算词级和句级时间戳；若失败，本次生成将直接失败</span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-xl border bg-background/80 px-3 py-3">
          <input
            type="checkbox"
            checked={Boolean(options.word_explanation)}
            onChange={(event) => {
              const checked = event.target.checked;
              onOptionChange("word_explanation", checked);
              if (checked) {
                onOptionChange("vocabulary_annotation", true);
              }
            }}
            disabled={disabled}
            className="mt-0.5 size-4 rounded border-input accent-primary"
          />
          <span className="space-y-1">
            <span className="block text-sm font-medium">生词讲解</span>
            <span className="block text-xs text-muted-foreground">自动依赖生词标注，生成关键词解释与听力提示</span>
          </span>
        </label>
      </div>
      {costHint ? <p className="text-xs text-muted-foreground">{costHint}</p> : null}
    </div>
  );
}
