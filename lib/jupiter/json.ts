import { PublicKey } from "@solana/web3.js";
import type { JupiterInventorySnapshot } from "./catalog.ts";
import type { JupiterBuild } from "./router.ts";

export class JupiterJson {
  static catalog(snapshot: JupiterInventorySnapshot) {
    return {
      source: snapshot.source,
      catalogLabel: snapshot.catalogLabel,
      usedSearchFallback: snapshot.usedSearchFallback,
      detail: snapshot.detail,
      funding: snapshot.funding
        ? {
          mint: snapshot.funding.mint.toBase58(),
          symbol: snapshot.funding.symbol,
          name: snapshot.funding.name,
          decimals: snapshot.funding.decimals,
          tokenProgram: snapshot.funding.tokenProgram.toBase58(),
          tags: snapshot.funding.tags,
          source: snapshot.funding.source,
        }
        : null,
      assets: snapshot.assets.map((asset) => ({
        mint: asset.mint.toBase58(),
        symbol: asset.symbol,
        name: asset.name,
        decimals: asset.decimals,
        tokenProgram: asset.tokenProgram.toBase58(),
        tags: asset.tags,
        kind: asset.kind,
        verified: asset.verified,
        source: asset.source,
      })),
      backpack: snapshot.backpack,
    };
  }

  static quote(build: JupiterBuild) {
    return {
      label: "jupiter-quote",
      notAFill: true,
      inputMint: build.inputMint.toBase58(),
      outputMint: build.outputMint.toBase58(),
      inAmount: build.inAmount.toString(),
      outAmount: build.outAmount.toString(),
      otherAmountThreshold: build.otherAmountThreshold.toString(),
      swapMode: build.swapMode,
      slippageBps: build.slippageBps,
      priceImpactPct: build.priceImpactPct,
      routePlan: build.routePlan.map((hop) => ({
        percent: hop.percent,
        bps: hop.bps,
        label: hop.label,
        ammKey: hop.ammKey,
        inputMint: hop.inputMint.toBase58(),
        outputMint: hop.outputMint.toBase58(),
        inAmount: hop.inAmount.toString(),
        outAmount: hop.outAmount.toString(),
      })),
      swapInstruction: {
        programId: build.swapInstruction.programId.toBase58(),
        accounts: build.swapInstruction.accounts.map((account) => ({
          pubkey: account.pubkey.toBase58(),
          isSigner: account.isSigner,
          isWritable: account.isWritable,
        })),
        data: build.swapInstruction.data.toString("base64"),
      },
    };
  }

  static publicKey(value: string, label: string): PublicKey {
    try {
      return new PublicKey(value);
    } catch {
      throw new Error(`${label} is not a valid Solana public key`);
    }
  }
}
