import { BookOpenText, BookmarkPlus, Check, Layers3, Sparkles } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { cn } from "../../lib/utils";
import { ArticlePanel } from "./ArticlePanel";
import { QuizPanel } from "./QuizPanel";
import { VocabCardsPanel } from "./VocabCardsPanel";

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

/**
 * 词汇卡片 — 单个词条，带「+ 生词本」按钮
 */
function VocabWordItem({ word, level, simplified, apiCall, accessToken }) {
  const [added, setAdded] = useState(false);
  const [adding, setAdding] = useState(false);

  const handleAdd = useCallback(async () => {
    if (added || adding) return;
    if (!accessToken || !apiCall) {
      toast.error("请先登录");
      return;
    }
    setAdding(true);
    try {
      const resp = await apiCall("/api/wordbook/collect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lesson_id: null,
          sentence_index: null,
          entry_text: word,
          entry_type: "word",
          start_token_index: null,
          end_token_index: null,
        }),
      });
      if (resp.ok) {
        setAdded(true);
        toast.success(`已加入「${word}」到生词本`);
      } else {
        toast.error("加入生词本失败");
      }
    } catch {
      toast.error("加入生词本失败");
    } finally {
      setAdding(false);
    }
  }, [added, adding, accessToken, apiCall, word]);

  const levelLower = (level || "").toLowerCase().replace("+", "-plus-");

  return (
    <div className="reading-pack__vocab-item">
      <div className="reading-pack__vocab-item-main">
        <span className="reading-pack__vocab-word">{word}</span>
        {level ? (
          <span className={cn("reading-pack__vocab-level", `analysis-level--${levelLower}`)}>
            {level}
          </span>
        ) : null}
        {simplified ? (
          <span className="reading-pack__vocab-simplified">→ {simplified}</span>
        ) : null}
      </div>
      <button
        className={cn(
          "reading-pack__vocab-add",
          added && "reading-pack__vocab-add--done"
        )}
        onClick={handleAdd}
        disabled={added || adding}
        title={added ? "已收录" : "加入生词本"}
      >
        {added ? (
          <Check className="size-3.5" />
        ) : (
          <BookmarkPlus className="size-3.5" />
        )}
        <span>{added ? "已收录" : "生词本"}</span>
      </button>
    </div>
  );
}

/**
 * 词汇面板（PACK-01 + PACK-02）
 * - i+1 词：来自 validI1Words
 * - 简化表达：来自 validAboveI1Words（超纲，被系统简化替换）
 */
function VocabPanel({ pack, apiCall, accessToken }) {
  const i1Words = pack.validI1Words || [];
  const aboveI1Words = pack.validAboveI1Words || [];
  const wordLevels = pack.wordLevels || {};
  const mappings = pack.mappings || [];

  // 构建「原词 → 简化后词」映射（来自 rewriteMappings）
  const simplifiedMap = {};
  for (const m of mappings) {
    if (m.confirmed && m.originalLower && m.rewritten) {
      simplifiedMap[m.originalLower] = m.rewritten;
    }
  }

  const hasI1 = i1Words.length > 0;
  const hasAboveI1 = aboveI1Words.length > 0;

  if (!hasI1 && !hasAboveI1) {
    return (
      <div className="reading-pack__vocab-empty">
        <p>暂无词汇数据</p>
      </div>
    );
  }

  return (
    <div className="reading-pack__vocab-panel">
      {hasI1 && (
        <section className="reading-pack__vocab-section">
          <div className="reading-pack__vocab-section-header">
            <span className="reading-pack__vocab-section-tag reading-pack__vocab-section-tag--i1">
              i+1 保留词
            </span>
            <span className="reading-pack__vocab-section-count">{i1Words.length} 个</span>
          </div>
          <p className="reading-pack__vocab-section-hint">
            这些词恰好在你的学习边界，系统保留了原词
          </p>
          <div className="reading-pack__vocab-list">
            {i1Words.map((word) => (
              <VocabWordItem
                key={word}
                word={word}
                level={wordLevels[word] || wordLevels[word.toLowerCase()]}
                simplified={null}
                apiCall={apiCall}
                accessToken={accessToken}
              />
            ))}
          </div>
        </section>
      )}

      {hasAboveI1 && (
        <section className="reading-pack__vocab-section">
          <div className="reading-pack__vocab-section-header">
            <span className="reading-pack__vocab-section-tag reading-pack__vocab-section-tag--above">
              超纲简化表达
            </span>
            <span className="reading-pack__vocab-section-count">{aboveI1Words.length} 个</span>
          </div>
          <p className="reading-pack__vocab-section-hint">
            这些词超过目标等级，系统已将其替换为更简单的表达
          </p>
          <div className="reading-pack__vocab-list">
            {aboveI1Words.map((word) => (
              <VocabWordItem
                key={word}
                word={word}
                level={wordLevels[word] || wordLevels[word.toLowerCase()]}
                simplified={simplifiedMap[word.toLowerCase()] || null}
                apiCall={apiCall}
                accessToken={accessToken}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * 下一步操作栏（PACK-04）
 */
function NextStepsBar({ packViewMode, onPackViewModeChange, onShowVocab, onGenerateDictation, dictationLoading }) {
  return (
    <div className="reading-pack__next-steps">
      <span className="reading-pack__next-steps-label">下一步</span>
      <div className="reading-pack__next-steps-actions">
        <button
          className={cn(
            "reading-pack__next-step-btn",
            packViewMode === "rewritten" && "reading-pack__next-step-btn--active"
          )}
          onClick={() => onPackViewModeChange("rewritten")}
        >
          继续阅读 i+1
        </button>
        <button
          className={cn(
            "reading-pack__next-step-btn",
            packViewMode === "comparison" && "reading-pack__next-step-btn--active"
          )}
          onClick={() => onPackViewModeChange("comparison")}
        >
          对比原文
        </button>
        <button
          className="reading-pack__next-step-btn"
          onClick={onShowVocab}
        >
          收集单词
        </button>
        {onGenerateDictation ? (
          <button
            className="reading-pack__next-step-btn"
            onClick={onGenerateDictation}
            disabled={dictationLoading}
          >
            {dictationLoading ? "生成中…" : "生成听写"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function ReadingPackPanel({
  pack,
  articleId,
  packViewMode = "original",
  onPackViewModeChange,
  contentWidth,
  onWidthChange,
  onLinesReady,
  selectedWords = [],
  onWordClick,
  activeLevels = [],
  apiCall,
  accessToken,
  onGenerateDictation,
  dictationLoading = false,
}) {
  if (!pack) {
    return null;
  }

  const wordCount = (pack.rewrittenText || pack.originalText || "").split(/\s+/).filter(Boolean).length;
  const isTooShort = wordCount < 100;

  const handleShowVocab = useCallback(() => {
    onPackViewModeChange("vocab");
  }, [onPackViewModeChange]);

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
          <TabsTrigger value="vocab">词汇</TabsTrigger>
          <TabsTrigger value="cards">卡片</TabsTrigger>
          {!isTooShort && <TabsTrigger value="quiz">测验</TabsTrigger>}
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

        <TabsContent value="vocab" className="reading-pack__tab-panel">
          <VocabPanel pack={pack} apiCall={apiCall} accessToken={accessToken} />
        </TabsContent>

        <TabsContent value="cards" className="reading-pack__tab-panel">
          <VocabCardsPanel pack={pack} articleId={articleId} apiCall={apiCall} accessToken={accessToken} />
        </TabsContent>

        {!isTooShort && (
          <TabsContent value="quiz" className="reading-pack__tab-panel">
            <QuizPanel pack={pack} articleId={articleId} apiCall={apiCall} accessToken={accessToken} />
          </TabsContent>
        )}
      </Tabs>

      <NextStepsBar
        packViewMode={packViewMode}
        onPackViewModeChange={onPackViewModeChange}
        onShowVocab={handleShowVocab}
        onGenerateDictation={onGenerateDictation}
        dictationLoading={dictationLoading}
      />
    </section>
  );
}
