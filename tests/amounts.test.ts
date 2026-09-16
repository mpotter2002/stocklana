import assert from "node:assert/strict";
import { test } from "node:test";
import { formatAmount, parseAmount, U64_MAX } from "../lib/amounts.ts";

test("USDC parsing and display are lossless", () => {
  assert.equal(parseAmount("25.000001", 6), 25_000_001n);
  assert.equal(formatAmount(25_000_001n, 6), "25.000001");
  assert.equal(formatAmount(25_000_000n, 6), "25");
  assert.equal(formatAmount(1n, 6), "0.000001");
  assert.equal(formatAmount(0n, 6), "0");
});

test("amounts beyond Number precision retain all digits", () => {
  assert.equal(parseAmount(formatAmount(U64_MAX, 6), 6), U64_MAX);
  assert.equal(parseAmount("9007199254740993", 0), 9_007_199_254_740_993n);
});

test("reject ambiguous or lossy input", () => {
  for (const input of ["-1", "+1", "1e6", "1,000", " 1", "1 ", ".1", "1.", "01", "NaN", ""]) {
    assert.throws(() => parseAmount(input, 6), input);
  }
  assert.throws(() => parseAmount("1.0000001", 6));
  assert.throws(() => parseAmount((U64_MAX + 1n).toString(), 0));
});

test("validate decimals and unsigned output range", () => {
  for (const decimals of [-1, 1.5, 19, NaN]) {
    assert.throws(() => parseAmount("1", decimals));
    assert.throws(() => formatAmount(1n, decimals));
  }
  assert.throws(() => formatAmount(-1n, 6));
  assert.throws(() => formatAmount(U64_MAX + 1n, 6));
  assert.equal(formatAmount(42n, 0), "42");
});
