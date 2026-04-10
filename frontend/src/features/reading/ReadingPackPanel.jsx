import { BookOpenText, Layers3, Sparkles } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { cn } from "../../lib/utils";
import { ArticlePanel } from "./ArticlePanel";

function SummaryMetric({ label, value }) {
  return (
    <div className="reading-pack__summary-metric">
      <span className="reading-pack__summary-label">{label}</span>
      <strong className="reading-pack__summary-value">{value}</strong>
    </div>
  );
}

function ComparisonCards({ cards = [] }) {
  return (
    <div className="reading-pack__comparison-list">
      {cards.map((card) => (
        <article key={card.id} className="reading-pack__comparison-card">
          <div className="reading-pack__comparison-block reading-pack__comparison-block--muted">
            <span className="reading-pack__comparison-tag">原句</span>
            <p>{card.originalText}</p>
          </div>
          <div className="reading-pack__comparison-block">
            <span className="reading-pack__comparison-tag">i+1</span>
            <p>{card.rewrittenText}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

export function ReadingPackPanel({
  pack,
  packViewMode = "original",
  onPackViewModeChange,
  contentWidth,
  onWidthChange,
  onLinesReady,
  selectedWords = [],
  onWordClick,
  activeLevels = [],
}) {
  if (!pack) {
    return null;
  }

  return (
    <section className="reading-pack">
      <div className="reading-pack__header">
        <div>
          <div className="reading-pack__eyebrow-row">
            <p className="reading-pack__eyebrow">阅读包资产页</p>
            <span className="reading-pack__status">
              <Sparkles className="size-4" />
              已生成阅读包
            </span>
          </div>
          <h2 className="reading-pack__title">这份材料现在是一份可回看的阅读包</h2>
          <p className="reading-pack__copy">
            你可以在原文、i+1 版本和逐句对照之间切换，理解系统保留了什么、简化了什么。
          </p>
        </div>
        <div className="reading-pack__meta-stack">
          <span className="reading-pack__badge">
            <BookOpenText className="size-4" />
            目标 {pack.targetLevel || "--"}
          </span>
          <span className="reading-pack__badge reading-pack__badge--muted">
            <Layers3 className="size-4" />
            {pack.assembledAt ? new Date(pack.assembledAt).toLocaleString("zh-CN") : "刚刚生成"}
          </span>
        </div>
      </div>

      <div className="reading-pack__summary">
        <SummaryMetric label="材料难度" value={pack.diagnosticSummary?.materialDifficulty || "--"} />
        <SummaryMetric label="保留 i+1 词" value={pack.diagnosticSummary?.preservedI1Count ?? 0} />
        <SummaryMetric label="超纲表达" value={pack.diagnosticSummary?.aboveI1Count ?? 0} />
      </div>

      <Tabs value={packViewMode} onValueChange={onPackViewModeChange} className="reading-pack__tabs">
        <TabsList className="reading-pack__tabs-list">
          <TabsTrigger value="original">原文</TabsTrigger>
          <TabsTrigger value="rewritten">i+1</TabsTrigger>
          <TabsTrigger value="comparison">逐句对照</TabsTrigger>
        </TabsList>

        <TabsContent value="original" className="reading-pack__tab-panel">
          <ArticlePanel
            text={pack.originalText}
            contentWidth={contentWidth}
            onWidthChange={onWidthChange}
            onWordClick={onWordClick}
            onLinesReady={onLinesReady}
            selectedWords={selectedWords}
            activeLevels={activeLevels}
            rewriteMappings={pack.mappings || []}
            validI1Words={pack.validI1Words || []}
            validAboveI1Words={pack.validAboveI1Words || []}
            removedWords={pack.removedWords || []}
            wordLevels={pack.wordLevels || {}}
            viewMode="original"
          />
        </TabsContent>

        <TabsContent value="rewritten" className="reading-pack__tab-panel">
          <ArticlePanel
            text={pack.rewrittenText}
            contentWidth={contentWidth}
            onWidthChange={onWidthChange}
            onWordClick={onWordClick}
            onLinesReady={onLinesReady}
            selectedWords={selectedWords}
            activeLevels={activeLevels}
            rewriteMappings={pack.mappings || []}
            validI1Words={pack.validI1Words || []}
            validAboveI1Words={pack.validAboveI1Words || []}
            removedWords={pack.removedWords || []}
            wordLevels={pack.wordLevels || {}}
            viewMode="rewritten"
          />
        </TabsContent>

        <TabsContent value="comparison" className="reading-pack__tab-panel reading-pack__tab-panel--comparison">
          <ComparisonCards cards={pack.comparisonCards || []} />
        </TabsContent>
      </Tabs>
    </section>
  );
}
