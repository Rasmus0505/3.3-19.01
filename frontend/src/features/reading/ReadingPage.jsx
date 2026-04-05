/**
 * ReadingPage.jsx — 阅读板块根组件
 * =================================
 * 方案 A 布局：文章主体（左侧）+ 词边栏（右侧固定）
 * CEFR 着色的词渲染由 ArticlePanel 提供，
 * 词选状态在 ReadingPage 内提升管理。
 */
import { lazy, Suspense, useCallback, useState } from "react";
import { readCefrLevel } from "../../app/authStorage";
import { computeCefrClassName } from "./ArticlePanel";

const ArticlePanel = lazy(() => import("./ArticlePanel").then((m) => ({ default: m.ArticlePanel })));
const WordSidebar = lazy(() => import("./WordSidebar").then((m) => ({ default: m.WordSidebar })));

/**
 * Demo 文章（约 400 词，CEFR B1-B2 难度）
 * Phase 28 将从课程列表或 API 动态加载真实文章。
 */
const DEMO_ARTICLE = `The Art of Reading in a Digital Age

In the modern world, reading has evolved beyond the traditional paper-and-ink experience. Digital platforms have transformed how we consume written content, offering new possibilities for language learners and avid readers alike.

One of the most significant advantages of digital reading is accessibility. With a smartphone or tablet, learners can access thousands of texts at any moment. This democratization of knowledge has made it easier for people around the globe to improve their literacy skills and expand their vocabulary.

However, this abundance of content also presents challenges. How can learners effectively navigate through the overwhelming amount of material available online? The answer lies in developing strategic reading habits and leveraging tools that support comprehension.

Contextual vocabulary learning represents one of the most effective approaches to language acquisition. Rather than memorizing isolated words from flash cards, learners benefit from encountering new vocabulary in meaningful passages. This method allows readers to infer the meaning of unfamiliar words from surrounding context clues.

The integration of technology into reading practice offers exciting opportunities. Adaptive platforms can analyze a reader's current proficiency level and select appropriate texts. Such personalization ensures that learners are consistently challenged without becoming frustrated by content that exceeds their current abilities.

Moreover, the ability to interact with text—highlighting, annotating, and looking up words instantly—creates a more engaging learning experience. These interactive features transform passive reading into an active dialogue between the reader and the text.

As we look to the future, the boundaries between reading, learning, and entertainment continue to blur. The most successful learners will be those who approach digital reading not as a chore, but as an adventure in discovery.`;

function PageFallback() {
  return (
    <div className="flex gap-4">
      <div className="flex-1 space-y-3">
        {[80, 95, 70, 90, 60, 85, 75].map((w, i) => (
          <div key={i} className="h-5 animate-pulse rounded bg-muted" style={{ width: `${w}%` }} />
        ))}
      </div>
      <div className="w-72 shrink-0 space-y-2 rounded-xl border bg-muted/30 p-4">
        {[1, 2, 3].map((n) => (
          <div key={n} className="h-10 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    </div>
  );
}

/**
 * ReadingPage — 阅读板块入口组件
 *
 * @param {object} props
 * @param {string} props.accessToken — 用户 access token（用于 API 调用）
 */
export function ReadingPage({ accessToken }) {
  const [contentWidth, setContentWidth] = useState(640);
  const [selectedWords, setSelectedWords] = useState([]);

  const handleWordClick = useCallback((word, segment) => {
    setSelectedWords((prev) => {
      const exists = prev.some((w) => w.word === word);
      if (exists) {
        return prev.filter((w) => w.word !== word);
      }
      const userLevel = readCefrLevel() || "B1";
      const cefrClass = computeCefrClassName(segment.cefrLevel, userLevel);
      return [
        ...prev,
        { word, cefrLevel: segment.cefrLevel, cefrClass },
      ];
    });
  }, []);

  const handleRemoveWord = useCallback((item) => {
    setSelectedWords((prev) => prev.filter((w) => w.word !== item.word));
  }, []);

  const handleAddAllToWordbook = useCallback(() => {
    if (selectedWords.length === 0) return;
    console.warn("[ReadingPage] onAddAllToWordbook — Phase 28 实现");
  }, [selectedWords]);

  return (
    <Suspense fallback={<PageFallback />}>
      <div className="reading-layout">
        <ArticlePanel
          text={DEMO_ARTICLE}
          contentWidth={contentWidth}
          onWidthChange={setContentWidth}
          onWordClick={handleWordClick}
          selectedWords={selectedWords}
        />
        <WordSidebar
          selectedWords={selectedWords}
          onRemove={handleRemoveWord}
          onAddAllToWordbook={handleAddAllToWordbook}
        />
      </div>
    </Suspense>
  );
}
