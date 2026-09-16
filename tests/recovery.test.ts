import assert from "node:assert/strict";
import { test } from "node:test";
import { nextAction } from "../lib/recovery.ts";
import type { OperationSnapshot } from "../lib/recovery.ts";

const active: OperationSnapshot = {
  nonce: 3n, phase: "active", legCount: 3, completed: [true, false, false],
};

test("resume prepares only an unfinished leg from observed state", () => {
  assert.deepEqual(nextAction(active), { kind: "prepare-leg", nonce: 3n, index: 1 });
  assert.deepEqual(nextAction(active), nextAction(active));
  assert.deepEqual(active.completed, [true, false, false]);
});

test("completed trades lead to finalization, never another swap", () => {
  assert.deepEqual(nextAction({ ...active, completed: [true, true, true] }),
    { kind: "finish", nonce: 3n });
});

test("exit overrides unfinished trades", () => {
  assert.deepEqual(nextAction({ ...active, phase: "exiting" }),
    { kind: "withdraw-holdings" });
});

test("idle and closed do not schedule work", () => {
  for (const phase of ["idle", "closed"] as const) {
    assert.deepEqual(nextAction({ ...active, phase }), { kind: "none" });
  }
});

test("reject inconsistent operation snapshots", () => {
  assert.throws(() => nextAction({ ...active, completed: [true] }));
  assert.throws(() => nextAction({ ...active, nonce: -1n }));
  assert.throws(() => nextAction({ ...active, nonce: 1n << 64n }));
  assert.throws(() => nextAction({ ...active, legCount: 0, completed: [] }));
});
