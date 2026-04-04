import { readCefrLevel } from "../../app/authStorage";

export const CEFR_LEVEL_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2", "SUPER"];

export function getCefrLevelIndex(level) {
  const index = CEFR_LEVEL_ORDER.indexOf(level);
  return index === -1 ? 6 : index;
}

/**
 * Compute the CEFR CSS class name for a word given its level and the user's level.
 *
 * Logic:
 * - null / undefined / '' (word not found in vocab map) → "cefr-mastered" (gray — no colour)
 * - wordIndex <= userIndex                      → "cefr-mastered"
 * - wordIndex === userIndex + 1                 → "cefr-i-plus-one"  (green)
 * - wordIndex >= userIndex + 2                  → "cefr-above-i-plus-one" (red)
 * - "SUPER" (explicit rarest tier)             → "cefr-above-i-plus-one" (red)
 */
export function computeCefrClassName(wordLevel, userLevel) {
  // Word not in vocab table → neutral gray, not "above i+1 / red".
  if (wordLevel === null || wordLevel === undefined || wordLevel === "") {
    return "cefr-mastered";
  }

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
