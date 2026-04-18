import { normalizeToken } from "./tokenNormalize";

const APOSTROPHE_RE = /[‘’]/g;

function isApostropheChar(char) {
  return char === "'" || char === "’";
}

export function normalizeComparableToken(token) {
  return normalizeToken(String(token || "")).replace(APOSTROPHE_RE, "");
}

export function buildLetterSlots(expectedToken, inputValue, revealedComparableIndices = []) {
  const expected = String(expectedToken || "");
  const actual = normalizeComparableToken(inputValue);
  const revealedSet = new Set(Array.isArray(revealedComparableIndices) ? revealedComparableIndices : []);
  const slots = [];
  let typedIndex = 0;

  for (let idx = 0; idx < expected.length; idx += 1) {
    const expectedChar = expected[idx];
    if (isApostropheChar(expectedChar)) {
      slots.push({
        key: `slot-fixed-${idx}`,
        char: "'",
        state: "fixed",
        extra: false,
      });
      continue;
    }

    const typedChar = actual[typedIndex] || "";
    let state = "empty";
    if (typedChar) {
      const match = typedChar.toLowerCase() === expectedChar.toLowerCase();
      let charState = "wrong";
      if (match) {
        charState = revealedSet.has(typedIndex) ? "revealed" : "correct";
      }
      state = charState;
      typedIndex += 1;
    }
    slots.push({
      key: `slot-${idx}`,
      char: typedChar || "\u00A0",
      state,
      extra: false,
    });
  }

  for (let idx = typedIndex; idx < actual.length; idx += 1) {
    slots.push({
      key: `extra-${idx}`,
      char: actual[idx] || "\u00A0",
      state: "wrong",
      extra: true,
    });
  }

  if (!slots.length) {
    return [{ key: "slot-empty", char: "\u00A0", state: "empty", extra: false }];
  }
  return slots;
}


