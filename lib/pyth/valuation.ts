import { assertRawAmount, formatAmount, U64_MAX } from "../amounts.ts";
import type { PythQuote, PythQuoteSource } from "./quote.ts";

export const USD_DISPLAY_DECIMALS = 6;

export type HoldingPriceStatus = "priced" | "not-priced";

export interface ValuationHoldingInput {
  mint: string;
  symbol: string;
  amount: bigint;
  decimals: number;
  feedId: string | null;
}

export interface PricedHolding {
  mint: string;
  symbol: string;
  amount: bigint;
  decimals: number;
  feedId: string | null;
  quote: PythQuote | null;
  usdAtoms: bigint | null;
  status: HoldingPriceStatus;
}

export interface BasketValuationSnapshot {
  holdings: PricedHolding[];
  pricedUsdAtoms: bigint;
  complete: boolean;
  sources: PythQuoteSource[];
}

export class BasketValuation {
  static usdAtoms(
    amount: bigint,
    decimals: number,
    quote: PythQuote,
    usdDecimals = USD_DISPLAY_DECIMALS,
  ): bigint {
    assertRawAmount(amount);
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
      throw new RangeError("Supported decimals are integers from 0 to 18");
    }
    if (!Number.isInteger(usdDecimals) || usdDecimals < 0 || usdDecimals > 18) {
      throw new RangeError("USD display decimals are integers from 0 to 18");
    }
    const scale = quote.expo - decimals + usdDecimals;
    const product = amount * quote.price;
    const valued = scale >= 0
      ? product * 10n ** BigInt(scale)
      : product / 10n ** BigInt(-scale);
    if (valued < 0n || valued > U64_MAX) {
      throw new RangeError("Valued USD amount must fit an unsigned 64-bit integer");
    }
    return valued;
  }

  static valueHoldings(
    holdings: readonly ValuationHoldingInput[],
    quotes: readonly PythQuote[],
  ): BasketValuationSnapshot {
    const byFeed = new Map(quotes.map((quote) => [quote.feedId, quote]));
    const priced: PricedHolding[] = holdings.map((holding) => {
      const quote = holding.feedId ? byFeed.get(holding.feedId) ?? null : null;
      if (!quote) {
        return { ...holding, quote: null, usdAtoms: null, status: "not-priced" };
      }
      try {
        return {
          ...holding,
          quote,
          usdAtoms: BasketValuation.usdAtoms(holding.amount, holding.decimals, quote),
          status: "priced",
        };
      } catch {
        return { ...holding, quote, usdAtoms: null, status: "not-priced" };
      }
    });
    const pricedUsdAtoms = priced.reduce(
      (sum, holding) => sum + (holding.usdAtoms ?? 0n),
      0n,
    );
    const sources = uniqueSources(priced);
    return {
      holdings: priced,
      pricedUsdAtoms,
      complete: priced.length > 0 && priced.every((holding) => holding.status === "priced"),
      sources,
    };
  }

  static formatUsd(atoms: bigint): string {
    return `$${formatAmount(atoms, USD_DISPLAY_DECIMALS)}`;
  }

  static formatUnitPrice(quote: PythQuote, tokenDecimals = USD_DISPLAY_DECIMALS): string {
    const oneToken = 10n ** BigInt(tokenDecimals);
    return BasketValuation.formatUsd(
      BasketValuation.usdAtoms(oneToken, tokenDecimals, quote),
    );
  }

  static headline(snapshot: BasketValuationSnapshot): string {
    if (snapshot.holdings.length === 0) return "--";
    if (!snapshot.complete && snapshot.pricedUsdAtoms === 0n) return "Not priced";
    const amount = BasketValuation.formatUsd(snapshot.pricedUsdAtoms);
    return snapshot.complete ? amount : `Partial ${amount}`;
  }

  static sourceLabel(snapshot: BasketValuationSnapshot): string {
    if (snapshot.sources.length === 0) return "";
    if (snapshot.sources.length === 1) {
      return snapshot.sources[0] === "hermes" ? "Pyth Hermes" : "Pyth local test";
    }
    return "Pyth Hermes + local test";
  }
}

function uniqueSources(holdings: readonly PricedHolding[]): PythQuoteSource[] {
  const seen = new Set<PythQuoteSource>();
  for (const holding of holdings) {
    if (holding.quote) seen.add(holding.quote.source);
  }
  return [...seen];
}
