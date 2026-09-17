"use client";

import {
  AlertTriangle,
  ArrowRight,
  Check,
  CircleDollarSign,
  Layers3,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { PublicKey, type Signer, type TransactionInstruction } from "@solana/web3.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { allocateInvestment, equalWeights } from "../lib/allocation.ts";
import { formatAmount, parseAmount } from "../lib/amounts.ts";
import { nextAction, type OperationSnapshot } from "../lib/recovery.ts";
import {
  createLocalConnection,
  deriveBasketAddress,
  fetchBasketSnapshot,
  type BasketSnapshot,
  type LocalRuntimeStatus,
} from "../lib/solana/basket-client";
import { BasketInstructions } from "../lib/solana/basket-instructions";
import {
  getInjectedSolanaWallet,
  shortPublicKey,
} from "../lib/solana/injected-wallet";
import {
  DEFAULT_BASKET_ID,
  LocalBasketReader,
  type LocalBasketBalances,
} from "../lib/solana/local-basket-reader";
import {
  LocalSolAirdrop,
  LocalTestMints,
  type LocalTestMint,
  type LocalTestMintSet,
} from "../lib/solana/local-test-mints";
import {
  LocalTransactionError,
  LocalTransactionRunner,
  describeLocalTransactionError,
} from "../lib/solana/local-transaction";
import { PythQuoteClient } from "../lib/pyth/quote-client.ts";
import { LocalTestFeedMap } from "../lib/pyth/local-test-map.ts";
import type { PythQuote } from "../lib/pyth/quote.ts";
import type { PythQuoteSet } from "../lib/pyth/quote-service.ts";
import { BasketValuation, type BasketValuationSnapshot } from "../lib/pyth/valuation.ts";
import { LocalSolanaStatus } from "./local-solana-status";
import { JupiterRail } from "./jupiter-rail";

const UNKNOWN_RUNTIME: LocalRuntimeStatus = {
  validator: "offline",
  programDeployed: null,
  jupiterSwapDeployed: null,
  slot: null,
  version: null,
};

type ChainNotice = {
  tone: "ok" | "error" | "info";
  title: string;
  detail: string;
  signature: string | null;
};

export function BasketWorkspace() {
  const connection = useMemo(() => createLocalConnection(), []);
  const [owner, setOwner] = useState<PublicKey | null>(null);
  const [runtime, setRuntime] = useState(UNKNOWN_RUNTIME);
  const [mintSet, setMintSet] = useState<LocalTestMintSet | null>(null);
  const [balances, setBalances] = useState<LocalBasketBalances | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [amount, setAmount] = useState("25");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<ChainNotice | null>(null);
  const [quoteSet, setQuoteSet] = useState<PythQuoteSet | null>(null);
  const [quotesLoading, setQuotesLoading] = useState(true);
  const handleOwnerChange = useCallback((next: PublicKey | null) => {
    setOwner((current) => {
      if (current && next && current.equals(next)) return current;
      if (!current && !next) return current;
      return next;
    });
  }, []);

  const refreshChain = useCallback(async (nextOwner = owner) => {
    if (!nextOwner) {
      setMintSet(null);
      setBalances(null);
      return;
    }
    let loaded = LocalTestMints.load(nextOwner);
    if (loaded && !(await LocalTestMints.stillOnChain(connection, loaded))) {
      LocalTestMints.clear();
      loaded = null;
    }
    setMintSet(loaded);
    const view = await LocalBasketReader.load(connection, nextOwner, {
      mintSet: loaded,
    });
    setBalances(view);
    if (view.snapshot) {
      setSelected(view.snapshot.mints.map((mint) => mint.toBase58()));
    } else if (loaded) {
      setSelected((current) => {
        const available = new Set(loaded.assets.map((asset) => asset.mint.toBase58()));
        const stillValid = current.filter((id) => available.has(id));
        if (stillValid.length >= 2) return stillValid;
        return loaded.assets.slice(0, 2).map((asset) => asset.mint.toBase58());
      });
    }
  }, [connection, owner]);

  useEffect(() => {
    void refreshChain(owner).catch((error: unknown) => {
      setNotice({
        tone: "error",
        title: "Chain refresh failed",
        detail: describeLocalTransactionError(error),
        signature: null,
      });
    });
  }, [owner, refreshChain]);

  const refreshQuotes = useCallback(async () => {
    setQuotesLoading(true);
    try {
      const next = await PythQuoteClient.latest(LocalTestFeedMap.requiredFeedIds());
      setQuoteSet(next);
    } catch {
      setQuoteSet(null);
    } finally {
      setQuotesLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshQuotes();
    const timer = setInterval(() => {
      void refreshQuotes();
    }, 30_000);
    return () => clearInterval(timer);
  }, [refreshQuotes]);

  const listedAssets = listedTestAssets(mintSet, balances?.snapshot ?? null);
  const selectedAssets = listedAssets.filter((asset) => selected.includes(asset.id));
  const weights = balances?.snapshot?.targetBps
    ?? (selectedAssets.length >= 2 ? equalWeights(selectedAssets.length) : []);
  const snapshotLocked = Boolean(balances?.snapshot);

  let depositAmount: bigint | null = null;
  let amountError = "";
  try {
    depositAmount = parseAmount(amount, 6);
    if (depositAmount > 0n && selectedAssets.length >= 2) {
      allocateInvestment(depositAmount, selectedAssets.length);
    }
  } catch (error) {
    amountError = error instanceof Error ? error.message : "Invalid amount";
    depositAmount = null;
  }

  const allocations = depositAmount && depositAmount > 0n && selectedAssets.length >= 2 && !amountError
    ? allocateInvestment(depositAmount, selectedAssets.length)
    : [];

  function toggleAsset(id: string): void {
    if (snapshotLocked) return;
    setSelected((current) => {
      if (current.includes(id)) {
        return current.length === 2 ? current : current.filter((item) => item !== id);
      }
      return current.length === 3 ? current : [...current, id];
    });
  }

  async function runAction(
    title: string,
    action: () => Promise<string | null>,
  ): Promise<void> {
    setBusy(true);
    setNotice({
      tone: "info",
      title,
      detail: "Waiting for wallet signature and local-validator confirmation.",
      signature: null,
    });
    try {
      const signature = await action();
      await refreshChain();
      if (signature) {
        setNotice({
          tone: "ok",
          title: `${title} confirmed`,
          detail: "On-chain state was re-read after confirmation.",
          signature,
        });
      }
    } catch (error) {
      await refreshChain().catch(() => undefined);
      setNotice({
        tone: "error",
        title: `${title} failed`,
        detail: describeLocalTransactionError(error),
        signature: error instanceof LocalTransactionError ? error.signature : null,
      });
    } finally {
      setBusy(false);
    }
  }

  async function submitInstructions(
    instructions: TransactionInstruction[],
    extraSigners?: Signer[],
  ): Promise<string> {
    const wallet = getInjectedSolanaWallet();
    if (!wallet) throw new Error("No injected Solana wallet is available");
    const submitted = await LocalTransactionRunner.submit({
      connection,
      wallet: LocalTransactionRunner.signerFromInjected(wallet),
      instructions,
      ...(extraSigners ? { extraSigners } : {}),
    });
    return submitted.signature;
  }

  async function issueTestTokens(): Promise<string | null> {
    if (!owner) throw new Error("Connect a wallet first");
    await LocalSolAirdrop.ensure(connection, owner);
    const issued = LocalTestMints.issue({
      owner,
      rentLamports: await LocalTestMints.mintRentLamports(connection),
    });
    const signature = await submitInstructions(issued.instructions, issued.extraSigners);
    LocalTestMints.save(issued.mintSet);
    setMintSet(issued.mintSet);
    return signature;
  }

  async function createBasket(): Promise<string | null> {
    if (!owner || !mintSet) throw new Error("Issue local test tokens first");
    if (selectedAssets.length < 2) throw new Error("Select two or three assets");
    const existing = await fetchBasketSnapshot(connection, owner, DEFAULT_BASKET_ID);
    if (existing) {
      setNotice({
        tone: "info",
        title: "Basket already exists",
        detail: "Create was skipped after reading the basket account.",
        signature: null,
      });
      return null;
    }
    const recipe = BasketInstructions.equalRecipe(
      mintSet.funding.mint,
      mintSet.funding.tokenProgram,
      selectedAssets.map((asset) => asset.mint),
      selectedAssets.map((asset) => asset.tokenProgram),
    );
    const instructions = [
      BasketInstructions.createBasket({
        owner,
        basketId: DEFAULT_BASKET_ID,
        recipe,
      }),
    ];
    if (depositAmount && depositAmount > 0n) {
      const walletFunding = await LocalBasketReader.load(connection, owner, { mintSet });
      if (depositAmount > walletFunding.walletFunding) {
        throw new Error("Wallet USDCt balance is below the deposit amount");
      }
      instructions.push(BasketInstructions.deposit({
        owner,
        basketId: DEFAULT_BASKET_ID,
        mint: mintSet.funding.mint,
        tokenProgram: mintSet.funding.tokenProgram,
        amount: depositAmount,
      }));
    }
    return submitInstructions(instructions);
  }

  async function deposit(): Promise<string | null> {
    if (!owner) throw new Error("Connect a wallet first");
    const snapshot = await fetchBasketSnapshot(connection, owner, DEFAULT_BASKET_ID);
    if (!snapshot) throw new Error("Create a basket before depositing");
    if (snapshot.phase !== "idle") {
      throw new Error("Basket is busy. Finish or exit the operation before depositing.");
    }
    if (!depositAmount || depositAmount <= 0n) throw new Error("Enter a deposit amount");
    const walletFunding = await LocalBasketReader.load(connection, owner, { mintSet });
    if (depositAmount > walletFunding.walletFunding) {
      throw new Error("Wallet funding balance is below the deposit amount");
    }
    return submitInstructions([
      BasketInstructions.deposit({
        owner,
        basketId: snapshot.basketId,
        mint: snapshot.fundingMint,
        tokenProgram: snapshot.fundingTokenProgram,
        amount: depositAmount,
      }),
    ]);
  }

  async function withdraw(): Promise<string | null> {
    if (!owner) throw new Error("Connect a wallet first");
    const view = await LocalBasketReader.load(connection, owner, { mintSet });
    if (!view.snapshot) throw new Error("No basket account to withdraw from");
    if (view.snapshot.phase !== "idle" && view.snapshot.phase !== "exiting") {
      throw new Error("Begin in-kind exit before withdrawing during an operation");
    }
    const instructions = view.custody.filter((held) => held.exists).map((held) =>
      BasketInstructions.withdrawFull({
        owner,
        basketId: view.snapshot!.basketId,
        mint: held.mint,
        tokenProgram: held.tokenProgram,
      }),
    );
    if (instructions.length === 0) {
      throw new Error("No custody accounts exist on chain for this basket");
    }
    return submitInstructions(instructions);
  }

  async function beginExit(): Promise<string | null> {
    if (!owner) throw new Error("Connect a wallet first");
    const snapshot = await fetchBasketSnapshot(connection, owner, DEFAULT_BASKET_ID);
    if (!snapshot) throw new Error("No basket account to exit");
    return submitInstructions([
      BasketInstructions.beginExit({
        owner,
        basketId: snapshot.basketId,
        nonce: snapshot.operationNonce,
      }),
    ]);
  }

  async function finishOperation(): Promise<string | null> {
    if (!owner) throw new Error("Connect a wallet first");
    const snapshot = await fetchBasketSnapshot(connection, owner, DEFAULT_BASKET_ID);
    if (!snapshot) throw new Error("No basket account to finish");
    return submitInstructions([
      BasketInstructions.finishOperation({
        owner,
        basketId: snapshot.basketId,
        nonce: snapshot.operationNonce,
      }),
    ]);
  }

  const primary = primaryAction({
    owner,
    runtime,
    mintSet,
    balances,
    amountError,
    busy,
  });
  const recovery = balances?.snapshot
    ? nextAction(toOperationSnapshot(balances.snapshot))
    : { kind: "none" as const };
  const fundingCustody = balances?.custody[0]?.amount ?? 0n;
  const hasCustody = (balances?.custody ?? []).some((held) => held.exists);
  const quotes = quoteSet?.quotes ?? [];
  const valuation = valueCustody(balances, mintSet, quotes);
  const valuationHeadline = quotesLoading && !quoteSet && balances?.snapshot
    ? "Checking"
    : BasketValuation.headline(valuation);
  const valuationHint = valuationSourceHint(quoteSet, valuation, quotesLoading);

  return (
    <main className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <header className="border-b border-black/10 bg-[var(--ink)] text-white">
        <div className="mx-auto flex min-h-16 max-w-[1440px] items-center justify-between px-5 md:px-8">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-[6px] bg-[var(--green)]">
              <Layers3 size={19} aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold">Stocklana</p>
              <p className="text-xs text-white/55">Custom baskets</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden border border-white/15 px-2 py-1 text-[11px] font-medium text-white/65 sm:inline">
              LOCAL TEST
            </span>
            <span className="inline-flex h-9 items-center gap-2 rounded-[6px] border border-white/20 px-3 text-sm font-medium">
              <Wallet size={15} />
              {owner ? shortPublicKey(owner) : "No wallet"}
            </span>
          </div>
        </div>
      </header>

      <section className="border-b border-black/10 bg-white">
        <dl className="mx-auto grid max-w-[1440px] grid-cols-2 gap-y-5 px-5 py-6 md:grid-cols-4 md:px-8">
          <Metric
            hint={valuationHint}
            label="Valuation"
            value={valuationHeadline}
          />
          <Metric
            label="Basket custody"
            value={balances?.snapshot
              ? `${formatAmount(fundingCustody, 6)} USDCt`
              : "--"}
          />
          <Metric
            label="Wallet USDCt"
            value={owner ? `${formatAmount(balances?.walletFunding ?? 0n, 6)}` : "--"}
          />
          <Metric label="Open baskets" value={owner ? (balances?.snapshot ? "1" : "0") : "--"} />
        </dl>
      </section>

      <LocalSolanaStatus
        onOwnerChange={handleOwnerChange}
        onRuntimeChange={setRuntime}
      />

      <div className="mx-auto grid max-w-[1440px] lg:grid-cols-[minmax(0,1fr)_390px]">
        <section className="px-5 py-8 md:px-8 lg:border-r lg:border-black/10">
          <div className="mb-7 flex items-end justify-between gap-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-[var(--muted)]">
                {snapshotLocked ? "On-chain basket" : "New basket"}
              </p>
              <h1 className="text-2xl font-semibold">
                {snapshotLocked ? "Holdings from confirmed state" : "Choose your holdings"}
              </h1>
            </div>
            <span className="text-sm tabular-nums text-[var(--muted)]">
              {selected.length}/3 selected
            </span>
          </div>

          <div className="overflow-hidden rounded-[6px] border border-black/10 bg-white">
            <div className="grid grid-cols-[1fr_90px_44px] border-b border-black/10 bg-[#f0f2ef] px-4 py-2 text-[11px] font-semibold uppercase text-[var(--muted)]">
              <span>Asset</span><span className="text-right">Target</span><span />
            </div>
            {listedAssets.length === 0 ? (
              <div className="px-4 py-6">
                <p className="text-sm text-[var(--muted)]">
                  Connect a local wallet, then issue local test tokens. Mint addresses
                  are created on the validator, not taken from fixtures.
                </p>
                <ReferenceQuotes
                  loading={quotesLoading}
                  quotes={quotes}
                  source={quoteSet?.source ?? null}
                />
              </div>
            ) : listedAssets.map((asset) => {
              const selectedIndex = selectedAssets.findIndex((item) => item.id === asset.id);
              const isSelected = selectedIndex !== -1;
              return (
                <button
                  aria-pressed={isSelected}
                  className="grid w-full grid-cols-[1fr_90px_44px] items-center border-b border-black/8 px-4 py-4 text-left last:border-b-0 hover:bg-[#f7f8f5] disabled:cursor-not-allowed"
                  disabled={snapshotLocked || (isSelected && selected.length === 2)}
                  key={asset.id}
                  onClick={() => toggleAsset(asset.id)}
                  type="button"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span
                      className="grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: asset.color }}
                    >
                      {asset.symbol[0]}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{asset.symbol}</span>
                      <span className="block truncate text-xs text-[var(--muted)]">
                        {asset.name} · {shortPublicKey(asset.mint)}
                      </span>
                      <span className="block truncate text-[11px] text-[var(--muted)]">
                        {assetPriceCaption(asset.symbol, quotes)}
                      </span>
                    </span>
                  </span>
                  <span className="text-right font-mono text-sm tabular-nums">
                    {isSelected ? `${(weights[selectedIndex] ?? 0) / 100}%` : "--"}
                  </span>
                  <span className={`ml-auto grid size-6 place-items-center rounded-[4px] border ${
                    isSelected ? "border-[var(--green)] bg-[var(--green)] text-white" : "border-black/20"
                  }`}>
                    {isSelected ? <Check size={14} aria-hidden="true" /> : null}
                  </span>
                </button>
              );
            })}
          </div>
          <label className="mt-8 block max-w-md text-xs font-semibold uppercase text-[var(--muted)]" htmlFor="investment">
            Deposit
          </label>
          <div className="mt-2 flex max-w-md items-center rounded-[6px] border border-black/15 bg-white focus-within:border-[var(--blue)] focus-within:ring-2 focus-within:ring-[var(--blue)]/10">
            <CircleDollarSign className="ml-3 text-[var(--muted)]" size={18} />
            <input
              className="h-12 min-w-0 flex-1 bg-transparent px-3 font-mono text-lg outline-none"
              id="investment"
              inputMode="decimal"
              onChange={(event) => setAmount(event.target.value)}
              value={amount}
            />
            <span className="pr-4 text-xs font-semibold text-[var(--muted)]">USDCt</span>
          </div>
          <p className={`mt-2 min-h-5 text-xs ${amountError ? "text-[var(--red)]" : "text-[var(--muted)]"}`}>
            {amountError || "Local test token, 6 decimals. Split below is a calculation only. Jupiter xStocks are listed separately and are not these mints."}
          </p>

          <JupiterRail jupiterSwapDeployed={runtime.jupiterSwapDeployed} />
        </section>

        <aside className="bg-[#eef0ec] px-5 py-8 md:px-8 lg:px-6">
          <h2 className="text-base font-semibold">Order preview</h2>
          <div className="mt-5 space-y-4">
            {selectedAssets.map((asset, index) => (
              <div className="flex items-center gap-3" key={asset.id}>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-black/8">
                  <span className="block h-full" style={{
                    backgroundColor: asset.color,
                    width: `${(weights[index] ?? 0) / 100}%`,
                  }} />
                </span>
                <span className="w-20 text-xs font-semibold">{asset.symbol}</span>
                <span className="w-20 text-right font-mono text-xs tabular-nums">
                  {allocations[index] === undefined ? "--" : formatAmount(allocations[index], 6)}
                </span>
              </div>
            ))}
          </div>

          <dl className="my-6 space-y-3 border-y border-black/10 py-5 text-sm">
            <PreviewRow label="Assets" value={`${selectedAssets.length}`} />
            <PreviewRow label="Weighting" value="Equal" />
            <PreviewRow
              label="Basket"
              value={owner ? shortPublicKey(deriveBasketAddress(owner, DEFAULT_BASKET_ID)) : "--"}
            />
            <PreviewRow label="Execution rail" value="Jupiter (quote only here)" />
            <PreviewRow label="Network" value="Local validator" />
            <PreviewRow
              label="Pyth source"
              value={quoteSet?.source === "hermes"
                ? "Hermes"
                : quoteSet?.source === "local-test"
                  ? "Local test"
                  : quotesLoading
                    ? "Checking"
                    : "Not priced"}
            />
          </dl>

          <ChainPanel
            balances={balances}
            mintSet={mintSet}
            notice={notice}
            quotes={quotes}
            recovery={recovery}
          />

          {recovery.kind === "prepare-leg" ? (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-[6px] bg-[var(--ink)] px-4 text-sm font-semibold text-white disabled:bg-black/25"
                disabled={busy || !owner}
                onClick={() => void runAction("Begin in-kind exit", beginExit)}
                type="button"
              >
                Begin exit
              </button>
              <button
                className="inline-flex h-11 items-center justify-center rounded-[6px] border border-black/20 bg-white px-4 text-sm font-semibold disabled:opacity-50"
                disabled
                title="Jupiter CPI needs the Jupiter v6 program and route AMMs on this validator. Mock-swap stays in local-testing Anchor builds."
                type="button"
              >
                Jupiter CPI unavailable locally
              </button>
            </div>
          ) : recovery.kind === "finish" ? (
            <button
              className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[6px] bg-[var(--ink)] px-4 text-sm font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:bg-black/25"
              disabled={busy || !owner}
              onClick={() => void runAction("Finish operation", finishOperation)}
              type="button"
            >
              <Check size={16} />
              Finish operation
            </button>
          ) : (
            <div className="mt-6 space-y-2">
              <button
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[6px] bg-[var(--ink)] px-4 text-sm font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:bg-black/25"
                disabled={primary.disabled || busy}
                onClick={() => void runAction(primary.title, primary.run === "issue"
                  ? issueTestTokens
                  : primary.run === "create"
                    ? createBasket
                    : deposit)}
                type="button"
              >
                {busy ? <RefreshCw className="animate-spin" size={16} /> : <ArrowRight size={16} />}
                {primary.label}
              </button>
              {hasCustody && recovery.kind === "none" ? (
                <button
                  className="inline-flex h-11 w-full items-center justify-center rounded-[6px] border border-black/20 bg-white px-4 text-sm font-semibold disabled:opacity-50"
                  disabled={busy || !owner}
                  onClick={() => void runAction("Withdraw holdings", withdraw)}
                  type="button"
                >
                  Withdraw holdings
                </button>
              ) : null}
              {recovery.kind === "withdraw-holdings" ? (
                <button
                  className="inline-flex h-11 w-full items-center justify-center rounded-[6px] border border-black/20 bg-white px-4 text-sm font-semibold disabled:opacity-50"
                  disabled={busy || !owner}
                  onClick={() => void runAction("Withdraw holdings", withdraw)}
                  type="button"
                >
                  Withdraw in kind
                </button>
              ) : null}
            </div>
          )}
          <p className="mt-4 text-center text-[11px] leading-5 text-[var(--muted)]">
            Local validator only. Valuation is Pyth (Hermes or labeled local test).
            The UI waits for confirmation and re-reads accounts before treating a
            submit as complete. No mainnet transaction is sent.
          </p>
        </aside>
      </div>
    </main>
  );
}

function valueCustody(
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

function assetPriceCaption(symbol: string, quotes: readonly PythQuote[]): string {
  const binding = LocalTestFeedMap.byLocalSymbol(symbol);
  if (!binding) return "Not priced";
  const quote = quotes.find((item) => item.feedId === binding.feed.id);
  if (!quote) return `${binding.feed.displaySymbol} stand-in · Not priced`;
  const unit = BasketValuation.formatUnitPrice(quote);
  return quote.source === "local-test"
    ? `${binding.feed.displaySymbol} stand-in · ${unit} local test`
    : `${binding.feed.pythSymbol} · ${unit}`;
}

function valuationSourceHint(
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

function listedTestAssets(
  mintSet: LocalTestMintSet | null,
  snapshot: BasketSnapshot | null,
): (LocalTestMint & { id: string })[] {
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

function toOperationSnapshot(snapshot: BasketSnapshot): OperationSnapshot {
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

function primaryAction({
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
}): { label: string; title: string; run: "issue" | "create" | "deposit"; disabled: boolean } {
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

function Metric({ label, value, hint = "" }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border-l border-black/10 pl-4 first:border-l-0 first:pl-0 md:pl-6">
      <dt className="text-xs text-[var(--muted)]">{label}</dt>
      <dd className="mt-1 font-mono text-lg font-semibold tabular-nums">{value}</dd>
      {hint ? <p className="mt-1 text-[11px] text-[var(--muted)]">{hint}</p> : null}
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">{label}</dt><dd className="font-medium">{value}</dd></div>;
}

function ReferenceQuotes({
  quotes,
  source,
  loading,
}: {
  quotes: readonly PythQuote[];
  source: "hermes" | "local-test" | null;
  loading: boolean;
}) {
  return (
    <div className="mt-4 border-t border-black/8 pt-4">
      <p className="mb-2 text-[11px] font-semibold uppercase text-[var(--muted)]">
        {source === "hermes" ? "Pyth Hermes quotes" : "Pyth local test quotes"}
      </p>
      <ul className="space-y-1 font-mono text-[11px] text-[var(--muted)]">
        {LocalTestFeedMap.BINDINGS.map((row) => {
          const quote = quotes.find((item) => item.feedId === row.feed.id);
          return (
            <li className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-3" key={row.localSymbol}>
              <span className="min-w-0 break-all">
                {row.localSymbol} → {row.feed.pythSymbol}
              </span>
              <span className="sm:shrink-0 sm:text-right">
                {quote
                  ? BasketValuation.formatUnitPrice(quote)
                  : loading
                    ? "Checking"
                    : "Not priced"}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">
        {source === "hermes"
          ? "Stand-in mapping only. Local mints are not those issuers."
          : "Hermetic Pyth-format marks, not live markets. Local mints are not those issuers."}
      </p>
    </div>
  );
}

function ChainPanel({
  balances,
  mintSet,
  notice,
  quotes,
  recovery,
}: {
  balances: LocalBasketBalances | null;
  mintSet: LocalTestMintSet | null;
  notice: ChainNotice | null;
  quotes: PythQuote[];
  recovery: ReturnType<typeof nextAction>;
}) {
  const snapshot = balances?.snapshot;
  return (
    <div className="space-y-3">
      <div className="rounded-[6px] border border-black/10 bg-white p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 text-[var(--green)]" size={18} />
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {snapshot
                ? `Phase ${snapshot.phase} · nonce ${snapshot.operationNonce.toString()}`
                : "No basket account yet"}
            </p>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
              {snapshot
                ? `PDA ${shortPublicKey(snapshot.address)}. ${recovery.kind === "prepare-leg"
                  ? "A leg is open on chain. Jupiter is the execution rail, but this local validator does not host Jupiter AMMs. Exit in kind, or use mock-swap in local-testing Anchor tests."
                  : recovery.kind === "finish"
                    ? "All legs are complete on chain. Finish the operation, then withdraw if needed."
                    : recovery.kind === "withdraw-holdings"
                      ? "Exit is active. Withdraw current holdings in kind."
                      : "Balances below are from confirmed token accounts."}`
                : "Create a personal basket (ID 1) after issuing local test mints."}
            </p>
            {snapshot ? (
              <ul className="mt-2 space-y-1 font-mono text-[11px] text-[var(--muted)]">
                {valueCustody(balances, mintSet, quotes).holdings.map((held) => (
                  <li key={held.mint}>
                    {held.symbol} · {formatAmount(held.amount, held.decimals)}
                    {" · "}
                    {held.status === "priced" && held.usdAtoms !== null
                      ? BasketValuation.formatUsd(held.usdAtoms)
                      : "Not priced"}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </div>
      {notice ? (
        <div className={`rounded-[6px] border p-4 ${
          notice.tone === "error"
            ? "border-[var(--red)]/30 bg-[#fff8f5]"
            : notice.tone === "ok"
              ? "border-[var(--green)]/25 bg-white"
              : "border-[var(--blue)]/25 bg-[#f5f8fc]"
        }`}>
          <div className="flex items-start gap-3">
            {notice.tone === "error"
              ? <AlertTriangle className="mt-0.5 text-[var(--red)]" size={18} />
              : <ShieldCheck className="mt-0.5 text-[var(--green)]" size={18} />}
            <div className="min-w-0">
              <p className="text-sm font-semibold">{notice.title}</p>
              <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{notice.detail}</p>
              {notice.signature ? (
                <p className="mt-1 truncate font-mono text-[11px] text-[var(--muted)]">
                  sig {notice.signature}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
