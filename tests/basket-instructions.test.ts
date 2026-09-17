import assert from "node:assert/strict";
import { test } from "node:test";
import { BorshInstructionCoder, BN } from "@coral-xyz/anchor/dist/browser/index.js";
import type { Idl } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  BASKET_PROGRAM_ID,
  MAX_U64,
  deriveBasketAddress,
  encodeU64LE,
} from "../lib/solana/basket-client.ts";
import { JUPITER_V6_PROGRAM_ID } from "../lib/jupiter/constants.ts";
import { BasketInstructions } from "../lib/solana/basket-instructions.ts";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  TokenAccounts,
} from "../lib/solana/token-accounts.ts";
import basketIdl from "../lib/solana/idl/basket.json" with { type: "json" };

const OWNER = new PublicKey(new Uint8Array(32).fill(1));
const FUNDING = new PublicKey(new Uint8Array(32).fill(3));
const ALPHA = new PublicKey(new Uint8Array(32).fill(4));
const BEACON = new PublicKey(new Uint8Array(32).fill(5));
const coder = new BorshInstructionCoder(basketIdl as Idl);

test("create basket encodes the IDL discriminator and remaining mint accounts", () => {
  const instruction = BasketInstructions.createBasket({
    owner: OWNER,
    basketId: 1n,
    recipe: BasketInstructions.equalRecipe(
      FUNDING,
      TOKEN_PROGRAM_ID,
      [ALPHA, BEACON],
      [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID],
    ),
  });
  const decoded = coder.decode(Buffer.from(instruction.data));

  assert.ok(instruction.programId.equals(BASKET_PROGRAM_ID));
  assert.deepEqual([...instruction.data.subarray(0, 8)], [
    47, 105, 155, 148, 15, 169, 202, 211,
  ]);
  assert.equal(decoded?.name, "create_basket");
  assert.equal((decoded?.data as { basket_id: BN }).basket_id.toString(), "1");
  assert.deepEqual(
    instruction.keys.map((key) => ({
      key: key.pubkey.toBase58(),
      signer: key.isSigner,
      writable: key.isWritable,
    })),
    [
      { key: OWNER.toBase58(), signer: true, writable: true },
      { key: deriveBasketAddress(OWNER, 1n).toBase58(), signer: false, writable: true },
      { key: SystemProgram.programId.toBase58(), signer: false, writable: false },
      { key: FUNDING.toBase58(), signer: false, writable: false },
      { key: ALPHA.toBase58(), signer: false, writable: false },
      { key: BEACON.toBase58(), signer: false, writable: false },
    ],
  );
});

test("create basket rejects invalid recipes before building a transaction", () => {
  const recipe = BasketInstructions.equalRecipe(
    FUNDING,
    TOKEN_PROGRAM_ID,
    [ALPHA, BEACON],
    [TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID],
  );
  assert.throws(
    () => BasketInstructions.createBasket({
      owner: OWNER,
      basketId: 1n,
      recipe: { ...recipe, mints: [ALPHA] },
    }),
    /two or three/,
  );
  assert.throws(
    () => BasketInstructions.createBasket({
      owner: OWNER,
      basketId: 1n,
      recipe: { ...recipe, mints: [ALPHA, ALPHA] },
    }),
    /distinct/,
  );
  assert.throws(
    () => BasketInstructions.createBasket({
      owner: OWNER,
      basketId: 1n,
      recipe: { ...recipe, mints: [FUNDING, ALPHA] },
    }),
    /funding mint/,
  );
  assert.throws(
    () => BasketInstructions.createBasket({
      owner: OWNER,
      basketId: MAX_U64 + 1n,
      recipe,
    }),
    RangeError,
  );
});

test("deposit encodes an exact u64 amount and PDA-controlled custody", () => {
  const amount = 12_000_000n;
  const instruction = BasketInstructions.deposit({
    owner: OWNER,
    basketId: 1n,
    mint: FUNDING,
    tokenProgram: TOKEN_PROGRAM_ID,
    amount,
  });
  const basket = deriveBasketAddress(OWNER, 1n);

  assert.deepEqual([...instruction.data.subarray(0, 8)], [
    242, 35, 198, 137, 82, 225, 242, 182,
  ]);
  assert.deepEqual([...instruction.data.subarray(8)], [...encodeU64LE(amount)]);
  assert.ok(instruction.keys[4]?.pubkey.equals(
    TokenAccounts.custodyAddress(FUNDING, basket, TOKEN_PROGRAM_ID),
  ));
  assert.ok(instruction.keys[3]?.pubkey.equals(
    TokenAccounts.ownerAddress(FUNDING, OWNER, TOKEN_PROGRAM_ID),
  ));
  assert.ok(instruction.keys[6]?.pubkey.equals(ASSOCIATED_TOKEN_PROGRAM_ID));
  assert.throws(() => BasketInstructions.deposit({
    owner: OWNER,
    basketId: 1n,
    mint: FUNDING,
    tokenProgram: TOKEN_PROGRAM_ID,
    amount: 0n,
  }), RangeError);
});

test("withdraw full returns funds to the owner ATA, not a substituted destination", () => {
  const instruction = BasketInstructions.withdrawFull({
    owner: OWNER,
    basketId: 1n,
    mint: ALPHA,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
  });
  const basket = deriveBasketAddress(OWNER, 1n);
  assert.deepEqual([...instruction.data.subarray(0, 8)], [
    202, 192, 84, 246, 108, 9, 68, 173,
  ]);
  assert.ok(instruction.keys[3]?.pubkey.equals(
    TokenAccounts.custodyAddress(ALPHA, basket, TOKEN_2022_PROGRAM_ID),
  ));
  assert.ok(instruction.keys[4]?.pubkey.equals(
    TokenAccounts.ownerAddress(ALPHA, OWNER, TOKEN_2022_PROGRAM_ID),
  ));
});

test("start, finish, and exit encode nonces without exposing mock-swap accounts", () => {
  const start = BasketInstructions.startOperation({
    owner: OWNER,
    basketId: 1n,
    expectedNonce: 9_007_199_254_740_993n,
    phase: "buying",
    expiresAtSlot: 99n,
    legs: [{
      inputMint: FUNDING,
      inputTokenProgram: TOKEN_PROGRAM_ID,
      outputMint: ALPHA,
      outputTokenProgram: TOKEN_PROGRAM_ID,
      maxInput: 4_000_000n,
      minOutput: 8_000_000n,
    }],
  });
  const decodedStart = coder.decode(Buffer.from(start.data));
  assert.equal(decodedStart?.name, "start_operation");
  assert.equal(
    (decodedStart?.data as { expected_nonce: BN }).expected_nonce.toString(),
    "9007199254740993",
  );
  assert.deepEqual((decodedStart?.data as { phase: unknown }).phase, { Buying: {} });
  assert.equal(start.keys.length, 2);
  assert.equal(start.keys[0]?.isWritable, false);

  const finish = BasketInstructions.finishOperation({
    owner: OWNER,
    basketId: 1n,
    nonce: 3n,
  });
  const exit = BasketInstructions.beginExit({
    owner: OWNER,
    basketId: 1n,
    nonce: 3n,
  });
  assert.equal(coder.decode(Buffer.from(finish.data))?.name, "finish_operation");
  assert.equal(coder.decode(Buffer.from(exit.data))?.name, "begin_exit");
  assert.equal(
    JSON.stringify(finish).includes("9Tk2Ss7nB1XGnGFttkJUtchexJXKVdVXHXQRcTim57rG"),
    false,
  );
  assert.throws(() => BasketInstructions.startOperation({
    owner: OWNER,
    basketId: 1n,
    expectedNonce: 0n,
    phase: "buying",
    expiresAtSlot: 1n,
    legs: [],
  }));
});

test("execute Jupiter leg encodes remaining swap accounts against the documented program", () => {
  const basket = deriveBasketAddress(OWNER, 1n);
  const data = Uint8Array.from([1, 2, 3, 4]);
  const instruction = BasketInstructions.executeJupiterLeg({
    owner: OWNER,
    basketId: 1n,
    nonce: 3n,
    legIndex: 0,
    inputAmount: 1_000_000n,
    inputMint: FUNDING,
    inputTokenProgram: TOKEN_PROGRAM_ID,
    outputMint: ALPHA,
    outputTokenProgram: TOKEN_PROGRAM_ID,
    remainingAccounts: [
      { pubkey: basket, isSigner: false, isWritable: false },
      {
        pubkey: TokenAccounts.custodyAddress(FUNDING, basket, TOKEN_PROGRAM_ID),
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: TokenAccounts.custodyAddress(ALPHA, basket, TOKEN_PROGRAM_ID),
        isSigner: false,
        isWritable: true,
      },
    ],
    data,
  });
  const decoded = coder.decode(Buffer.from(instruction.data));
  assert.equal(decoded?.name, "execute_jupiter_leg");
  assert.deepEqual([...instruction.data.subarray(0, 8)], [
    104, 223, 248, 248, 126, 9, 152, 39,
  ]);
  assert.ok(instruction.keys[6]?.pubkey.equals(JUPITER_V6_PROGRAM_ID));
  assert.equal(
    JSON.stringify(instruction).includes("9Tk2Ss7nB1XGnGFttkJUtchexJXKVdVXHXQRcTim57rG"),
    false,
  );
  assert.ok(instruction.keys.some((key) => key.pubkey.equals(basket) && !key.isSigner));
  assert.throws(() => BasketInstructions.executeJupiterLeg({
    owner: OWNER,
    basketId: 1n,
    nonce: 3n,
    legIndex: 0,
    inputAmount: 1_000_000n,
    inputMint: FUNDING,
    inputTokenProgram: TOKEN_PROGRAM_ID,
    outputMint: ALPHA,
    outputTokenProgram: TOKEN_PROGRAM_ID,
    remainingAccounts: [],
    data,
  }), /remaining accounts/);
});

test("custody ATAs allow a PDA owner while wallet ATAs do not", () => {
  const basket = deriveBasketAddress(OWNER, 1n);
  const custody = TokenAccounts.custodyAddress(FUNDING, basket, TOKEN_PROGRAM_ID);
  const ownerAta = TokenAccounts.ownerAddress(FUNDING, OWNER, TOKEN_PROGRAM_ID);
  assert.equal(PublicKey.isOnCurve(basket.toBytes()), false);
  assert.notEqual(custody.toBase58(), ownerAta.toBase58());
  assert.throws(() => TokenAccounts.ownerAddress(FUNDING, basket, TOKEN_PROGRAM_ID));
});
