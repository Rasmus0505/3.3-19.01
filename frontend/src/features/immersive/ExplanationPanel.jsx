import React, { useEffect, useRef } from 'react';
import { Play, RotateCcw, BookOpen } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';

const ExplanationPanel = ({
  sentence,
  explanation,
  onReplay,
  onStartPractice,
  audioUrl
}) => {
  const audioRef = useRef(null);

  useEffect(() => {
    if (audioUrl && audioRef.current) {
      audioRef.current.src = audioUrl;
      audioRef.current.play().catch(console.error);
    }
  }, [audioUrl]);

  const handleReplay = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(console.error);
    }
    onReplay?.();
  };

  const handleStartPractice = () => {
    onStartPractice?.();
  };

  if (!explanation) {
    return null;
  }

  return (
    <Card className="max-w-xl mx-auto my-4">
      <CardContent className="pt-6">
        <audio ref={audioRef} />

        <div className="flex items-center gap-2 mb-4">
          <Play className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold">听力讲解</h3>
        </div>

        <div className="border-t border-neutral-200 dark:border-neutral-800 my-4" />

        {/* 简化句 - 不再显示 */}
        {explanation.simplified_sentence && (
          <div className="mb-6">
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-2">简化句：</p>
            <div className="italic bg-neutral-100 dark:bg-neutral-800 p-4 rounded-md">
              <p className="text-base">{explanation.simplified_sentence}</p>
            </div>
          </div>
        )}

        {/* 关键词解释 */}
        {explanation.key_explanations?.length > 0 && (
          <div className="mb-6">
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-2">关键词解释：</p>
            <div className="border border-neutral-200 dark:border-neutral-700 rounded-md overflow-hidden">
              {explanation.key_explanations.map((exp, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-white dark:bg-neutral-900 last:border-b-0 border-b border-neutral-200 dark:border-neutral-700"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline">{exp.original_word}</Badge>
                    <span className="text-sm text-neutral-600 dark:text-neutral-400">
                      {exp.explanation}
                    </span>
                  </div>
                  {exp.simple_example && (
                    <p className="text-xs text-neutral-400 dark:text-neutral-500 ml-10">
                      例: {exp.simple_example}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 听力提示 */}
        {explanation.listen_tips && (
          <div className="mb-6">
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-2">听力技巧：</p>
            <p className="text-sm">{explanation.listen_tips}</p>
          </div>
        )}

        <div className="border-t border-neutral-200 dark:border-neutral-800 my-4" />

        {/* 操作按钮 */}
        <div className="flex gap-4 justify-center">
          <Button
            variant="outline"
            onClick={handleReplay}
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            重新播放
          </Button>
          <Button onClick={handleStartPractice}>
            <BookOpen className="w-4 h-4 mr-2" />
            开始拼写练习
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default ExplanationPanel;


