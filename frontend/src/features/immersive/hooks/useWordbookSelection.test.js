import { describe, expect, it } from "vitest";

import {
  isWordbookSelectableToken,
  resolveWordbookSelectionClick,
} from "./useWordbookSelection";

describe("wordbook token selection helpers", () => {
  it("supports single select, toggle, shift range, and additive selection", () => {
    expect(resolveWordbookSelectionClick({ tokenIndex: 1, sourceKey: "a", activeSourceKey: "" })).toEqual({
      selectedIndexes: [1],
      anchorIndex: 1,
    });
    expect(
      resolveWordbookSelectionClick({
        selectedIndexes: [1],
        tokenIndex: 1,
        anchorIndex: 1,
        sourceKey: "a",
        activeSourceKey: "a",
      }),
    ).toEqual({ selectedIndexes: [], anchorIndex: null });
    expect(
      resolveWordbookSelectionClick({
        selectedIndexes: [1],
        tokenIndex: 4,
        anchorIndex: 1,
        shiftKey: true,
        sourceKey: "a",
        activeSourceKey: "a",
      }).selectedIndexes,
    ).toEqual([1, 2, 3, 4]);
    expect(
      resolveWordbookSelectionClick({
        selectedIndexes: [1, 4],
        tokenIndex: 2,
        additiveKey: true,
        sourceKey: "a",
        activeSourceKey: "a",
      }).selectedIndexes,
    ).toEqual([1, 2, 4]);
  });

  it("treats punctuation-only tokens as unselectable", () => {
    expect(isWordbookSelectableToken("hello")).toBe(true);
    expect(isWordbookSelectableToken(",")).toBe(false);
  });
});
