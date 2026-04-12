/**
 * SelectionToolbar — appears when user selects text.
 * Actions: Mark as confused | Add to wordbook
 */
import { motion } from "framer-motion";
import { BookMarked, HelpCircle } from "lucide-react";

export function SelectionToolbar({ text, rect, onMarkConfused, onAddToWordbook, onClose }) {
  if (!rect) return null;

  // Position above the selection center
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
      <button className="sel-toolbar__btn sel-toolbar__btn--confused" onClick={onMarkConfused}>
        <HelpCircle className="size-3.5" />
        不懂这里
      </button>
      <div className="sel-toolbar__sep" />
      <button className="sel-toolbar__btn" onClick={onAddToWordbook}>
        <BookMarked className="size-3.5" />
        生词本
      </button>
    </motion.div>
  );
}
