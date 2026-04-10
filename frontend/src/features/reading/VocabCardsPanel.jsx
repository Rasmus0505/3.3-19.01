/**
 * VocabCardsPanel.jsx — 词汇卡片面板（Phase 42）
 * =================================================
 * 从阅读包词汇生成带定义、例句和 AI 图片的学习卡片。
 */
import { BookmarkPlus, Check, ImagePlus, RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "../../lib/utils";
import { getRewriteRecord, saveRewriteRecord } from "./readingRewriteDB";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function saveVocabCardsToRecord(articleId, vocabCards) {
  const existing = await getRewriteRecord(articleId);
  if (!existing) return;
  await saveRewriteRecord({ ...existing, vocabCards });
}

// ─── Word Selector ──────────────────────────────────────────────────────────

function WordSelector({ words, wordLevels, selected, onToggle }) {
  return (
    <div className="reading-cards__selector">
      <p className="reading-cards__selector-hint">
        选择要生成卡片的词汇（最多 10 个）
      </p>
      <div className="reading-cards__word-chips">
        {words.map((word) => {
          const level = wordLevels[word] || wordLevels[word.toLowerCase()] || "";
          const isSelected = selected.includes(word);
          const levelLower = (level || "").toLowerCase().replace("+", "-plus-");
          return (
            <button
              key={word}
              type="button"
              className={cn(
                "reading-cards__word-chip",
                isSelected && "reading-cards__word-chip--selected"
              )}
              onClick={() => onToggle(word)}
            >
              <span>{word}</span>
              {level ? (
                <span className={cn("reading-cards__chip-level", `analysis-level--${levelLower}`)}>
                  {level}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Single Card ────────────────────────────────────────────────────────────

function VocabCard({ card, onGenerateImage, onAddToWordbook }) {
  const [imageLoading, setImageLoading] = useState(false);
  const [added, setAdded] = useState(false);
  const [adding, setAdding] = useState(false);

  const levelLower = (card.cefr_level || "").toLowerCase().replace("+", "-plus-");

  async function handleImageGen() {
    setImageLoading(true);
    try {
      await onGenerateImage(card.word, card.definition, card.example_sentence);
    } finally {
      setImageLoading(false);
    }
  }

  async function handleAdd() {
    if (added || adding) return;
    setAdding(true);
    try {
      await onAddToWordbook(card.word);
      setAdded(true);
    } finally {
      setAdding(false);
    }
  }

  return (
    <article className="reading-cards__card">
      <div className="reading-cards__card-header">
        <h3 className="reading-cards__card-word">{card.word}</h3>
        {card.cefr_level ? (
          <span className={cn("reading-cards__card-level", `analysis-level--${levelLower}`)}>
            {card.cefr_level}
          </span>
        ) : null}
      </div>

      <p className="reading-cards__card-definition">{card.definition}</p>

      <div className="reading-cards__card-example">
        <span className="reading-cards__card-example-label">例句</span>
        <p>{card.example_sentence}</p>
      </div>

      {card.image_url ? (
        <div className="reading-cards__card-image">
          <img src={card.image_url} alt={`${card.word} illustration`} loading="lazy" />
        </div>
      ) : (
        <button
          className="reading-cards__image-btn"
          onClick={handleImageGen}
          disabled={imageLoading}
        >
          {imageLoading ? (
            <><div className="reading-cards__spinner" /><span>生成图片中…</span></>
          ) : (
            <><ImagePlus className="size-4" /><span>生成 AI 图片</span></>
          )}
        </button>
      )}

      <button
        className={cn(
          "reading-cards__add-btn",
          added && "reading-cards__add-btn--done"
        )}
        onClick={handleAdd}
        disabled={added || adding}
      >
        {added ? (
          <><Check className="size-3.5" /><span>已收录</span></>
        ) : (
          <><BookmarkPlus className="size-3.5" /><span>加入生词本</span></>
        )}
      </button>
    </article>
  );
}

// ─── VocabCardsPanel ────────────────────────────────────────────────────────

export function VocabCardsPanel({ pack, articleId, apiCall, accessToken }) {
  const [status, setStatus] = useState("idle"); // idle | selecting | loading | ready | error
  const [cards, setCards] = useState([]);
  const [selectedWords, setSelectedWords] = useState([]);

  const allWords = [
    ...(pack.validI1Words || []),
    ...(pack.validAboveI1Words || []),
  ];
  const wordLevels = pack.wordLevels || {};

  // Load persisted cards on mount
  useEffect(() => {
    getRewriteRecord(articleId).then((record) => {
      if (record?.vocabCards?.length) {
        setCards(record.vocabCards);
        setStatus("ready");
      }
    });
  }, [articleId]);

  const handleToggleWord = useCallback((word) => {
    setSelectedWords((prev) => {
      if (prev.includes(word)) return prev.filter((w) => w !== word);
      if (prev.length >= 10) {
        toast.info("最多选择 10 个词");
        return prev;
      }
      return [...prev, word];
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedWords(allWords.slice(0, 10));
  }, [allWords]);

  async function handleGenerate() {
    if (selectedWords.length === 0) {
      toast.info("请先选择词汇");
      return;
    }
    setStatus("loading");
    try {
      const resp = await apiCall("/api/vocab-cards/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          words: selectedWords.map((word) => ({
            word,
            cefr_level: wordLevels[word] || wordLevels[word.toLowerCase()] || null,
            context_sentence: null,
          })),
          target_level: pack.targetLevel || "B1",
          context_text: pack.rewrittenText || pack.originalText || "",
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        setStatus("error");
        return;
      }
      setCards(data.cards);
      setStatus("ready");
      await saveVocabCardsToRecord(articleId, data.cards);
    } catch {
      setStatus("error");
    }
  }

  async function handleGenerateImage(word, definition, exampleSentence) {
    try {
      const resp = await apiCall("/api/vocab-cards/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word, definition, example_sentence: exampleSentence }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        toast.error("图片生成失败");
        return;
      }
      // Update card with image_url
      setCards((prev) => {
        const next = prev.map((c) =>
          c.word.toLowerCase() === word.toLowerCase()
            ? { ...c, image_url: data.image_url }
            : c
        );
        saveVocabCardsToRecord(articleId, next);
        return next;
      });
      toast.success(`已生成「${word}」的图片`);
    } catch {
      toast.error("图片生成失败");
    }
  }

  async function handleAddToWordbook(word) {
    if (!accessToken) {
      toast.error("请先登录");
      return;
    }
    const card = cards.find((c) => c.word.toLowerCase() === word.toLowerCase());
    const resp = await apiCall("/api/wordbook/collect-freeform", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_text: word,
        entry_type: "word",
        context_sentence_en: card?.example_sentence || "",
        context_sentence_zh: "",
      }),
    });
    if (resp.ok) {
      toast.success(`已加入「${word}」到生词本`);
    } else {
      toast.error("加入生词本失败");
    }
  }

  // ─── Idle: show generate prompt ───────────────────────────────────────────

  if (status === "idle" || status === "selecting") {
    return (
      <div className="reading-cards reading-cards--idle">
        <div className="reading-cards__intro">
          <Sparkles className="size-5" />
          <div>
            <p className="reading-cards__intro-title">词汇卡片</p>
            <p className="reading-cards__intro-desc">
              选择阅读包中的词汇，AI 会生成带定义、例句和场景图的学习卡片
            </p>
          </div>
        </div>

        {allWords.length > 0 ? (
          <>
            <WordSelector
              words={allWords}
              wordLevels={wordLevels}
              selected={selectedWords}
              onToggle={handleToggleWord}
            />
            <div className="reading-cards__actions">
              <button
                className="reading-cards__select-all-btn"
                onClick={handleSelectAll}
                disabled={allWords.length === 0}
              >
                全选（前10个）
              </button>
              <button
                className="reading-cards__generate-btn"
                onClick={handleGenerate}
                disabled={selectedWords.length === 0}
              >
                生成 {selectedWords.length} 张卡片
              </button>
            </div>
          </>
        ) : (
          <p className="reading-cards__empty">暂无可用词汇</p>
        )}
      </div>
    );
  }

  // ─── Loading ──────────────────────────────────────────────────────────────

  if (status === "loading") {
    return (
      <div className="reading-cards reading-cards--loading">
        <div className="reading-cards__spinner" aria-label="生成中" />
        <p className="reading-cards__hint">AI 正在生成词汇卡片…</p>
      </div>
    );
  }

  // ─── Error ────────────────────────────────────────────────────────────────

  if (status === "error") {
    return (
      <div className="reading-cards reading-cards--error">
        <p className="reading-cards__hint reading-cards__hint--error">卡片生成失败，请重试</p>
        <button className="reading-cards__generate-btn" onClick={handleGenerate}>
          重试
        </button>
      </div>
    );
  }

  // ─── Ready: show cards ────────────────────────────────────────────────────

  return (
    <div className="reading-cards">
      <div className="reading-cards__header">
        <span className="reading-cards__count">{cards.length} 张卡片</span>
        <button
          className="reading-cards__regen-btn"
          onClick={() => { setStatus("idle"); setCards([]); }}
          title="重新选择词汇生成卡片"
        >
          <RefreshCw className="size-3.5" />
          重新生成
        </button>
      </div>

      <div className="reading-cards__grid">
        {cards.map((card) => (
          <VocabCard
            key={card.word}
            card={card}
            onGenerateImage={handleGenerateImage}
            onAddToWordbook={handleAddToWordbook}
          />
        ))}
      </div>
    </div>
  );
}
