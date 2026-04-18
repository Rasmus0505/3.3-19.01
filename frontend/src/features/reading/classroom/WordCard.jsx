/**
 * WordCard — floating card shown when user clicks a word.
 * Shows: word, Collins level, phonetic, LLM-generated definition.
 * Actions: Add to wordbook (real API), Open dictionary.
 */
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { BookMarked, Check, ExternalLink, Loader2, X } from "lucide-react";
import { toast } from "sonner";

const COLLINS_COLORS = {
  5: "oklch(0.65 0.18 150)",
  4: "oklch(0.65 0.18 170)",
  3: "oklch(0.65 0.18 220)",
  2: "oklch(0.6 0.18 260)",
  1: "oklch(0.6 0.2 290)",
};

async function fetchDefinition(word, apiCall, targetLevel) {
  const res = await apiCall("/api/llm/reading-course/word-definition", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ word, target_level: targetLevel }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function addToWordbookApi(word, apiCall) {
  const res = await apiCall("/api/wordbook/collect", {
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
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function WordCard({ word, apiCall, targetLevel = 3, onClose, onAddToWordbook }) {
  const [loading, setLoading] = useState(true);
  const [definition, setDefinition] = useState("");
  const [collins, setCollins] = useState(3);
  const [phonetic, setPhonetic] = useState("");
  const [wordbookState, setWordbookState] = useState("idle"); // idle | saving | saved
  const cardRef = useRef(null);

  // Load definition
  useEffect(() => {
    if (!word || !apiCall) { setLoading(false); return; }
    setLoading(true);
    setDefinition("");
    setCollins(3);
    setPhonetic("");
    setWordbookState("idle");

    fetchDefinition(word, apiCall, targetLevel)
      .then((data) => {
        setDefinition(data.definition || "");
        setCollins(Number(data.collins || 3) || 3);
        setPhonetic(data.phonetic || "");
      })
      .catch(() => setDefinition("释义加载失败"))
      .finally(() => setLoading(false));
  }, [word, apiCall, targetLevel]);

  // Click outside to close
  useEffect(() => {
    const handler = (e) => {
      if (cardRef.current && !cardRef.current.contains(e.target)) onClose?.();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const handleAddToWordbook = async () => {
    if (!apiCall || wordbookState !== "idle") return;
    setWordbookState("saving");
    try {
      await addToWordbookApi(word, apiCall);
      setWordbookState("saved");
      toast.success(`「${word}」已加入生词本`);
      onAddToWordbook?.(word);
    } catch {
      setWordbookState("idle");
      toast.error("加入生词本失败，请重试");
    }
  };

  const collinsColor = COLLINS_COLORS[collins] || "var(--muted-foreground)";

  return (
    <motion.div
      ref={cardRef}
      className="wc-card"
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.97 }}
      transition={{ duration: 0.18, ease: [0.21, 1, 0.36, 1] }}
    >
      <div className="wc-header">
        <div className="wc-header__left">
          <span className="wc-word">{word}</span>
          {phonetic && <span className="wc-phonetic">{phonetic}</span>}
        </div>
        <div className="wc-header__right">
          <span className="wc-collins" style={{ background: `${collinsColor}22`, color: collinsColor }}>
            {collins} 星
          </span>
          <button className="wc-close" onClick={onClose} aria-label="关闭">
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="wc-definition">
        {loading ? (
          <span className="wc-definition__loading">
            <Loader2 className="size-3.5 animate-spin" />
            查词中…
          </span>
        ) : (
          <p className="wc-definition__text">{definition || "暂无释义"}</p>
        )}
      </div>

      <div className="wc-actions">
        <button
          className="wc-btn wc-btn--primary"
          onClick={handleAddToWordbook}
          disabled={wordbookState !== "idle"}
        >
          {wordbookState === "saving" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : wordbookState === "saved" ? (
            <Check className="size-3.5" />
          ) : (
            <BookMarked className="size-3.5" />
          )}
          {wordbookState === "saved" ? "已加入" : "加入生词本"}
        </button>
        <a
          className="wc-btn wc-btn--ghost"
          href={`https://www.collinsdictionary.com/dictionary/english/${encodeURIComponent(word)}`}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink className="size-3.5" />
          查词典
        </a>
      </div>
    </motion.div>
  );
}



