import test from "node:test";
import assert from "node:assert/strict";

import {
  RATE_DECIMAL_YUAN_MESSAGE,
  RATE_INTEGER_CENTS_MESSAGE,
  TOKEN_COST_DECIMAL_MESSAGE,
  getInvalidMinuteYuanFieldLabels,
  getInvalidRateFieldLabels,
  getRateDraftValidationMessage,
} from "../rateDraftValidation.js";

test("valid yuan minute draft passes validation", () => {
  const draft = {
    billing_unit: "minute",
    price_per_minute_yuan: "1.3000",
    cost_per_minute_yuan: "0.0132",
  };

  assert.deepEqual(getInvalidMinuteYuanFieldLabels(draft), []);
  assert.equal(getRateDraftValidationMessage(draft), "");
});

test("minute yuan draft rejects more than four decimals", () => {
  const draft = {
    billing_unit: "minute",
    price_per_minute_yuan: "1.30001",
    cost_per_minute_yuan: "0.0132",
  };

  assert.deepEqual(getInvalidMinuteYuanFieldLabels(draft), ["售价(元/分钟)"]);
  assert.equal(
    getRateDraftValidationMessage(draft),
    `售价(元/分钟) ${RATE_DECIMAL_YUAN_MESSAGE}`,
  );
});

test("minute yuan draft rejects non-numeric cost", () => {
  const draft = {
    billing_unit: "minute",
    price_per_minute_yuan: "1.3000",
    cost_per_minute_yuan: "abc",
  };

  assert.deepEqual(getInvalidRateFieldLabels(draft), ["成本(元/分钟)"]);
  assert.equal(
    getRateDraftValidationMessage(draft),
    `成本(元/分钟) ${RATE_DECIMAL_YUAN_MESSAGE}`,
  );
});

test("token billing still requires non-negative integers", () => {
  const draft = {
    billing_unit: "1k_tokens",
    points_per_1k_tokens: 1.5,
    cost_per_minute_yuan: "0.0110",
  };

  assert.deepEqual(getInvalidRateFieldLabels(draft), ["售价/1k Tokens"]);
  assert.equal(
    getRateDraftValidationMessage(draft),
    `售价/1k Tokens ${RATE_INTEGER_CENTS_MESSAGE}`,
  );
});

test("token billing also validates token cost as decimal yuan", () => {
  const draft = {
    billing_unit: "1k_tokens",
    points_per_1k_tokens: 19,
    cost_per_minute_yuan: "abc",
  };

  assert.deepEqual(getInvalidRateFieldLabels(draft), ["成本/1k Tokens"]);
  assert.equal(
    getRateDraftValidationMessage(draft),
    `成本/1k Tokens ${TOKEN_COST_DECIMAL_MESSAGE}`,
  );
});
