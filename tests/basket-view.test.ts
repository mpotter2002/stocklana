import assert from "node:assert/strict";
import { test } from "node:test";
import { Keypair } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "../lib/solana/token-accounts.ts";
import type { BasketSnapshot, LocalRuntimeStatus } from "../lib/solana/basket-client.ts";
import { LocalTestMints } from "../lib/solana/local-test-mints.ts";
import { LocalTestFeedMap } from "../lib/pyth/local-test-map.ts";
import { LocalTestPythQuotes } from "../lib/pyth/local-quotes.ts";
import { BasketView } from "../lib/ui/basket-view.ts";

const ONLINE: LocalRuntimeStatus = {
  validator: "online",
  programDeployed: true,
  slot: 12,
  version: "2.3.0",
};

function snapshot(overrides: Partial<BasketSnapshot> = {}): BasketSnapshot {
  const owner = Keypair.generate().publicKey;
  const address = Keypair.generate().publicKey;
  const fundingMint = Keypair.generate().publicKey;
  const mints = [Keypair.generate().publicKey, Keypair.generate().publicKey];
  return {
    address,
    owner,
    basketId: 1n,
    bump: 255,
    fundingMint,
    fundingTokenProgram: TOKEN_PROGRAM_ID,
    mints,
    tokenPrograms: [TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID],
    targetBps: [5000, 5000],
    operationNonce: 0n,
    phase: "idle",
    expiresAtSlot: 0n,
    legs: [],
    ...overrides,
  };
}

test("primary action stays blocked until wallet, validator, and program are ready", () => {
  const owner = Keypair.generate().publicKey;
  assert.equal(
    BasketView.primaryAction({
      owner: null,
      runtime: { validator: "offline", programDeployed: null, slot: null, version: null },
      mintSet: null,
      balances: null,
      amountError: "",
      busy: false,
    }).label,
    "Connect a local wallet",
  );
  assert.equal(
    BasketView.primaryAction({
      owner,
      runtime: { validator: "offline", programDeployed: null, slot: null, version: null },
      mintSet: null,
      balances: null,
      amountError: "",
      busy: false,
    }).label,
    "Start local validator",
  );
  assert.equal(
    BasketView.primaryAction({
      owner,
      runtime: { validator: "online", programDeployed: false, slot: 1, version: "2.3.0" },
      mintSet: null,
      balances: null,
      amountError: "",
      busy: false,
    }).label,
    "Deploy basket program",
  );
  assert.equal(
    BasketView.primaryAction({
      owner,
      runtime: ONLINE,
      mintSet: null,
      balances: null,
      amountError: "",
      busy: false,
    }).label,
    "Issue local test tokens",
  );
});

test("create and deposit labels stay honest about amount errors and busy baskets", () => {
  const owner = Keypair.generate().publicKey;
  const issued = LocalTestMints.issue({
    owner,
    rentLamports: 1_461_600n,
    mintKeys: [Keypair.generate(), Keypair.generate(), Keypair.generate(), Keypair.generate()],
  });
  assert.equal(
    BasketView.primaryAction({
      owner,
      runtime: ONLINE,
      mintSet: issued.mintSet,
      balances: {
        address: Keypair.generate().publicKey,
        snapshot: null,
        walletFunding: 0n,
        walletSolLamports: 0n,
        custody: [],
      },
      amountError: "too precise",
      busy: false,
    }).label,
    "Check amount",
  );
  assert.equal(
    BasketView.primaryAction({
      owner,
      runtime: ONLINE,
      mintSet: issued.mintSet,
      balances: {
        address: Keypair.generate().publicKey,
        snapshot: snapshot({ phase: "buying" }),
        walletFunding: 0n,
        walletSolLamports: 0n,
        custody: [],
      },
      amountError: "",
      busy: false,
    }).label,
    "Basket is busy",
  );
});

test("Pyth captions and source hints never invent a priced dollar", () => {
  const quotes = LocalTestPythQuotes.quotes(LocalTestFeedMap.requiredFeedIds());
  assert.equal(BasketView.assetPriceCaption("UNKNOWN", quotes), "Not priced");
  assert.match(BasketView.assetPriceCaption("ALPHAt", []), /Not priced$/);
  assert.match(BasketView.assetPriceCaption("ALPHAt", quotes), /local test$/);
  const emptyValuation = BasketView.valueCustody(null, null, quotes);
  assert.equal(BasketView.valuationHeadline(emptyValuation, false, null, false), "--");
  assert.equal(
    BasketView.valuationSourceHint(
      { source: "local-test", hermesUrl: null, quotes, error: null },
      emptyValuation,
      false,
    ),
    "Pyth local test ready. No holdings to value.",
  );
  assert.equal(
    BasketView.valuationSourceHint(null, emptyValuation, true),
    "Fetching Pyth quotes",
  );
  assert.equal(BasketView.pythSourceLabel(null, false), "Not priced");
  assert.equal(
    BasketView.pythSourceLabel({ source: "local-test", hermesUrl: null, quotes, error: null }, false),
    "Local test",
  );
});

test("listed assets prefer confirmed recipe mints over the local mint set", () => {
  const owner = Keypair.generate().publicKey;
  const issued = LocalTestMints.issue({
    owner,
    rentLamports: 1_461_600n,
    mintKeys: [Keypair.generate(), Keypair.generate(), Keypair.generate(), Keypair.generate()],
  });
  const onChain = snapshot({
    mints: [issued.mintSet.assets[0]!.mint, issued.mintSet.assets[2]!.mint],
    tokenPrograms: [TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID],
    targetBps: [5000, 5000],
  });
  const listed = BasketView.listedAssets(issued.mintSet, onChain);
  assert.deepEqual(
    listed.map((asset) => asset.symbol),
    ["ALPHAt", "CEDARt"],
  );
  assert.equal(BasketView.recovery(onChain).kind, "none");
});

test("recovery mapping follows confirmed phase, not UI progress", () => {
  assert.equal(BasketView.recovery(snapshot({ phase: "exiting" })).kind, "withdraw-holdings");
  const inputMint = Keypair.generate().publicKey;
  const outputMint = Keypair.generate().publicKey;
  const active = snapshot({
    phase: "buying",
    operationNonce: 3n,
    legs: [
      {
        inputMint,
        inputTokenProgram: TOKEN_PROGRAM_ID,
        outputMint,
        outputTokenProgram: TOKEN_PROGRAM_ID,
        maxInput: 1n,
        minOutput: 1n,
        complete: false,
      },
    ],
  });
  assert.equal(BasketView.recovery(active).kind, "prepare-leg");
});
