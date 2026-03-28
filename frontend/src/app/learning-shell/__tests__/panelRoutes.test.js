import assert from "node:assert/strict";
import test from "node:test";

import { getPanelItemByPathname, getPanelPath, LEARNING_PAGE_PATHS } from "../panelRoutes.js";

test("account routes resolve to account panel", () => {
  assert.equal(getPanelItemByPathname("/account").key, "account");
  assert.equal(getPanelItemByPathname("/redeem").key, "account");
  assert.equal(getPanelPath("account"), "/account");
});

test("unknown paths fall back to history instead of account", () => {
  assert.equal(getPanelItemByPathname("/missing").key, "history");
});

test("learning page routes include account alias", () => {
  assert.ok(LEARNING_PAGE_PATHS.includes("/account"));
  assert.ok(LEARNING_PAGE_PATHS.includes("/redeem"));
});
