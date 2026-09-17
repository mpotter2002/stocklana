"use client";

import { PublicKey, type Signer, type TransactionInstruction } from "@solana/web3.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { allocateInvestment, equalWeights } from "../lib/allocation.ts";
import { formatAmount, parseAmount } from "../lib/amounts.ts";
import {
  createLocalConnection,
  deriveBasketAddress,
  fetchBasketSnapshot,
  type LocalRuntimeStatus,
} from "../lib/solana/basket-client";
import { BasketInstructions } from "../lib/solana/basket-instructions";
import { getInjectedSolanaWallet, shortPublicKey } from "../lib/solana/injected-wallet";
import {
  DEFAULT_BASKET_ID,
  LocalBasketReader,
  type LocalBasketBalances,
} from "../lib/solana/local-basket-reader";
import {
  LocalSolAirdrop,
  LocalTestMints,
  type LocalTestMintSet,
} from "../lib/solana/local-test-mints";
import {
  LocalTransactionError,
  LocalTransactionRunner,
  describeLocalTransactionError,
} from "../lib/solana/local-transaction";
import { PythQuoteClient } from "../lib/pyth/quote-client.ts";
import { LocalTestFeedMap } from "../lib/pyth/local-test-map.ts";
import type { PythQuoteSet } from "../lib/pyth/quote-service.ts";
import { BasketView } from "../lib/ui/basket-view.ts";
import { HoldingsPanel } from "./holdings-panel";
import { JupiterRail } from "./jupiter-rail";
import { LocalSolanaStatus } from "./local-solana-status";
import { OrderTicket, type ChainNotice } from "./order-ticket";
import { PortfolioSummary } from "./portfolio-summary";
import { ThemeToggle } from "./theme-toggle";

const UNKNOWN_RUNTIME: LocalRuntimeStatus = {
  validator: "offline",
  programDeployed: null,
  jupiterSwapDeployed: null,
  slot: null,
  version: null,
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

  const listedAssets = BasketView.listedAssets(mintSet, balances?.snapshot ?? null);
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

  const primary = BasketView.primaryAction({
    owner,
    runtime,
    mintSet,
    balances,
    amountError,
    busy,
  });
  const recovery = BasketView.recovery(balances?.snapshot);
  const fundingCustody = balances?.custody[0]?.amount ?? 0n;
  const hasCustody = (balances?.custody ?? []).some((held) => held.exists);
  const quotes = quoteSet?.quotes ?? [];
  const valuation = BasketView.valueCustody(balances, mintSet, quotes);
  const valuationHeadline = BasketView.valuationHeadline(
    valuation,
    quotesLoading,
    quoteSet,
    Boolean(balances?.snapshot),
  );
  const valuationHint = BasketView.valuationSourceHint(quoteSet, valuation, quotesLoading);

  return (
    <main className="min-h-screen">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-3 md:flex-row md:items-center md:justify-between md:px-8">
          <div className="flex w-full items-center justify-between gap-3 md:w-auto">
            <div className="flex items-baseline gap-3">
              <p className="font-heading text-2xl italic tracking-tight">Stocklana</p>
              <p className="text-sm text-muted-foreground">Custom baskets</p>
            </div>
            <ThemeToggle />
          </div>
          <LocalSolanaStatus
            onOwnerChange={handleOwnerChange}
            onRuntimeChange={setRuntime}
          />
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-5 py-8 md:px-8 lg:py-10">
        <PortfolioSummary
          custody={balances?.snapshot
            ? `${formatAmount(fundingCustody, 6)} USDCt`
            : "--"}
          headline={valuationHeadline}
          hint={valuationHint}
          openBaskets={owner ? (balances?.snapshot ? "1" : "0") : "--"}
          quotesLoading={quotesLoading}
          walletFunding={owner ? `${formatAmount(balances?.walletFunding ?? 0n, 6)}` : "--"}
        />

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <div className="flex flex-col gap-8">
            <HoldingsPanel
              amount={amount}
              amountError={amountError}
              listedAssets={listedAssets}
              onAmountChange={setAmount}
              onToggleAsset={toggleAsset}
              quoteSource={quoteSet?.source ?? null}
              quotes={quotes}
              quotesLoading={quotesLoading}
              selected={selected}
              selectedAssets={selectedAssets}
              snapshotLocked={snapshotLocked}
              weights={weights}
            />
            <JupiterRail jupiterSwapDeployed={runtime.jupiterSwapDeployed} />
          </div>
          <OrderTicket
            allocations={allocations}
            balances={balances}
            basketAddress={owner ? shortPublicKey(deriveBasketAddress(owner, DEFAULT_BASKET_ID)) : "--"}
            busy={busy}
            hasCustody={hasCustody}
            mintSet={mintSet}
            notice={notice}
            onBeginExit={() => void runAction("Begin in-kind exit", beginExit)}
            onFinish={() => void runAction("Finish operation", finishOperation)}
            onPrimary={() => void runAction(primary.title, primary.run === "issue"
              ? issueTestTokens
              : primary.run === "create"
                ? createBasket
                : deposit)}
            onWithdraw={() => void runAction(
              recovery.kind === "withdraw-holdings" ? "Withdraw holdings" : "Withdraw holdings",
              withdraw,
            )}
            primary={primary}
            pythSource={BasketView.pythSourceLabel(quoteSet, quotesLoading)}
            quotes={quotes}
            recovery={recovery}
            selectedAssets={selectedAssets}
            weights={weights}
          />
        </div>
      </div>
    </main>
  );
}
