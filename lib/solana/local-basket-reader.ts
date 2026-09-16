import {
  PublicKey,
  type Connection,
} from "@solana/web3.js";
import {
  deriveBasketAddress,
  fetchBasketSnapshot,
  type BasketSnapshot,
} from "./basket-client.ts";
import { TokenAccounts } from "./token-accounts.ts";
import type { LocalTestMintSet } from "./local-test-mints.ts";

export const DEFAULT_BASKET_ID = 1n;

export interface CustodyBalance {
  mint: PublicKey;
  tokenProgram: PublicKey;
  amount: bigint;
  address: PublicKey;
  exists: boolean;
}

export interface LocalBasketBalances {
  address: PublicKey;
  snapshot: BasketSnapshot | null;
  walletFunding: bigint;
  walletSolLamports: bigint;
  custody: CustodyBalance[];
}

export class LocalBasketReader {
  static async load(
    connection: Connection,
    owner: PublicKey,
    options: {
      basketId?: bigint;
      mintSet?: LocalTestMintSet | null;
    } = {},
  ): Promise<LocalBasketBalances> {
    const basketId = options.basketId ?? DEFAULT_BASKET_ID;
    const address = deriveBasketAddress(owner, basketId);
    const snapshot = await fetchBasketSnapshot(connection, owner, basketId);
    const fundingMint = snapshot?.fundingMint ?? options.mintSet?.funding.mint;
    const fundingProgram = snapshot?.fundingTokenProgram
      ?? options.mintSet?.funding.tokenProgram;
    const walletFunding = fundingMint && fundingProgram
      ? await TokenAccounts.amount(
        connection,
        TokenAccounts.ownerAddress(fundingMint, owner, fundingProgram),
        fundingProgram,
      )
      : 0n;
    const walletSolLamports = BigInt(await connection.getBalance(owner, "confirmed"));
    const custody: CustodyBalance[] = [];
    if (snapshot) {
      const mints = [
        {
          mint: snapshot.fundingMint,
          tokenProgram: snapshot.fundingTokenProgram,
        },
        ...snapshot.mints.map((mint, index) => ({
          mint,
          tokenProgram: snapshot.tokenPrograms[index]!,
        })),
      ];
      for (const asset of mints) {
        const custodyAddress = TokenAccounts.custodyAddress(
          asset.mint,
          snapshot.address,
          asset.tokenProgram,
        );
        const held = await TokenAccounts.read(
          connection,
          custodyAddress,
          asset.tokenProgram,
        );
        custody.push({
          mint: asset.mint,
          tokenProgram: asset.tokenProgram,
          address: custodyAddress,
          amount: held.amount,
          exists: held.exists,
        });
      }
    }
    return {
      address,
      snapshot,
      walletFunding,
      walletSolLamports,
      custody,
    };
  }

  static custodyMints(snapshot: BasketSnapshot): {
    mint: PublicKey;
    tokenProgram: PublicKey;
  }[] {
    return [
      {
        mint: snapshot.fundingMint,
        tokenProgram: snapshot.fundingTokenProgram,
      },
      ...snapshot.mints.map((mint, index) => ({
        mint,
        tokenProgram: snapshot.tokenPrograms[index]!,
      })),
    ];
  }
}
