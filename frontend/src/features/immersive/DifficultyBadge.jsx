import { readCollinsLevel } from "../../app/authStorage";

export const LEGACY_LEVEL_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2", "SUPER"];
const COLLINS_BANDS = new Set(["default", "i_plus_one", "above_i_plus_one", "unrated"]);

export function getLegacyLevelIndex(level) {
  const index = LEGACY_LEVEL_ORDER.indexOf(level);
  return index === -1 ? 6 : index;
}

/**
 * Compute the difficulty CSS class name for a word given its Collins band or
 * stored legacy level and the user's current Collins level.
 */
export function computeDifficultyClassName(wordLevel, userLevel) {
  if (COLLINS_BANDS.has(String(wordLevel || ""))) {
    if (wordLevel === "i_plus_one") return "difficulty-i-plus-one";
    if (wordLevel === "above_i_plus_one") return "difficulty-above-i-plus-one";
    return "difficulty-default";
  }
  if (typeof wordLevel === "number" && Number.isFinite(Number(userLevel))) {
    const normalizedWordLevel = Number(wordLevel);
    const normalizedUserLevel = Number(userLevel);
    if (normalizedWordLevel >= normalizedUserLevel) {
      return "difficulty-default";
    }
    if (normalizedWordLevel === normalizedUserLevel - 1) {
      return "difficulty-i-plus-one";
    }
    return "difficulty-above-i-plus-one";
  }
  // Word not in vocab table → neutral gray, not "above i+1 / red".
  if (wordLevel === null || wordLevel === undefined || wordLevel === "") {
    return "difficulty-default";
  }

  // SUPER is always above all standard Collins levels — never within reach.
  if (wordLevel === "SUPER") {
    return "difficulty-above-i-plus-one";
  }

  const wordIndex = getLegacyLevelIndex(wordLevel);
  const userIndex = getLegacyLevelIndex(userLevel);

  if (wordIndex <= userIndex) {
    return "difficulty-default";
  }
  if (wordIndex === userIndex + 1) {
    return "difficulty-i-plus-one";
  }
  return "difficulty-above-i-plus-one";
}

export function DifficultyUnderline({ wordLevel, userLevel, children, className = "" }) {
  const difficultyClass = computeDifficultyClassName(wordLevel, userLevel);
  return (
    <span className={`${difficultyClass} ${className}`}>
      {children}
    </span>
  );
}

export function DifficultyWordBadge({ wordLevel, userLevel, children, className = "" }) {
  const effectiveUserLevel = userLevel ?? readCollinsLevel() ?? 3;
  const difficultyClass = computeDifficultyClassName(wordLevel, effectiveUserLevel);
  return (
    <span className={`immersive-wordbook-token ${difficultyClass} ${className}`}>
      {children}
    </span>
  );
}


