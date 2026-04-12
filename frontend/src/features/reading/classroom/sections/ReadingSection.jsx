/**
 * ReadingSection — Phase 1 of each section.
 * Displays the rewritten article text with:
 * - Yellow highlight on rewritten (i+1) words
 * - Hover tooltip showing original word + CEFR level
 * - Click on any word → WordCard popup
 * - Text selection → SelectionToolbar (mark confused / add to wordbook)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "../../../../lib/utils";
import { WordCard } from "../../classroom/WordCard";
import { SelectionToolbar } from "../../classroom/SelectionToolbar";

// Build a lookup map: lowercased replacement word → { original, cefr }
// Pipeline format: { original: replacementWord, rewritten: hardOriginalWord, finalLevel }
// Legacy format:   { replacement: replacementWord, original: hardOriginalWord, originalCefr }
function buildMappingLookup(rewriteMappings) {
  const map = new Map();
  for (const m of Array.isArray(rewriteMappings) ? rewriteMappings : []) {
    // Pipeline format: m.original = the new easier word in text; m.rewritten = the hard source word
    if (m.original && m.rewritten && m.original !== m.rewritten) {
      map.set(String(m.original).toLowerCase(), {
        original: m.rewritten,
        cefr: m.finalLevel || m.cefr || "?",
      });
    // Legacy format: m.replacement = new word, m.original = hard word
    } else if (m.replacement && m.original) {
      map.set(String(m.replacement).toLowerCase(), {
        original: m.original,
        cefr: m.originalCefr || m.cefr || "?",
      });
    }
  }
  return map;
}

// Tokenize text into word/punctuation/space tokens preserving positions
function tokenize(text) {
  const tokens = [];
  const regex = /([a-zA-Z''-]+|[^a-zA-Z''-]+)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    tokens.push({ text: match[0], isWord: /[a-zA-Z]/.test(match[0]) });
  }
  return tokens;
}

// Single word token — handles highlight state, hover tooltip, click
function WordToken({ text, isHighlighted, isConfused, originalInfo, onClick, onMouseEnter, onMouseLeave, isSpotlit }) {
  const classes = cn(
    "rc-word",
    isHighlighted && "rc-word--rewritten",
    isConfused && "rc-word--confused",
    isSpotlit && "rc-word--spotlit",
  );

  if (!isHighlighted) {
    return (
      <span
        className={classes}
        onClick={() => onClick(text)}
        onMouseEnter={() => onMouseEnter(null)}
      >
        {text}
      </span>
    );
  }

  return (
    <span
      className={classes}
      onClick={() => onClick(text)}
      onMouseEnter={(e) => onMouseEnter({ word: text, originalInfo, rect: e.currentTarget.getBoundingClientRect() })}
      onMouseLeave={onMouseLeave}
    >
      {text}
    </span>
  );
}

// Rewrite hover tooltip
function RewriteTooltip({ data }) {
  if (!data) return null;
  const { word, originalInfo, rect } = data;
  return (
    <div
      className="rc-rewrite-tooltip"
      style={{
        position: "fixed",
        left: rect.left + rect.width / 2,
        top: rect.top - 8,
        transform: "translate(-50%, -100%)",
        zIndex: 1000,
        pointerEvents: "none",
      }}
    >
      <span className="rc-rewrite-tooltip__orig">原词：{originalInfo.original}</span>
      {originalInfo.cefr && originalInfo.cefr !== "?" && (
        <span className="rc-rewrite-tooltip__cefr">{originalInfo.cefr}</span>
      )}
    </div>
  );
}

export function ReadingSection({
  section,
  rewriteMappings = [],
  confusedWords = [],
  spotlitWord = null,
  onWordClick,
  onMarkConfused,
  onAddToWordbook,
  apiCall,
  targetLevel,
}) {
  const [hoveredRewrite, setHoveredRewrite] = useState(null);
  const [selectedWord, setSelectedWord] = useState(null);
  const [selectedWordRect, setSelectedWordRect] = useState(null);
  const [selectionToolbar, setSelectionToolbar] = useState(null);
  const containerRef = useRef(null);

  const mappingLookup = buildMappingLookup(rewriteMappings);
  const confusedSet = new Set((confusedWords || []).map((w) => w.toLowerCase()));
  const text = section?.rewritten_text || "";
  const tokens = tokenize(text);

  const handleWordClick = useCallback((word) => {
    setSelectedWord(word);
    setSelectionToolbar(null);
  }, []);

  const handleWordCardClose = useCallback(() => {
    setSelectedWord(null);
    setSelectedWordRect(null);
  }, []);

  // Selection toolbar on text select
  useEffect(() => {
    const handleSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        setSelectionToolbar(null);
        return;
      }
      if (!containerRef.current?.contains(sel.anchorNode)) {
        setSelectionToolbar(null);
        return;
      }
      const selectedText = sel.toString().trim();
      if (!selectedText) return;
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setSelectionToolbar({ text: selectedText, rect });
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, []);

  return (
    <div className="rc-reading-section" ref={containerRef}>
      {/* Section summary */}
      {section?.summary && (
        <div className="rc-reading-section__summary">
          <span className="rc-reading-section__summary-label">本节摘要</span>
          <p>{section.summary}</p>
        </div>
      )}

      {/* Article text */}
      <div className="rc-reading-section__text">
        {tokens.map((token, i) => {
          if (!token.isWord) {
            return <span key={i}>{token.text}</span>;
          }
          const lower = token.text.toLowerCase();
          const originalInfo = mappingLookup.get(lower);
          const isHighlighted = Boolean(originalInfo);
          const isConfused = confusedSet.has(lower);
          const isSpotlit = spotlitWord && lower === spotlitWord.toLowerCase();

          return (
            <WordToken
              key={i}
              text={token.text}
              isHighlighted={isHighlighted}
              isConfused={isConfused}
              originalInfo={originalInfo}
              isSpotlit={isSpotlit}
              onClick={handleWordClick}
              onMouseEnter={isHighlighted ? setHoveredRewrite : () => {}}
              onMouseLeave={() => setHoveredRewrite(null)}
            />
          );
        })}
      </div>

      {/* Rewrite hover tooltip */}
      <AnimatePresence>
        {hoveredRewrite && (
          <motion.div
            key="rewrite-tooltip"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.12 }}
          >
            <RewriteTooltip data={hoveredRewrite} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Word click card */}
      <AnimatePresence>
        {selectedWord && (
          <WordCard
            word={selectedWord}
            apiCall={apiCall}
            targetLevel={targetLevel}
            onClose={handleWordCardClose}
            onAddToWordbook={() => {
              onAddToWordbook?.(selectedWord);
              handleWordCardClose();
            }}
          />
        )}
      </AnimatePresence>

      {/* Selection toolbar */}
      <AnimatePresence>
        {selectionToolbar && (
          <SelectionToolbar
            text={selectionToolbar.text}
            rect={selectionToolbar.rect}
            onMarkConfused={() => {
              onMarkConfused?.(selectionToolbar.text);
              setSelectionToolbar(null);
              window.getSelection()?.removeAllRanges();
            }}
            onAddToWordbook={() => {
              onAddToWordbook?.(selectionToolbar.text);
              setSelectionToolbar(null);
              window.getSelection()?.removeAllRanges();
            }}
            onClose={() => setSelectionToolbar(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
