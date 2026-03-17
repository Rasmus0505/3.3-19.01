import test from "node:test";
import assert from "node:assert/strict";

import {
  RATE_INTEGER_CENTS_MESSAGE,
  getInvalidMinuteCentsFieldLabels,
  getRateDraftValidationMessage,
} from "../rateDraftValidation.js";

test("valid integer cents draft passes validation", () => {
  const draft = {
    price_per_minute_cents: 1,
    cost_per_minute_cents: 0,
  };

  assert.deepEqual(getInvalidMinuteCentsFieldLabels(draft), []);
  assert.equal(getRateDraftValidationMessage(draft), "");
});

test("fractional cost per minute is rejected with explicit integer cents hint", () => {
  const draft = {
    price_per_minute_cents: 1,
    cost_per_minute_cents: 0.0132,
  };

  assert.deepEqual(getInvalidMinuteCentsFieldLabels(draft), ["成本/分钟"]);
  assert.equal(
    getRateDraftValidationMessage(draft),
    `成本/分钟 ${RATE_INTEGER_CENTS_MESSAGE}`,
  );
});

test("fractional price and cost are both called out", () => {
  const draft = {
    price_per_minute_cents: 1.5,
    cost_per_minute_cents: 0.0132,
  };

  assert.deepEqual(getInvalidMinuteCentsFieldLabels(draft), ["售价/分钟", "成本/分钟"]);
  assert.equal(
    getRateDraftValidationMessage(draft),
    `售价/分钟、成本/分钟 ${RATE_INTEGER_CENTS_MESSAGE}`,
  );
});
