import { readCefrLevel } from "../../app/authStorage";

export const CEFR_LEVEL_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2", "SUPER"];

export function getCefrLevelIndex(level) {
  const index = CEFR_LEVEL_ORDER.indexOf(level);
  return index === -1 ? 6 : index;
}

/**
 * Compute the CEFR CSS class name for a word given its level and the user's level.
 *
 * Logic (per ROADMAP SC#4):
 * - wordIndex <= userIndex  → "cefr-mastered"
 * - wordIndex === userIndex + 1 → "cefr-i-plus-one"
 * - wordIndex >= userIndex + 2 → "cefr-above-i-plus-one"
 */
export function computeCefrClassName(wordLevel, userLevel) {
  // SUPER is always above all standard CEFR levels — never within reach.
  if (wordLevel === "SUPER") {
    return "cefr-above-i-plus-one";
  }

  const wordIndex = getCefrLevelIndex(wordLevel);
  const userIndex = getCefrLevelIndex(userLevel);

  if (wordIndex <= userIndex) {
    return "cefr-mastered";
  }
  if (wordIndex === userIndex + 1) {
    return "cefr-i-plus-one";
  }
  return "cefr-above-i-plus-one";
}

export function CefrUnderline({ wordLevel, userLevel, children, className = "" }) {
  const cefrClass = computeCefrClassName(wordLevel, userLevel);
  return (
    <span className={`${cefrClass} ${className}`}>
      {children}
    </span>
  );
}

export function CefrWordBadge({ wordLevel, userLevel, children, className = "" }) {
  const effectiveUserLevel = userLevel ?? readCefrLevel() ?? "B1";
  const cefrClass = computeCefrClassName(wordLevel, effectiveUserLevel);
  return (
    <span className={`immersive-wordbook-token ${cefrClass} ${className}`}>
      {children}
    </span>
  );
}
