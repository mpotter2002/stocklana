import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PublicKey } from "@solana/web3.js";
import { JUPITER_V6_PROGRAM_ID } from "../lib/jupiter/constants.ts";
import { JupiterExecution } from "../lib/jupiter/execution.ts";
import { JupiterRouter } from "../lib/jupiter/router.ts";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "../lib/solana/token-accounts.ts";

const buildFixture = JSON.parse(
  await readFile(new URL("./fixtures/jupiter/swap-v2-build-usdc-aaplx.json", import.meta.url), "utf8"),
) as unknown;

const USDC = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const AAPLX = new PublicKey("XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp");

test("recorded /build payload parses documented quote fields as bigint strings", () => {
  const build = JupiterRouter.parseBuild(buildFixture);
  assert.ok(build.inputMint.equals(USDC));
  assert.ok(build.outputMint.equals(AAPLX));
  assert.equal(build.swapMode, "ExactIn");
  assert.ok(build.inAmount > 0n);
  assert.ok(build.outAmount > 0n);
  assert.ok(build.otherAmountThreshold > 0n);
  assert.ok(build.otherAmountThreshold <= build.outAmount);
  assert.ok(build.swapInstruction.programId.equals(JUPITER_V6_PROGRAM_ID));
  assert.ok(build.routePlan.length >= 1);
  assert.equal(build.routePlan[0]?.label, "Raydium CLMM");
});

test("leg plans commit otherAmountThreshold, not the quoted outAmount as a fill", () => {
  const build = JupiterRouter.parseBuild(buildFixture);
  const leg = JupiterExecution.toLegPlan(build, {
    inputTokenProgram: TOKEN_PROGRAM_ID,
    outputTokenProgram: TOKEN_2022_PROGRAM_ID,
  });
  assert.equal(leg.maxInput, build.inAmount);
  assert.equal(leg.minOutput, build.otherAmountThreshold);
  assert.notEqual(leg.minOutput, build.outAmount);
});

test("CPI constraints require basket authority and custody in remaining accounts", () => {
  const build = JupiterRouter.parseBuild(buildFixture);
  const taker = PublicKey.default;
  const inputCustody = build.swapInstruction.accounts[1]!.pubkey;
  const outputCustody = build.swapInstruction.accounts[2]!.pubkey;
  JupiterExecution.assertCpiConstraints(build, {
    taker,
    inputMint: USDC,
    outputMint: AAPLX,
    inputCustody,
    outputCustody,
  });
  assert.throws(() => JupiterExecution.assertCpiConstraints(build, {
    taker: new PublicKey(new Uint8Array(32).fill(9)),
    inputMint: USDC,
    outputMint: AAPLX,
    inputCustody,
    outputCustody,
  }), /custody or authority/);
});

test("parseBuild rejects invented or truncated payloads", () => {
  assert.throws(() => JupiterRouter.parseBuild({}), /documented quote fields/);
  assert.throws(() => JupiterRouter.parseBuild({
    ...(buildFixture as object),
    inAmount: 1_000_000,
  }), /documented quote fields/);
  assert.throws(() => JupiterRouter.parseBuild({
    ...(buildFixture as object),
    outAmount: "1.5",
  }), /unsigned decimal integer string/);
});

test("build URL uses documented /swap/v2/build query fields", () => {
  const url = JupiterRouter.buildUrl({
    inputMint: USDC,
    outputMint: AAPLX,
    amount: 1_000_000n,
    taker: PublicKey.default,
  });
  assert.match(url, /\/swap\/v2\/build\?/);
  assert.match(url, /inputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/);
  assert.match(url, /outputMint=XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp/);
  assert.match(url, /amount=1000000/);
  assert.match(url, /maxAccounts=32/);
  assert.match(url, /wrapAndUnwrapSol=false/);
});
