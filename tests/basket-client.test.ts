import assert from "node:assert/strict";
import { test } from "node:test";
import { PublicKey } from "@solana/web3.js";
import {
  BASKET_PROGRAM_ID,
  MAX_U64,
  deriveBasketAddress,
  encodeU64LE,
  inspectLocalRuntime,
  normalizeBasketSnapshot,
  type DecodedBasketState,
} from "../lib/solana/basket-client.ts";

const OWNER = new PublicKey(new Uint8Array(32).fill(1));
const TOKEN_PROGRAM = new PublicKey(new Uint8Array(32).fill(2));
const MINTS = [
  new PublicKey(new Uint8Array(32).fill(3)),
  new PublicKey(new Uint8Array(32).fill(4)),
  PublicKey.default,
];

test("basket IDs use exact unsigned little-endian seeds", () => {
  assert.deepEqual([...encodeU64LE(0x0102_0304_0506_0708n)], [
    8, 7, 6, 5, 4, 3, 2, 1,
  ]);
  assert.throws(() => encodeU64LE(-1n), RangeError);
  assert.throws(() => encodeU64LE(MAX_U64 + 1n), RangeError);
});

test("basket PDA derivation is stable and owner scoped", () => {
  const first = deriveBasketAddress(OWNER, 7n);
  const repeated = deriveBasketAddress(OWNER, 7n);
  const anotherId = deriveBasketAddress(OWNER, 8n);

  assert.equal(first.toBase58(), repeated.toBase58());
  assert.notEqual(first.toBase58(), anotherId.toBase58());
  assert.equal(PublicKey.isOnCurve(first.toBytes()), false);
});

test("decoded Anchor state becomes bigint-safe client state", () => {
  const address = deriveBasketAddress(OWNER, 7n);
  const amount = (value: bigint) => ({ toString: () => value.toString() });
  const decoded: DecodedBasketState = {
    owner: OWNER,
    basket_id: amount(7n),
    bump: 253,
    asset_count: 2,
    funding_mint: MINTS[0]!,
    funding_token_program: TOKEN_PROGRAM,
    mints: MINTS,
    token_programs: [TOKEN_PROGRAM, TOKEN_PROGRAM, PublicKey.default],
    target_bps: [5_000, 5_000, 0],
    operation_nonce: amount(9_007_199_254_740_993n),
    phase: { Buying: {} },
    leg_count: 1,
    expires_at_slot: amount(123_456n),
    legs: [
      {
        input_mint: MINTS[0]!,
        input_token_program: TOKEN_PROGRAM,
        output_mint: MINTS[1]!,
        output_token_program: TOKEN_PROGRAM,
        max_input: amount(12_500_000n),
        min_output: amount(11_000_000n),
      },
    ],
    completed_legs: [true, false, false, false, false, false],
  };

  const snapshot = normalizeBasketSnapshot(address, decoded);
  assert.equal(snapshot.basketId, 7n);
  assert.equal(snapshot.operationNonce, 9_007_199_254_740_993n);
  assert.equal(snapshot.phase, "buying");
  assert.deepEqual(snapshot.targetBps, [5_000, 5_000]);
  assert.equal(snapshot.legs[0]?.maxInput, 12_500_000n);
  assert.equal(snapshot.legs[0]?.complete, true);
  for (const invalid of [
    { asset_count: 2.5 },
    { leg_count: NaN },
    { legs: [] },
    { completed_legs: [] },
    { mints: [] },
    { token_programs: [] },
    { target_bps: [] },
    { phase: { Idle: {} } },
    { phase: { Buying: {}, Selling: {} } },
    { operation_nonce: amount(-1n) },
    { expires_at_slot: amount(MAX_U64 + 1n) },
  ]) {
    assert.throws(() => normalizeBasketSnapshot(address, { ...decoded, ...invalid }));
  }
  assert.throws(
    () => normalizeBasketSnapshot(deriveBasketAddress(OWNER, 8n), decoded),
    /identity/,
  );
});

test("local runtime inspection distinguishes deployment and outage", async () => {
  const deployed = await inspectLocalRuntime({
    getVersion: async () => ({ "solana-core": "2.3.0" }),
    getSlot: async () => 42,
    getAccountInfo: async (address) => ({
      data: Buffer.alloc(0),
      executable: address.equals(BASKET_PROGRAM_ID),
      lamports: 1,
      owner: BASKET_PROGRAM_ID,
      rentEpoch: 0,
    }),
  });
  assert.deepEqual(deployed, {
    validator: "online",
    programDeployed: true,
    slot: 42,
    version: "2.3.0",
  });

  const offline = await inspectLocalRuntime(
    {
      getVersion: async () => {
        throw new Error("offline");
      },
      getSlot: async () => 0,
      getAccountInfo: async () => null,
    },
    10,
  );
  assert.equal(offline.validator, "offline");
  assert.equal(offline.programDeployed, null);

  const started = Date.now();
  const hung = await inspectLocalRuntime(
    {
      getVersion: () => new Promise(() => {}),
      getSlot: async () => 0,
      getAccountInfo: async () => null,
    },
    40,
  );
  assert.equal(hung.validator, "offline");
  assert.ok(Date.now() - started < 400);
});
