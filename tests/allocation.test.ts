import assert from "node:assert/strict";
import { test } from "node:test";
import { allocate, allocateInvestment, equalWeights } from "../lib/allocation.ts";
import { U64_MAX } from "../lib/amounts.ts";

test("equal weights use deterministic recipe order", () => {
  assert.deepEqual(equalWeights(2), [5000, 5000]);
  assert.deepEqual(equalWeights(3), [3334, 3333, 3333]);
  for (const count of [0, 1, 4, 2.5, NaN]) {
    assert.throws(() => equalWeights(count));
  }
});

test("allocation conserves every raw unit across many sizes", () => {
  for (let raw = 0n; raw < 10_000n; raw += 1n) {
    for (const count of [2, 3]) {
      const weights = equalWeights(count);
      const result = allocate(raw, weights);
      assert.equal(result.reduce((a, b) => a + b, 0n), raw);
      result.forEach((value, index) => {
        const floor = raw * BigInt(weights[index]!) / 10_000n;
        assert.ok(value === floor || value === floor + 1n);
      });
    }
  }
});

test("largest remainder allocation and large inputs are exact", () => {
  assert.deepEqual(allocate(7n, [5000, 5000]), [4n, 3n]);
  assert.deepEqual(allocate(2n, [3334, 3333, 3333]), [1n, 1n, 0n]);
  assert.equal(allocate(U64_MAX, equalWeights(3)).reduce((a, b) => a + b), U64_MAX);
});

test("reject malformed weights and unsigned overflow", () => {
  for (const weights of [[], [10000], [0, 10000], [-1, 10001], [5000, 4999], [5000.5, 4999.5]]) {
    assert.throws(() => allocate(10n, weights));
  }
  assert.throws(() => allocate(-1n, [5000, 5000]));
  assert.throws(() => allocate(U64_MAX + 1n, [5000, 5000]));
});

test("investment rejects zero-size legs but pure math supports zero", () => {
  assert.deepEqual(allocate(0n, equalWeights(3)), [0n, 0n, 0n]);
  assert.throws(() => allocateInvestment(2n, 3));
  assert.throws(() => allocateInvestment(0n, 2));
  assert.deepEqual(allocateInvestment(3n, 3), [1n, 1n, 1n]);
});
