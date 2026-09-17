import { PublicKey } from "@solana/web3.js";
import { nextAction, type OperationSnapshot, type RecoveryAction } from "../recovery.ts";
import type { BasketSnapshot, LocalRuntimeStatus } from "../solana/basket-client.ts";
import type { LocalBasketBalances } from "../solana/local-basket-reader.ts";
import type { LocalTestMint, LocalTestMintSet } from "../solana/local-test-mints.ts";
import { LocalTestFeedMap } from "../pyth/local-test-map.ts";
import type { PythQuote } from "../pyth/quote.ts";
import type { PythQuoteSet } from "../pyth/quote-service.ts";
import {
  BasketValuation,
  type BasketValuationSnapshot,
} from "../pyth/valuation.ts";
import { shortPublicKey } from "../solana/injected-wallet.ts";

export type ListedTestAsset = LocalTestMint & { id: string };

export type PrimaryActionRun = "issue" | "create" | "deposit";

export interface PrimaryAction {
  label: string;
  title: string;
  run: PrimaryActionRun;
  disabled: boolean;
}

export class BasketView {
  static listedAssets(
    mintSet: LocalTestMintSet | null,
    snapshot: BasketSnapshot | null,
  ): ListedTestAsset[] {
    if (snapshot) {
      return snapshot.mints.map((mint, index) => {
        const known = mintSet?.assets.find((asset) => asset.mint.equals(mint));
        return {
          id: mint.toBase58(),
          symbol: known?.symbol ?? `Asset ${index + 1}`,
          name: known?.name ?? "On-chain mint",
          color: known?.color ?? "#68716c",
          mint,
          tokenProgram: snapshot.tokenPrograms[index]!,
          decimals: known?.decimals ?? 6,
        };
      });
    }
    return (mintSet?.assets ?? []).map((asset) => ({
      ...asset,
      id: asset.mint.toBase58(),
    }));
  }

  static toOperationSnapshot(snapshot: BasketSnapshot): OperationSnapshot {
    const phase = snapshot.phase === "idle"
      ? "idle"
      : snapshot.phase === "exiting"
        ? "exiting"
        : "active";
    return {
      nonce: snapshot.operationNonce,
      phase,
      legCount: snapshot.legs.length,
      completed: snapshot.legs.map((leg) => leg.complete),
    };
  }

  static recovery(snapshot: BasketSnapshot | null | undefined): RecoveryAction {
    return snapshot ? nextAction(BasketView.toOperationSnapshot(snapshot)) : { kind: "none" };
  }

  static primaryAction({
    owner,
    runtime,
    mintSet,
    balances,
    amountError,
    busy,
  }: {
    owner: PublicKey | null;
    runtime: LocalRuntimeStatus;
    mintSet: LocalTestMintSet | null;
    balances: LocalBasketBalances | null;
    amountError: string;
    busy: boolean;
  }): PrimaryAction {
    if (!owner) {
      return { label: "Connect a local wallet", title: "Connect", run: "issue", disabled: true };
    }
    if (runtime.validator !== "online") {
      return { label: "Start local validator", title: "Validator", run: "issue", disabled: true };
    }
    if (runtime.programDeployed !== true) {
      return { label: "Deploy basket program", title: "Program", run: "issue", disabled: true };
    }
    if (busy) {
      return { label: "Confirming on chain", title: "Submit", run: "deposit", disabled: true };
    }
    if (!balances?.snapshot && !mintSet) {
      return { label: "Issue local test tokens", title: "Issue test tokens", run: "issue", disabled: false };
    }
    if (!balances?.snapshot) {
      return {
        label: amountError ? "Check amount" : "Create and deposit",
        title: "Create basket",
        run: "create",
        disabled: Boolean(amountError),
      };
    }
    if (balances.snapshot.phase !== "idle") {
      return { label: "Basket is busy", title: "Busy", run: "deposit", disabled: true };
    }
    return {
      label: amountError ? "Check amount" : "Deposit",
      title: "Deposit",
      run: "deposit",
      disabled: Boolean(amountError),
    };
  }

  static valueCustody(
    balances: LocalBasketBalances | null,
    mintSet: LocalTestMintSet | null,
    quotes: readonly PythQuote[],
  ): BasketValuationSnapshot {
    if (!balances?.snapshot) {
      return BasketValuation.valueHoldings([], quotes);
    }
    return BasketValuation.valueHoldings(
      balances.custody.map((held) => {
        const known = mintSet?.funding.mint.equals(held.mint)
          ? mintSet.funding
          : mintSet?.assets.find((asset) => asset.mint.equals(held.mint));
        return {
          mint: held.mint.toBase58(),
          symbol: known?.symbol ?? shortPublicKey(held.mint),
          amount: held.amount,
          decimals: known?.decimals ?? 6,
          feedId: LocalTestFeedMap.byMint(held.mint, mintSet)?.feed.id ?? null,
        };
      }),
      quotes,
    );
  }

  static assetPriceCaption(symbol: string, quotes: readonly PythQuote[]): string {
    const binding = LocalTestFeedMap.byLocalSymbol(symbol);
    if (!binding) return "Not priced";
    const quote = quotes.find((item) => item.feedId === binding.feed.id);
    if (!quote) return `${binding.feed.displaySymbol} stand-in · Not priced`;
    const unit = BasketValuation.formatUnitPrice(quote);
    return quote.source === "local-test"
      ? `${binding.feed.displaySymbol} stand-in · ${unit} local test`
      : `${binding.feed.pythSymbol} · ${unit}`;
  }

  static valuationHeadline(
    valuation: BasketValuationSnapshot,
    quotesLoading: boolean,
    quoteSet: PythQuoteSet | null,
    hasSnapshot: boolean,
  ): string {
    if (quotesLoading && !quoteSet && hasSnapshot) return "Checking";
    return BasketValuation.headline(valuation);
  }

  static valuationSourceHint(
    quoteSet: PythQuoteSet | null,
    valuation: BasketValuationSnapshot,
    loading: boolean,
  ): string {
    if (loading && !quoteSet) return "Fetching Pyth quotes";
    if (!quoteSet) return "";
    if (quoteSet.quotes.length === 0 && quoteSet.error) {
      return "Not priced. Pyth quotes unavailable.";
    }
    if (valuation.holdings.length === 0) {
      if (quoteSet.quotes.length === 0) return "";
      return quoteSet.source === "hermes"
        ? "Pyth Hermes ready. No holdings to value."
        : "Pyth local test ready. No holdings to value.";
    }
    const source = BasketValuation.sourceLabel(valuation) || (
      quoteSet.source === "hermes" ? "Pyth Hermes" : "Pyth local test"
    );
    if (quoteSet.source === "local-test") {
      return quoteSet.error
        ? `${source}. Hermes unavailable; not live marks.`
        : `${source}. Not live marks.`;
    }
    return source;
  }

  static pythSourceLabel(
    quoteSet: PythQuoteSet | null,
    loading: boolean,
  ): string {
    if (quoteSet?.source === "hermes") return "Hermes";
    if (quoteSet?.source === "local-test") return "Local test";
    if (loading) return "Checking";
    return "Not priced";
  }

  static quotesHeading(source: "hermes" | "local-test" | null): string {
    return source === "hermes" ? "Pyth Hermes quotes" : "Pyth local test quotes";
  }

  static quotesFootnote(source: "hermes" | "local-test" | null): string {
    return source === "hermes"
      ? "Stand-in mapping only. Local mints are not those issuers."
      : "Hermetic Pyth-format marks, not live markets. Local mints are not those issuers.";
  }
}
