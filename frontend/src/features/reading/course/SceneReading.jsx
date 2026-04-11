/**
 * SceneReading — Scene 1: Read the article with vocabulary highlights.
 */
import { Button } from "../../../shared/ui";
import { ArrowRight, BookOpen } from "lucide-react";
import { cn } from "../../../lib/utils";

function highlightWords(text, i1Words = [], aboveI1Words = []) {
  if (!text) return text;
  const i1Set = new Set(i1Words.map((w) => w.toLowerCase()));
  const aboveSet = new Set(aboveI1Words.map((w) => w.toLowerCase()));

  return text.split(/(\s+)/).map((token, idx) => {
    const clean = token.replace(/[^a-zA-Z'-]/g, "").toLowerCase();
    if (i1Set.has(clean)) {
      return (
        <span key={idx} className="underline decoration-emerald-400 decoration-2 underline-offset-2" title="i+1 vocabulary">
          {token}
        </span>
      );
    }
    if (aboveSet.has(clean)) {
      return (
        <span key={idx} className="underline decoration-amber-400 decoration-2 underline-offset-2" title="Above target level">
          {token}
        </span>
      );
    }
    return token;
  });
}

export function SceneReading({ pack, onComplete }) {
  const text = pack?.rewrittenText || pack?.originalText || "";
  const i1Words = pack?.validI1Words || [];
  const aboveI1Words = pack?.validAboveI1Words || [];
  const paragraphs = text.split("\n").filter(Boolean);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">阅读文章</h2>
            <p className="text-sm text-muted-foreground">Read through the article. Key vocabulary is highlighted.</p>
          </div>
        </div>

        {/* Legend */}
        <div className="flex gap-4 mb-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="w-4 h-0.5 bg-emerald-400 rounded" />
            i+1 词汇
          </span>
          <span className="flex items-center gap-1">
            <span className="w-4 h-0.5 bg-amber-400 rounded" />
            超纲词汇
          </span>
        </div>

        {/* Article */}
        <div className="prose prose-sm dark:prose-invert max-w-none space-y-4">
          {paragraphs.map((para, idx) => (
            <p key={idx} className="leading-7 text-[15px]">
              {highlightWords(para, i1Words, aboveI1Words)}
            </p>
          ))}
        </div>
      </div>

      {/* Continue bar */}
      <div className="border-t p-3 flex justify-end shrink-0 bg-background/95 backdrop-blur">
        <Button onClick={onComplete} className="gap-2">
          已读完，继续
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
