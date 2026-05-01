import { Languages, Plus, X } from "lucide-react";

import { Button } from "../../shared/ui";

export default function WordbookSelectionToolbar({
  selectedText = "",
  translationText = "",
  busy = false,
  translationBusy = false,
  onTranslate,
  onCollect,
  onClear,
}) {
  if (!selectedText) return null;

  return (
    <div className="immersive-wordbook-selection-toolbar" onPointerDown={(event) => event.stopPropagation()}>
      <div className="immersive-wordbook-selection-toolbar__text">
        <span>{selectedText}</span>
        {translationText ? <small>{translationText}</small> : null}
      </div>
      <div className="immersive-wordbook-selection-toolbar__actions">
        <Button type="button" size="sm" variant="outline" disabled={translationBusy} onClick={onTranslate}>
          <Languages className="size-4" />
          {translationBusy ? "翻译中" : "翻译"}
        </Button>
        <Button type="button" size="sm" disabled={busy} onClick={onCollect}>
          <Plus className="size-4" />
          {busy ? "加入中" : "加入生词本"}
        </Button>
        <Button type="button" size="icon-sm" variant="ghost" aria-label="清除选择" onClick={onClear}>
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}
