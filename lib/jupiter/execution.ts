import { PublicKey, type AccountMeta } from "@solana/web3.js";
import type { LegPlanInput } from "../solana/basket-instructions.ts";
import {
  JUPITER_MAX_INSTRUCTION_DATA,
  JUPITER_V6_PROGRAM_ID,
} from "./constants.ts";
import type { JupiterBuild } from "./router.ts";

export interface JupiterCpiAccounts {
  taker: PublicKey;
  inputMint: PublicKey;
  outputMint: PublicKey;
  inputCustody: PublicKey;
  outputCustody: PublicKey;
}

export class JupiterExecution {
  static toLegPlan(
    build: JupiterBuild,
    tokenPrograms: {
      inputTokenProgram: PublicKey;
      outputTokenProgram: PublicKey;
    },
  ): LegPlanInput {
    if (build.swapMode !== "ExactIn") {
      throw new Error("Only Jupiter ExactIn routes can become basket legs");
    }
    if (build.inAmount <= 0n || build.otherAmountThreshold <= 0n) {
      throw new Error("Jupiter route amounts must be greater than zero");
    }
    return {
      inputMint: build.inputMint,
      inputTokenProgram: tokenPrograms.inputTokenProgram,
      outputMint: build.outputMint,
      outputTokenProgram: tokenPrograms.outputTokenProgram,
      maxInput: build.inAmount,
      minOutput: build.otherAmountThreshold,
    };
  }

  static remainingAccounts(build: JupiterBuild, basket: PublicKey): AccountMeta[] {
    if (build.swapInstruction.accounts.length === 0) {
      throw new Error("Jupiter swapInstruction has no accounts");
    }
    if (build.swapInstruction.accounts.length > 64) {
      throw new Error("Jupiter swapInstruction exceeds the CPI account limit");
    }
    return build.swapInstruction.accounts.map((account) => ({
      pubkey: account.pubkey,
      isWritable: account.isWritable,
      isSigner: account.isSigner && !account.pubkey.equals(basket),
    }));
  }

  static swapData(build: JupiterBuild): Buffer {
    if (build.swapInstruction.data.length === 0) {
      throw new Error("Jupiter swapInstruction data is empty");
    }
    if (build.swapInstruction.data.length > JUPITER_MAX_INSTRUCTION_DATA) {
      throw new Error("Jupiter swapInstruction data is larger than a Solana packet");
    }
    return Buffer.from(build.swapInstruction.data);
  }

  static assertCpiConstraints(build: JupiterBuild, accounts: JupiterCpiAccounts): void {
    if (!build.swapInstruction.programId.equals(JUPITER_V6_PROGRAM_ID)) {
      throw new Error("Jupiter swap program is not the documented aggregator");
    }
    if (build.swapMode !== "ExactIn") {
      throw new Error("Only Jupiter ExactIn routes can be executed as a basket CPI");
    }
    if (!build.inputMint.equals(accounts.inputMint) || !build.outputMint.equals(accounts.outputMint)) {
      throw new Error("Jupiter route mints do not match the committed basket leg");
    }
    const remaining = JupiterExecution.remainingAccounts(build, accounts.taker);
    const input = remaining.find((account) => account.pubkey.equals(accounts.inputCustody));
    const output = remaining.find((account) => account.pubkey.equals(accounts.outputCustody));
    const taker = remaining.find((account) => account.pubkey.equals(accounts.taker));
    if (!input?.isWritable || !output?.isWritable || !taker) {
      throw new Error("Jupiter remaining accounts omit basket custody or authority");
    }
  }
}
