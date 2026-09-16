import assert from "node:assert/strict";
import { test } from "node:test";
import { Keypair } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "../lib/solana/token-accounts.ts";
import {
  LOCAL_TEST_FUNDING_AMOUNT,
  LocalTestMints,
} from "../lib/solana/local-test-mints.ts";

test("local test issuance creates unlabeled-as-live mints without persisting secrets", () => {
  const owner = Keypair.generate().publicKey;
  const mintKeys = [Keypair.generate(), Keypair.generate(), Keypair.generate(), Keypair.generate()];
  const issued = LocalTestMints.issue({
    owner,
    rentLamports: 1_461_600n,
    mintKeys,
  });

  assert.equal(issued.mintSet.funding.symbol, "USDCt");
  assert.equal(issued.mintSet.assets.length, 3);
  assert.ok(issued.mintSet.funding.mint.equals(mintKeys[0]!.publicKey));
  assert.ok(issued.mintSet.assets[0]?.mint.equals(mintKeys[1]!.publicKey));
  assert.equal(issued.extraSigners.length, 4);
  assert.ok(issued.mintSet.funding.tokenProgram.equals(TOKEN_PROGRAM_ID));
  assert.equal(issued.mintSet.funding.decimals, 6);

  const stored = JSON.stringify({
    owner: issued.mintSet.owner.toBase58(),
    funding: {
      mint: issued.mintSet.funding.mint.toBase58(),
      tokenProgram: issued.mintSet.funding.tokenProgram.toBase58(),
    },
  });
  assert.equal(stored.includes("secretKey"), false);
  assert.equal(
    issued.instructions.some((instruction) =>
      instruction.keys.some((key) => key.pubkey.equals(owner) && key.isSigner)
      || instruction.programId.equals(TOKEN_PROGRAM_ID)
    ),
    true,
  );
  assert.equal(LOCAL_TEST_FUNDING_AMOUNT, 1_000_000_000000n);
});

test("issue rejects an incomplete mint key set", () => {
  assert.throws(() => LocalTestMints.issue({
    owner: Keypair.generate().publicKey,
    rentLamports: 1n,
    mintKeys: [Keypair.generate()],
  }));
  assert.throws(() => LocalTestMints.issue({
    owner: Keypair.generate().publicKey,
    rentLamports: 0n,
  }), RangeError);
});
