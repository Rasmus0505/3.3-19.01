import { describe, expect, it } from "vitest";

import {
  getShortcutLabel,
  sanitizeLearningSettings,
} from "./learningSettings";

describe("learningSettings playback rate shortcuts", () => {
  it("provides visible default shortcuts for playback rate adjustment", () => {
    const settings = sanitizeLearningSettings({});

    expect(getShortcutLabel(settings.shortcuts.playback_rate_down)).toBe("Shift+ArrowDown");
    expect(getShortcutLabel(settings.shortcuts.playback_rate_up)).toBe("Shift+ArrowUp");
  });

  it("does not overwrite a user configured playback rate shortcut", () => {
    const settings = sanitizeLearningSettings({
      shortcuts: {
        playback_rate_up: { code: "PageUp", key: "pageup", shift: false },
      },
    });

    expect(getShortcutLabel(settings.shortcuts.playback_rate_up)).toBe("PageUp");
    expect(getShortcutLabel(settings.shortcuts.playback_rate_down)).toBe("Shift+ArrowDown");
  });
});
