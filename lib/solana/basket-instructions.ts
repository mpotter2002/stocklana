import type { Idl } from "@coral-xyz/anchor";
import {
  BN,
  BorshInstructionCoder,
} from "@coral-xyz/anchor/dist/browser/index.js";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  type AccountMeta,
} from "@solana/web3.js";
import { equalWeights } from "../allocation.ts";
import {
  JUPITER_MAX_INSTRUCTION_DATA,
  JUPITER_V6_PROGRAM_ID,
} from "../jupiter/constants.ts";
import {
  BASKET_PROGRAM_ID,
  MAX_U64,
  deriveBasketAddress,
} from "./basket-client.ts";
import basketIdl from "./idl/basket.json" with { type: "json" };
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TokenAccounts,
} from "./token-accounts.ts";

const instructionCoder = new BorshInstructionCoder(basketIdl as Idl);

const PHASE_VARIANTS = {
  buying: { Buying: {} },
  selling: { Selling: {} },
  rebalancing: { Rebalancing: {} },
} as const;

export type StartablePhase = keyof typeof PHASE_VARIANTS;

export interface BasketRecipe {
  fundingMint: PublicKey;
  fundingTokenProgram: PublicKey;
  mints: PublicKey[];
  tokenPrograms: PublicKey[];
  targetBps: number[];
}

export interface CreateBasketParams {
  owner: PublicKey;
  basketId: bigint;
  recipe: BasketRecipe;
}

export interface DepositParams {
  owner: PublicKey;
  basketId: bigint;
  mint: PublicKey;
  tokenProgram: PublicKey;
  amount: bigint;
}

export interface WithdrawFullParams {
  owner: PublicKey;
  basketId: bigint;
  mint: PublicKey;
  tokenProgram: PublicKey;
}

export interface LegPlanInput {
  inputMint: PublicKey;
  inputTokenProgram: PublicKey;
  outputMint: PublicKey;
  outputTokenProgram: PublicKey;
  maxInput: bigint;
  minOutput: bigint;
}

export interface StartOperationParams {
  owner: PublicKey;
  basketId: bigint;
  expectedNonce: bigint;
  phase: StartablePhase;
  expiresAtSlot: bigint;
  legs: LegPlanInput[];
}

export interface NoncedBasketParams {
  owner: PublicKey;
  basketId: bigint;
  nonce: bigint;
}

export interface ExecuteJupiterLegParams {
  owner: PublicKey;
  basketId: bigint;
  nonce: bigint;
  legIndex: number;
  inputAmount: bigint;
  inputMint: PublicKey;
  inputTokenProgram: PublicKey;
  outputMint: PublicKey;
  outputTokenProgram: PublicKey;
  remainingAccounts: AccountMeta[];
  data: Uint8Array;
}

export class BasketInstructions {
  static equalRecipe(
    fundingMint: PublicKey,
    fundingTokenProgram: PublicKey,
    mints: PublicKey[],
    tokenPrograms: PublicKey[],
  ): BasketRecipe {
    return {
      fundingMint,
      fundingTokenProgram,
      mints,
      tokenPrograms,
      targetBps: equalWeights(mints.length),
    };
  }

  static createBasket(params: CreateBasketParams): TransactionInstruction {
    const recipe = validateRecipe(params.recipe);
    const basket = deriveBasketAddress(params.owner, params.basketId);
    const remainingMints = [recipe.fundingMint, ...recipe.mints];
    return new TransactionInstruction({
      programId: BASKET_PROGRAM_ID,
      keys: [
        writableSigner(params.owner),
        writable(basket),
        readonly(SystemProgram.programId),
        ...remainingMints.map(readonly),
      ],
      data: instructionCoder.encode("create_basket", {
        basket_id: toU64Bn(params.basketId),
        funding_mint: recipe.fundingMint,
        funding_token_program: recipe.fundingTokenProgram,
        mints: recipe.mints,
        token_programs: recipe.tokenPrograms,
        target_bps: recipe.targetBps,
      }),
    });
  }

  static deposit(params: DepositParams): TransactionInstruction {
    assertPositiveAmount(params.amount);
    assertTokenProgram(params.tokenProgram);
    const basket = deriveBasketAddress(params.owner, params.basketId);
    return new TransactionInstruction({
      programId: BASKET_PROGRAM_ID,
      keys: [
        writableSigner(params.owner),
        readonly(basket),
        readonly(params.mint),
        writable(TokenAccounts.ownerAddress(
          params.mint,
          params.owner,
          params.tokenProgram,
        )),
        writable(TokenAccounts.custodyAddress(
          params.mint,
          basket,
          params.tokenProgram,
        )),
        readonly(params.tokenProgram),
        readonly(ASSOCIATED_TOKEN_PROGRAM_ID),
        readonly(SystemProgram.programId),
      ],
      data: instructionCoder.encode("deposit", {
        amount: toU64Bn(params.amount),
      }),
    });
  }

  static withdrawFull(params: WithdrawFullParams): TransactionInstruction {
    assertTokenProgram(params.tokenProgram);
    const basket = deriveBasketAddress(params.owner, params.basketId);
    return new TransactionInstruction({
      programId: BASKET_PROGRAM_ID,
      keys: [
        writableSigner(params.owner),
        readonly(basket),
        readonly(params.mint),
        writable(TokenAccounts.custodyAddress(
          params.mint,
          basket,
          params.tokenProgram,
        )),
        writable(TokenAccounts.ownerAddress(
          params.mint,
          params.owner,
          params.tokenProgram,
        )),
        readonly(params.tokenProgram),
        readonly(ASSOCIATED_TOKEN_PROGRAM_ID),
        readonly(SystemProgram.programId),
      ],
      data: instructionCoder.encode("withdraw_full", {}),
    });
  }

  static startOperation(params: StartOperationParams): TransactionInstruction {
    if (!(params.phase in PHASE_VARIANTS)) {
      throw new Error("Operation phase must be buying, selling, or rebalancing");
    }
    if (params.legs.length < 1 || params.legs.length > 6) {
      throw new Error("Operation plan must contain between one and six legs");
    }
    const basket = deriveBasketAddress(params.owner, params.basketId);
    return new TransactionInstruction({
      programId: BASKET_PROGRAM_ID,
      keys: [
        readonlySigner(params.owner),
        writable(basket),
      ],
      data: instructionCoder.encode("start_operation", {
        expected_nonce: toU64Bn(params.expectedNonce),
        phase: PHASE_VARIANTS[params.phase],
        expires_at_slot: toU64Bn(params.expiresAtSlot),
        legs: params.legs.map((leg) => {
          assertPositiveAmount(leg.maxInput);
          assertPositiveAmount(leg.minOutput);
          return {
            input_mint: leg.inputMint,
            input_token_program: leg.inputTokenProgram,
            output_mint: leg.outputMint,
            output_token_program: leg.outputTokenProgram,
            max_input: toU64Bn(leg.maxInput),
            min_output: toU64Bn(leg.minOutput),
          };
        }),
      }),
    });
  }

  static executeJupiterLeg(params: ExecuteJupiterLegParams): TransactionInstruction {
    if (!Number.isInteger(params.legIndex) || params.legIndex < 0 || params.legIndex > 5) {
      throw new Error("Leg index is outside the active operation");
    }
    assertPositiveAmount(params.inputAmount);
    assertTokenProgram(params.inputTokenProgram);
    assertTokenProgram(params.outputTokenProgram);
    if (params.data.length === 0 || params.data.length > JUPITER_MAX_INSTRUCTION_DATA) {
      throw new Error("Jupiter instruction data is empty or too large");
    }
    if (params.remainingAccounts.length === 0 || params.remainingAccounts.length > 64) {
      throw new Error("Jupiter remaining accounts omit basket custody or authority");
    }
    const basket = deriveBasketAddress(params.owner, params.basketId);
    return new TransactionInstruction({
      programId: BASKET_PROGRAM_ID,
      keys: [
        writableSigner(params.owner),
        writable(basket),
        writable(params.inputMint),
        writable(params.outputMint),
        writable(TokenAccounts.custodyAddress(
          params.inputMint,
          basket,
          params.inputTokenProgram,
        )),
        writable(TokenAccounts.custodyAddress(
          params.outputMint,
          basket,
          params.outputTokenProgram,
        )),
        readonly(JUPITER_V6_PROGRAM_ID),
        readonly(params.inputTokenProgram),
        readonly(params.outputTokenProgram),
        readonly(ASSOCIATED_TOKEN_PROGRAM_ID),
        readonly(SystemProgram.programId),
        ...params.remainingAccounts.map((account) => ({
          pubkey: account.pubkey,
          isSigner: account.isSigner,
          isWritable: account.isWritable,
        })),
      ],
      data: instructionCoder.encode("execute_jupiter_leg", {
        nonce: toU64Bn(params.nonce),
        leg_index: params.legIndex,
        input_amount: toU64Bn(params.inputAmount),
        data: Buffer.from(params.data),
      }),
    });
  }

  static finishOperation(params: NoncedBasketParams): TransactionInstruction {
    return encodeNonceInstruction("finish_operation", params);
  }

  static beginExit(params: NoncedBasketParams): TransactionInstruction {
    return encodeNonceInstruction("begin_exit", params);
  }
}

function encodeNonceInstruction(
  name: "finish_operation" | "begin_exit",
  params: NoncedBasketParams,
): TransactionInstruction {
  const basket = deriveBasketAddress(params.owner, params.basketId);
  const argName = name === "begin_exit" ? "expected_nonce" : "nonce";
  return new TransactionInstruction({
    programId: BASKET_PROGRAM_ID,
    keys: [
      readonlySigner(params.owner),
      writable(basket),
    ],
    data: instructionCoder.encode(name, {
      [argName]: toU64Bn(params.nonce),
    }),
  });
}

function validateRecipe(recipe: BasketRecipe): BasketRecipe {
  const { mints, tokenPrograms, targetBps, fundingMint, fundingTokenProgram } = recipe;
  if (mints.length < 2 || mints.length > 3) {
    throw new Error("Select two or three assets");
  }
  if (mints.length !== tokenPrograms.length || mints.length !== targetBps.length) {
    throw new Error("Mint, token program, and weight lists must have equal lengths");
  }
  assertTokenProgram(fundingTokenProgram);
  for (const programId of tokenPrograms) assertTokenProgram(programId);
  if (mints.some((mint, index) => mints.slice(index + 1).some((other) => other.equals(mint)))) {
    throw new Error("Asset mints must be distinct");
  }
  if (mints.some((mint) => mint.equals(fundingMint))) {
    throw new Error("The funding mint cannot also be a selected basket asset");
  }
  if (
    targetBps.some((weight) => !Number.isInteger(weight) || weight <= 0)
    || targetBps.reduce((sum, weight) => sum + weight, 0) !== 10_000
  ) {
    throw new Error("Weights must be positive and total 10,000 basis points");
  }
  return recipe;
}

function assertPositiveAmount(amount: bigint): void {
  if (amount <= 0n) {
    throw new RangeError("Amount must be greater than zero");
  }
  toU64Bn(amount);
}

function assertTokenProgram(programId: PublicKey): void {
  if (!TokenAccounts.isSupportedTokenProgram(programId)) {
    throw new Error("Only the SPL Token and Token-2022 programs are supported");
  }
}

function toU64Bn(value: bigint): BN {
  if (value < 0n || value > MAX_U64) {
    throw new RangeError("Value must fit an unsigned 64-bit integer");
  }
  return new BN(value.toString());
}

function writableSigner(pubkey: PublicKey) {
  return { pubkey, isSigner: true, isWritable: true };
}

function readonlySigner(pubkey: PublicKey) {
  return { pubkey, isSigner: true, isWritable: false };
}

function writable(pubkey: PublicKey) {
  return { pubkey, isSigner: false, isWritable: true };
}

function readonly(pubkey: PublicKey) {
  return { pubkey, isSigner: false, isWritable: false };
}
