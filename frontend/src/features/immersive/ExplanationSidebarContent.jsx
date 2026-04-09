import { useEffect, useRef } from 'react';
import { Play, RotateCcw, BookOpen } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';

/**
 * 侧边栏内的讲解内容
 * 用于右侧 AI 陪看 侧边栏
 */
export default function ExplanationSidebarContent({
  sentence,
  explanation,
  audioUrl,
  onReplay,
  onStartPractice,
}) {
  const audioRef = useRef(null);

  // 自动播放音频（当 audioUrl 变化时）
  useEffect(() => {
    if (audioUrl && audioRef.current) {
      audioRef.current.src = audioUrl;
      audioRef.current.play().catch(() => {
        // autoplay 被浏览器阻止，静默忽略
      });
    }
  }, [audioUrl]);

  if (!explanation) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        暂无讲解内容
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <audio ref={audioRef} className="hidden" />

      {/* 标题区 */}
      <div className="flex items-center gap-2 mb-3">
        <Play className="w-4 h-4 text-blue-600 flex-shrink-0" />
        <span className="text-sm font-semibold text-foreground">听力讲解</span>
        {audioUrl && (
          <span className="ml-auto text-xs text-green-600 flex-shrink-0">🔊</span>
        )}
      </div>

      {/* 可滚动内容区 */}
      <div className="flex-1 overflow-y-auto text-sm space-y-3 pr-1">

        {/* 简化句 */}
        {explanation.simplified_sentence && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">简化句</p>
            <div className="bg-neutral-100 dark:bg-neutral-800 rounded-md p-2">
              <p className="text-sm leading-relaxed">{explanation.simplified_sentence}</p>
            </div>
          </div>
        )}

        {/* 关键词解释 */}
        {explanation.key_explanations?.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">关键词解释</p>
            <div className="space-y-1">
              {explanation.key_explanations.map((exp, idx) => (
                <div
                  key={idx}
                  className="bg-neutral-50 dark:bg-neutral-900 rounded-md p-2"
                >
                  <div className="flex items-start gap-1.5">
                    <Badge variant="outline" className="text-xs flex-shrink-0 mt-0.5">
                      {exp.original_word}
                    </Badge>
                    <span className="text-xs leading-relaxed text-neutral-700 dark:text-neutral-300">
                      {exp.explanation}
                    </span>
                  </div>
                  {exp.simple_example && (
                    <p className="text-xs text-neutral-400 mt-1 ml-1">
                      例: {exp.simple_example}
                    </p>
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
      </div>

      {/* 底部操作按钮 */}
      <div className="flex gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-700 mt-2">
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
  );
}
