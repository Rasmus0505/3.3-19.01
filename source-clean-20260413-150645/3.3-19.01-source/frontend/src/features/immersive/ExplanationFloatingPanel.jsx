import { useEffect, useRef, useState } from 'react';
import { Play, RotateCcw, BookOpen, X, ChevronRight } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';

/**
 * 浮动讲解面板 - 沉浸模式专用
 * 显示在视频区域右下角，可折叠/展开
 */
export default function ExplanationFloatingPanel({
  explanation,
  audioUrl,
  onReplay,
  onStartPractice,
  visible,
}) {
  const audioRef = useRef(null);
  const [collapsed, setCollapsed] = useState(false);

  // 自动播放
  useEffect(() => {
    if (visible && audioUrl && audioRef.current && !collapsed) {
      audioRef.current.src = audioUrl;
      audioRef.current.play().catch(() => {});
    }
  }, [visible, audioUrl, collapsed]);

  if (!visible || !explanation) return null;

  return (
    <div
      className="absolute bottom-4 right-4 z-20 w-80 max-w-[calc(100vw-2rem)]"
      style={{ maxHeight: "calc(100vh - 8rem)", overflow: "hidden" }}
    >
      <div className="bg-background border border-border rounded-xl shadow-lg flex flex-col overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border flex-shrink-0">
          <Play className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <span className="text-sm font-semibold flex-1">听力讲解</span>
          {audioUrl && <span className="text-xs text-green-600">🔊</span>}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 hover:bg-accent rounded"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <X className="w-4 h-4" />}
          </button>
        </div>

        {/* 内容 */}
        {!collapsed && (
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            <audio ref={audioRef} className="hidden" />

            {/* 简化句 */}
            {explanation.simplified_sentence && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">简化句</p>
                <div className="bg-neutral-100 dark:bg-neutral-800 rounded-md p-2">
                  <p className="text-sm leading-relaxed">{explanation.simplified_sentence}</p>
                </div>
              </div>
            )}

            {/* 关键词 */}
            {explanation.key_explanations?.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">关键词</p>
                <div className="space-y-1">
                  {explanation.key_explanations.map((exp, idx) => (
                    <div key={idx} className="bg-neutral-50 dark:bg-neutral-900 rounded-md p-2">
                      <div className="flex items-start gap-1.5">
                        <Badge variant="outline" className="text-xs flex-shrink-0 mt-0.5">
                          {exp.original_word}
                        </Badge>
                        <span className="text-xs leading-relaxed text-neutral-700 dark:text-neutral-300">
                          {exp.explanation}
                        </span>
                      </div>
                      {exp.simple_example && (
                        <p className="text-xs text-neutral-400 mt-1 ml-1">例: {exp.simple_example}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 听力技巧 */}
            {explanation.listen_tips && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">听力技巧</p>
                <p className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
                  {explanation.listen_tips}
                </p>
              </div>
            )}

            {/* 操作 */}
            <div className="flex gap-2 pt-1 border-t border-neutral-200 dark:border-neutral-700">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs h-8"
                onClick={onReplay}
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                重播
              </Button>
              <Button
                size="sm"
                className="flex-1 text-xs h-8"
                onClick={onStartPractice}
              >
                <BookOpen className="w-3 h-3 mr-1" />
                练习
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
