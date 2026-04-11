/**
 * SceneVocabPractice — Scene 3: Vocabulary practice from the article.
 *
 * MVP: Shows key vocabulary with meanings. Users mark each as "known" or "learning".
 */
import { useState } from "react";
import { Button, Card, Badge } from "../../../shared/ui";
import { ArrowRight, Puzzle, Check, X } from "lucide-react";

export function SceneVocabPractice({ pack, courseData, onComplete }) {
  const i1Words = pack?.validI1Words || [];
  const aboveI1Words = pack?.validAboveI1Words || [];
  const discussionVocab = courseData?.discussion?.key_vocabulary || [];

  // Combine and deduplicate
  const allWords = [...new Set([...discussionVocab, ...i1Words, ...aboveI1Words])].slice(0, 15);
  const wordLevels = pack?.wordLevels || {};

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

  if (allWords.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 gap-4">
        <Puzzle className="w-12 h-12 text-emerald-500" />
        <p className="text-muted-foreground">No vocabulary to practice.</p>
        <Button onClick={onComplete}>Continue</Button>
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
              <h2 className="text-lg font-semibold">词汇练习</h2>
              <p className="text-sm text-muted-foreground">{allWords.length} words to review</p>
            </div>
          </div>

          {/* Progress */}
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
            <span>{currentIdx + 1} / {allWords.length}</span>
            <span>{knownWords.size} marked as known</span>
          </div>

          {/* Current word card */}
          <Card className="p-8 text-center mb-4">
            <Badge variant="outline" className="mb-3 text-xs">
              {wordLevels[currentWord] || "—"}
            </Badge>
            <h3 className="text-2xl font-bold mb-2">{currentWord}</h3>
            <p className="text-sm text-muted-foreground">
              Do you know this word?
            </p>
          </Card>

          {/* Actions */}
          <div className="flex gap-3 justify-center">
            <Button
              variant="outline"
              size="lg"
              className="gap-2 min-w-[120px]"
              onClick={() => handleMark(currentWord, false)}
            >
              <X className="w-4 h-4" />
              Learning
            </Button>
            <Button
              size="lg"
              className="gap-2 min-w-[120px]"
              onClick={() => handleMark(currentWord, true)}
            >
              <Check className="w-4 h-4" />
              I Know
            </Button>
          </div>

          {/* Word list summary */}
          <div className="mt-8 flex flex-wrap gap-1.5">
            {allWords.map((word, idx) => (
              <Badge
                key={word}
                variant={knownWords.has(word) ? "default" : idx <= currentIdx ? "secondary" : "outline"}
                className="text-xs"
              >
                {word}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {/* Continue bar */}
      {allReviewed && (
        <div className="border-t p-3 flex justify-end shrink-0 bg-background/95 backdrop-blur">
          <Button onClick={onComplete} className="gap-2">
            继续
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
