// 沉浸式学习滚动字幕展示组件
import { memo, useRef, useEffect } from 'react';
import { cn } from '../../../lib/utils';

interface SubtitleDisplayProps {
  // 上一句（已完成）
  previousSentence?: {
    text_en: string;
    text_zh: string;
  } | null;
  // 当前句（正在拼写）
  currentSentence?: {
    text_en: string;
    text_zh: string;
  } | null;
  // 下一句（未开始）
  nextSentence?: {
    text_en: string;
  } | null;
  // 当前句用户输入状态
  wordInputs?: string[];
  expectedTokens?: string[];
  // 当前句是否完成（显示翻译）
  currentSentenceCompleted?: boolean;
  // 总句数
  sentenceCount?: number;
  // 当前句子索引
  currentSentenceIndex?: number;
  // 类名
  className?: string;
}

// 将句子文本转换为下划线（每个字符一个下划线，保持空格）
function textToUnderscores(text: string): string {
  return text.split('').map(char => char === ' ' ? ' ' : '_').join('');
}

// 将句子文本转换为用户输入显示（输入的显示为字母，未输入的显示为下划线）
function textToUserInput(text_en: string, wordInputs: string[], expectedTokens: string[]): React.ReactNode {
  if (!expectedTokens || expectedTokens.length === 0) {
    return textToUnderscores(text_en);
  }

  // 重建用户输入的完整字符串
  const fullInput = wordInputs?.join('') || '';

  return (
    <span>
      {expectedTokens.map((token, tokenIdx) => {
        const inputForToken = wordInputs?.[tokenIdx] || '';
        // 每个 token 内部的每个字符
        return token.split('').map((char, charIdx) => {
          const globalIdx = tokenIdx + charIdx;
          const inputChar = inputForToken[charIdx] || '_';
          return (
            <span
              key={`${tokenIdx}-${charIdx}`}
              className={cn(
                inputChar !== '_' ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {inputChar}
            </span>
          );
        });
      })}
    </span>
  );
}

export const SubtitleDisplay = memo(function SubtitleDisplay({
  previousSentence,
  currentSentence,
  nextSentence,
  wordInputs = [],
  expectedTokens = [],
  currentSentenceCompleted = false,
  sentenceCount = 0,
  currentSentenceIndex = 0,
  className,
}: SubtitleDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // 自动滚动到当前句
  useEffect(() => {
    if (containerRef.current && currentSentenceCompleted) {
      // 拼写完成后，滚动到下一句
      containerRef.current.scrollTop += 150;
    }
  }, [currentSentenceCompleted, currentSentenceIndex]);

  return (
    <div
      ref={containerRef}
      className={cn("immersive-subtitle-display overflow-y-auto h-full p-4 space-y-4", className)}
    >
      {/* 标题 */}
      <div className="text-sm text-muted-foreground mb-2">
        第 {currentSentenceIndex + 1} / {sentenceCount} 句
      </div>

      {/* 上一句（已完成 - 显示原文和翻译） */}
      {previousSentence && (
        <div className="immersive-subtitle-card immersive-subtitle-card--previous">
          <div className="text-lg leading-relaxed">
            {previousSentence.text_en}
          </div>
          <div className="text-sm text-muted-foreground mt-2">
            {previousSentence.text_zh}
          </div>
        </div>
      )}

      {/* 当前句（正在拼写） */}
      {currentSentence && (
        <div className="immersive-subtitle-card immersive-subtitle-card--current">
          <div className="text-lg leading-relaxed">
            {textToUserInput(currentSentence.text_en, wordInputs, expectedTokens)}
          </div>
          {/* 完成后显示翻译 */}
          {currentSentenceCompleted && (
            <div className="text-sm text-muted-foreground mt-2">
              {currentSentence.text_zh}
            </div>
          )}
        </div>
      )}

      {/* 下一句（未开始 - 只显示下划线） */}
      {nextSentence && (
        <div className="immersive-subtitle-card immersive-subtitle-card--next">
          <div className="text-lg leading-relaxed text-muted-foreground">
            {textToUnderscores(nextSentence.text_en)}
          </div>
        </div>
      )}
    </div>
  );
});


