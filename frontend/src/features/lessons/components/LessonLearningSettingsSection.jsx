import { cn } from "../../../lib/utils";
import { Alert, AlertDescription, Button, Switch } from "../../../shared/ui";
import { getShortcutLabel, SHORTCUT_ACTIONS, HINT_AFTER_REPLAY_OPTIONS } from "../../immersive/learningSettings";

export function LessonLearningSettingsSection({
  learningSettings,
  settingsError,
  recordingShortcutActionId,
  onPlaybackPreferenceChange,
  onRecordingShortcutActionChange,
}) {
  return (
    <section className="rounded-2xl border bg-muted/10 p-3 md:p-4">
      <p className="text-sm font-semibold text-foreground">学习参数</p>
      <div className="mt-2 flex items-center gap-3 border-b border-border/60 pb-3">
        <span className="text-sm text-foreground">答完自动重播本句</span>
        <Switch
          checked={learningSettings.playbackPreferences?.autoReplayAnsweredSentence !== false}
          onCheckedChange={(checked) => onPlaybackPreferenceChange("autoReplayAnsweredSentence", checked)}
        />
      </div>

      <div className="mt-2 flex items-center gap-3 border-b border-border/60 pb-3">
        <span className="text-sm text-foreground">重播提示触发次数</span>
        <select
          value={learningSettings.playbackPreferences?.hintAfterReplayCount ?? 3}
          onChange={(e) => onPlaybackPreferenceChange("hintAfterReplayCount", Number(e.target.value))}
          className="rounded-lg border border-border/60 bg-background px-2 py-1 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
        >
          {HINT_AFTER_REPLAY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div className="mt-3 flex flex-row flex-wrap items-stretch gap-3">
        {SHORTCUT_ACTIONS.map((action) => {
          const recording = recordingShortcutActionId === action.id;
          const shortcutLabel = getShortcutLabel(learningSettings.shortcuts[action.id]);
          const shortcutMissing = shortcutLabel === "未设置";
          return (
            <div key={action.id} className="flex w-fit min-w-0 flex-col rounded-2xl border bg-background/80 p-3">
              <div className="flex flex-1 flex-col gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-semibold text-foreground">{action.label}</p>
                  <p className={cn("text-sm break-all", shortcutMissing ? "font-semibold text-orange-500" : "text-muted-foreground")}>
                    {shortcutLabel}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={recording ? "default" : "outline"}
                  className="mt-auto self-start"
                  onClick={() => onRecordingShortcutActionChange(action.id)}
                >
                  {recording ? "请按键…" : "修改"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {settingsError ? (
        <Alert className="mt-3" variant="destructive">
          <AlertDescription>{settingsError}</AlertDescription>
        </Alert>
      ) : null}
    </section>
  );
}


