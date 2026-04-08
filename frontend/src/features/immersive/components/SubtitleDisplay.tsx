"""沉浸式学习字幕展示组件。"""
import { memo } from 'react';
import type { Sentence, Word } from './immersiveTypes';

interface SubtitleDisplayProps {
  sentence: Sentence | null;
  isActive: boolean;
  onWordClick?: (word: Word) => void;
}

export const SubtitleDisplay = memo(function SubtitleDisplay({
  sentence,
  isActive,
  onWordClick,
}: SubtitleDisplayProps) {
  if (!sentence) {
    return (
      <div className="flex h-32 items-center justify-center text-muted-foreground">
        <span className="text-sm">请选择课程开始学习</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 原文字幕 */}
      <div
        className={`
          rounded-xl p-6 text-center transition-all duration-300
          ${isActive
            ? 'bg-primary/10 border border-primary/30 shadow-lg'
            : 'bg-muted/50'
          }
        `}
      >
        <p className="text-2xl font-medium leading-relaxed">
          {sentence.words ? (
            <span>
              {sentence.words.map((word, idx) => (
                <span
                  key={idx}
                  onClick={() => onWordClick?.(word)}
                  className={onWordClick ? 'cursor-pointer hover:text-primary' : ''}
                >
                  {word.text}{' '}
                </span>
              ))}
            </span>
          ) : (
            sentence.text
          )}
        </p>
      </div>

      {/* 翻译字幕 */}
      {sentence.translation && (
        <div className="rounded-lg bg-muted/30 p-4 text-center">
          <p className="text-lg text-muted-foreground">
            {sentence.translation}
          </p>
        </div>
      )}
    </div>
  );
});
