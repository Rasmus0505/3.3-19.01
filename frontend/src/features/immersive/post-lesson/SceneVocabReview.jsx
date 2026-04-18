/**
 * SceneVocabReview — Scene 1: Vocabulary review from lesson Collins vocab.
 */
import { useState, useMemo } from "react";
import { Button, Card, Badge } from "../../../shared/ui";
import { ArrowRight, Puzzle, Check, X } from "lucide-react";

const Collins_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"];

function extractVocabFromLesson(lesson) {
  const seen = new Set();
  const words = [];

  for (const sentence of lesson?.sentences || []) {
    const wordLevels = sentence?.vocabulary_analysis_json?.word_levels;
    if (!wordLevels || typeof wordLevels !== "object") continue;

    for (const [word, info] of Object.entries(wordLevels)) {
      const lower = word.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      const level = typeof info === "object" ? info.final_level || info.level || "—" : String(info);
      words.push({
        word,
        level,
        context: sentence.text_en || "",
      });
    }
  }

  // Sort by Collins difficulty
  words.sort((a, b) => {
    const ia = Collins_ORDER.indexOf(a.level);
    const ib = Collins_ORDER.indexOf(b.level);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  return words.slice(0, 20);
}

export function SceneVocabReview({ lesson, onComplete, onSaveResults }) {
  const allWords = useMemo(() => extractVocabFromLesson(lesson), [lesson]);
  const [knownWords, setKnownWords] = useState(new Set());
  const [currentIdx, setCurrentIdx] = useState(0);

  const handleMark = (word, known) => {
    if (known) {
      setKnownWords((prev) => new Set([...prev, word]));
    }
    if (currentIdx < allWords.length - 1) {
      setCurrentIdx((prev) => prev + 1);
    }
  };

  const allReviewed = currentIdx >= allWords.length - 1 && allWords.length > 0;
  const currentWord = allWords[currentIdx];

  const handleComplete = () => {
    onSaveResults?.({
      knownCount: knownWords.size,
      learningCount: allWords.length - knownWords.size,
      totalCount: allWords.length,
    });
    onComplete();
  };

  if (allWords.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 gap-4">
        <Puzzle className="w-12 h-12 text-emerald-500" />
        <p className="text-muted-foreground">没有需要复习的词汇</p>
        <Button onClick={() => { onSaveResults?.({ knownCount: 0, learningCount: 0, totalCount: 0 }); onComplete(); }}>
          跳过
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-lg mx-auto">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center">
              <Puzzle className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">词汇回顾</h2>
              <p className="text-sm text-muted-foreground">复习 {allWords.length} 个词汇</p>
            </div>
          </div>

          {/* Progress */}
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
            <span>{currentIdx + 1} / {allWords.length}</span>
            <span>{knownWords.size} 个已掌握</span>
          </div>

          {/* Current word card */}
          <Card className="p-8 text-center mb-4">
            <Badge variant="outline" className="mb-3 text-xs">
              {currentWord.level}
            </Badge>
            <h3 className="text-2xl font-bold mb-2">{currentWord.word}</h3>
            {currentWord.context && (
              <p className="text-xs text-muted-foreground mt-2 line-clamp-2 italic">
                "{currentWord.context.length > 80 ? currentWord.context.slice(0, 80) + "…" : currentWord.context}"
              </p>
            )}
          </Card>

          {/* Actions */}
          <div className="flex gap-3 justify-center">
            <Button
              variant="outline"
              size="lg"
              className="gap-2 min-w-[120px]"
              onClick={() => handleMark(currentWord.word, false)}
            >
              <X className="w-4 h-4" />
              学习中
            </Button>
            <Button
              size="lg"
              className="gap-2 min-w-[120px]"
              onClick={() => handleMark(currentWord.word, true)}
            >
              <Check className="w-4 h-4" />
              已掌握
            </Button>
          </div>

          {/* Word list summary */}
          <div className="mt-8 flex flex-wrap gap-1.5">
            {allWords.map((w, idx) => (
              <Badge
                key={w.word}
                variant={knownWords.has(w.word) ? "default" : idx <= currentIdx ? "secondary" : "outline"}
                className="text-xs"
              >
                {w.word}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {/* Continue bar */}
      {allReviewed && (
        <div className="border-t p-3 flex justify-end shrink-0 bg-background/95 backdrop-blur">
          <Button onClick={handleComplete} className="gap-2">
            继续
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}


