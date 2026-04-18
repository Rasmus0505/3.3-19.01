// 上传面板头部组件。
// 显示标题和 ASR 模型选择器。

import { useMemo } from 'react';
import { Badge } from '../../../shared/ui';
import { ASR_MODEL_KEYS, buildAsrModelCatalogMap } from '../../../shared/lib/asrModels';
import { formatMoneyYuanPerMinute } from '../../../shared/lib/money';
import type { UploadPanelState } from '../hooks/useUploadPanelState';

interface UploadPanelHeaderProps {
  state: UploadPanelState;
  onAsrModelChange: (model: string) => void;
}

export function UploadPanelHeader({ state, onAsrModelChange }: UploadPanelHeaderProps) {
  const { selectedAsrModel, selectedFile } = state;

  const asrModelCatalog = useMemo(() => buildAsrModelCatalogMap(), []);

  const currentModelInfo = useMemo(() => {
    return asrModelCatalog[selectedAsrModel] || null;
  }, [asrModelCatalog, selectedAsrModel]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">上传媒体文件</h2>
        {currentModelInfo && (
          <Badge variant="outline" className="text-xs">
            {currentModelInfo.label}
          </Badge>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">
          选择 ASR 模型
        </label>
        <select
          value={selectedAsrModel}
          onChange={(e) => onAsrModelChange(e.target.value)}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
        >
          {Object.entries(asrModelCatalog).map(([key, info]) => (
            <option key={key} value={key}>
              {info.label} - {info.description}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}


