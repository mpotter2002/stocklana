import type { PublicKey } from "@solana/web3.js";
import type { LocalTestMintSet } from "../solana/local-test-mints.ts";
import { PythFeeds, type PythFeed } from "./feeds.ts";

export interface LocalTestFeedBinding {
  localSymbol: string;
  feed: PythFeed;
}

/**
 * Local test mints have no Pyth native feed. Map them to official Core feeds
 * as labeled stand-ins. The mints are not those issuers.
 */
export class LocalTestFeedMap {
  static readonly BINDINGS: readonly LocalTestFeedBinding[] = [
    { localSymbol: "USDCt", feed: PythFeeds.USDC_USD },
    { localSymbol: "ALPHAt", feed: PythFeeds.AAPL_USD },
    { localSymbol: "BEACONt", feed: PythFeeds.MSFT_USD },
    { localSymbol: "CEDARt", feed: PythFeeds.GOOGL_USD },
  ];

  static byLocalSymbol(symbol: string): LocalTestFeedBinding | null {
    return LocalTestFeedMap.BINDINGS.find((row) => row.localSymbol === symbol) ?? null;
  }

  static byMint(
    mint: PublicKey,
    mintSet: LocalTestMintSet | null,
  ): LocalTestFeedBinding | null {
    if (!mintSet) return null;
    if (mint.equals(mintSet.funding.mint)) {
      return LocalTestFeedMap.byLocalSymbol(mintSet.funding.symbol);
    }
    const asset = mintSet.assets.find((item) => item.mint.equals(mint));
    return asset ? LocalTestFeedMap.byLocalSymbol(asset.symbol) : null;
  }

  static requiredFeedIds(): string[] {
    return LocalTestFeedMap.BINDINGS.map((row) => row.feed.id);
  }
}
