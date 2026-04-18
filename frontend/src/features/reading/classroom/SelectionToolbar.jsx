/**
 * SelectionToolbar — appears when user selects text.
 * Actions: color marks | Mark as confused | Add to wordbook
 */
import { motion } from "framer-motion";
import { BookMarked, HelpCircle } from "lucide-react";

const COLOR_OPTIONS = [
  { color: "yellow", bg: "#fef08a", label: "黄色标记" },
  { color: "green",  bg: "#bbf7d0", label: "绿色标记" },
  { color: "blue",   bg: "#bfdbfe", label: "蓝色标记" },
  { color: "pink",   bg: "#fbcfe8", label: "粉色标记" },
];

export function SelectionToolbar({ text, rect, onMarkConfused, onAddToWordbook, onColorMark, onClose }) {
  if (!rect) return null;

  const style = {
    position: "fixed",
    left: rect.left + rect.width / 2,
    top: rect.top - 8,
    transform: "translate(-50%, -100%)",
    zIndex: 1100,
  };

  return (
    <motion.div
      className="sel-toolbar"
      style={style}
      initial={{ opacity: 0, y: 6, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.95 }}
      transition={{ duration: 0.14, ease: [0.21, 1, 0.36, 1] }}
    >
      {/* Color marks */}
      <div className="sel-toolbar__colors">
        {COLOR_OPTIONS.map(({ color, bg, label }) => (
          <button
            key={color}
            type="button"
            className="sel-toolbar__color-dot"
            style={{ background: bg }}
            title={label}
            onClick={() => onColorMark?.(text, color)}
          />
        ))}
      </div>
      <div className="sel-toolbar__sep" />
      <button className="sel-toolbar__btn sel-toolbar__btn--confused" onClick={onMarkConfused}>
        <HelpCircle className="size-3.5" />
        不懂
      </button>
      <div className="sel-toolbar__sep" />
      <button className="sel-toolbar__btn" onClick={onAddToWordbook}>
        <BookMarked className="size-3.5" />
        生词本
      </button>
    </motion.div>
  );
}


