"use client";

import { ArrowRight, RefreshCw, ShieldCheck } from "lucide-react";
import { PublicKey } from "@solana/web3.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatAmount, parseAmount } from "../lib/amounts.ts";
import { shortPublicKey } from "../lib/solana/injected-wallet";

type CatalogAsset = {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  tokenProgram: string;
  tags: string[];
  kind: "xstock" | "index";
  verified: boolean | null;
  source: "jupiter";
};

type CatalogPayload = {
  source: "jupiter" | "backpack-backup" | "blocked";
  catalogLabel: "live" | "blocked";
  usedSearchFallback: boolean;
  detail: string;
  funding: {
    mint: string;
    symbol: string;
    name: string;
    decimals: number;
    tokenProgram: string;
  } | null;
  assets: CatalogAsset[];
  backpack: {
    symbol: string;
    baseSymbol: string;
    quoteSymbol: string;
    marketType: string;
    rwaMarketType: string;
  }[];
};

type QuotePayload = {
  label: string;
  notAFill: boolean;
  error?: string;
  inputMint?: string;
  outputMint?: string;
  inAmount?: string;
  outAmount?: string;
  otherAmountThreshold?: string;
  swapMode?: string;
  slippageBps?: number;
  priceImpactPct?: string | null;
  routePlan?: { label: string; percent: number; ammKey: string }[];
  swapInstruction?: { programId: string; accounts: unknown[]; data: string };
};

export function JupiterRail({
  jupiterSwapDeployed,
}: {
  jupiterSwapDeployed: boolean | null;
}) {
  const [catalog, setCatalog] = useState<CatalogPayload | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMint, setSelectedMint] = useState<string | null>(null);
  const [amount, setAmount] = useState("1");
  const [quote, setQuote] = useState<QuotePayload | null>(null);
  const [quoting, setQuoting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setCatalogError(null);
    try {
      const response = await fetch("/api/jupiter/inventory", { cache: "no-store" });
      const body = await response.json() as CatalogPayload;
      setCatalog(body);
      setSelectedMint((current) => {
        if (current && body.assets.some((asset) => asset.mint === current)) return current;
        return body.assets[0]?.mint ?? null;
      });
    } catch (error) {
      setCatalog(null);
      setCatalogError(error instanceof Error ? error.message : "Jupiter inventory failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selected = catalog?.assets.find((asset) => asset.mint === selectedMint) ?? null;
  const indexes = catalog?.assets.filter((asset) => asset.kind === "index") ?? [];
  const xstocks = catalog?.assets.filter((asset) => asset.kind === "xstock") ?? [];
  const funding = catalog?.funding ?? null;

  let amountError = "";
  let rawAmount: bigint | null = null;
  try {
    rawAmount = parseAmount(amount, funding?.decimals ?? 6);
  } catch (error) {
    amountError = error instanceof Error ? error.message : "Invalid amount";
  }

  const sourceBadge = useMemo(() => {
    if (!catalog) return "UNCHECKED";
    if (catalog.source === "jupiter" && catalog.catalogLabel === "live") return "JUPITER LIVE";
    if (catalog.source === "backpack-backup") return "BACKPACK BACKUP";
    return "JUPITER BLOCKED";
  }, [catalog]);

  async function previewRoute(): Promise<void> {
    if (!selected || !funding || !rawAmount || rawAmount <= 0n) return;
    setQuoting(true);
    setQuote(null);
    try {
      const params = new URLSearchParams({
        inputMint: funding.mint,
        outputMint: selected.mint,
        amount: rawAmount.toString(),
        taker: PublicKey.default.toBase58(),
      });
      const response = await fetch(`/api/jupiter/build?${params}`, { cache: "no-store" });
      const body = await response.json() as QuotePayload;
      setQuote(body);
    } catch (error) {
      setQuote({
        label: "jupiter-quote",
        notAFill: true,
        error: error instanceof Error ? error.message : "Jupiter /build failed",
      });
    } finally {
      setQuoting(false);
    }
  }

  return (
    <section className="mt-8 rounded-[6px] border border-black/10 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-black/10 px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Inventory rail
          </p>
          <h2 className="text-base font-semibold">Jupiter xStocks and indexes</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="border border-black/15 px-2 py-1 text-[11px] font-medium text-muted-foreground">
            {sourceBadge}
          </span>
          <button
            aria-label="Refresh Jupiter inventory"
            className="grid size-8 place-items-center rounded-[6px] border border-black/15 hover:bg-black/5"
            onClick={() => void refresh()}
            type="button"
          >
            <RefreshCw className={loading ? "animate-spin" : ""} size={14} />
          </button>
        </div>
      </div>

      <div className="space-y-3 px-4 py-4 text-sm">
        <p className="text-xs leading-5 text-muted-foreground">
          Jupiter is the primary inventory and execution rail. Quotes below are
          `/swap/v2/build` responses, not fills. Local test mints stay on the
          validator and are not Jupiter markets. Mock-swap remains the
          local-testing fallback. Backpack is used only if Jupiter is blocked,
          and those rows are venue symbols without Solana mints.
        </p>
        <p className="text-xs leading-5 break-words text-muted-foreground">
          {catalog?.detail ?? catalogError ?? (loading ? "Loading Jupiter inventory…" : "")}
        </p>
        <p className="text-xs leading-5 text-muted-foreground">
          Jupiter v6 program on this local validator:{" "}
          {jupiterSwapDeployed === true
            ? "deployed"
            : jupiterSwapDeployed === false
              ? "not present — CPI cannot land here"
              : "unchecked"}
          .
        </p>

        {indexes.length + xstocks.length === 0 && (catalog?.backpack.length ?? 0) === 0 ? (
          <p className="text-xs text-muted-foreground">
            No Jupiter inventory is available. The UI will not invent xStock mints.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <AssetGroup
              title="Indexes"
              assets={indexes}
              selectedMint={selectedMint}
              onSelect={setSelectedMint}
            />
            <AssetGroup
              title="xStocks"
              assets={xstocks}
              selectedMint={selectedMint}
              onSelect={setSelectedMint}
            />
          </div>
        )}

        {(catalog?.backpack.length ?? 0) > 0 ? (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              Backpack backup markets
            </p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {catalog?.backpack.map((market) => (
                <li key={market.symbol}>
                  {market.symbol} · {market.baseSymbol}/{market.quoteSymbol} · no mint
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="grid gap-3 border-t border-black/10 pt-4 md:grid-cols-[1fr_auto] md:items-end">
          <label className="block text-xs font-semibold uppercase text-muted-foreground">
            Quote amount
            <input
              className="mt-2 h-11 w-full rounded-[6px] border border-black/15 px-3 font-mono text-sm outline-none focus:border-ring"
              inputMode="decimal"
              onChange={(event) => setAmount(event.target.value)}
              value={amount}
            />
          </label>
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-[6px] bg-primary px-4 text-sm font-semibold text-white disabled:bg-black/25"
            disabled={quoting || !selected || !funding || Boolean(amountError) || !rawAmount || rawAmount <= 0n}
            onClick={() => void previewRoute()}
            type="button"
          >
            {quoting ? <RefreshCw className="animate-spin" size={14} /> : <ArrowRight size={14} />}
            Preview Jupiter route
          </button>
        </div>
        <p className={`text-xs ${amountError ? "text-destructive" : "text-muted-foreground"}`}>
          {amountError
            || (funding
              ? `Spend ${funding.symbol} (${shortPublicKey(new PublicKey(funding.mint))}) for a Jupiter quote. Min out is otherAmountThreshold, not a fill.`
              : "Jupiter did not return a verified USDC mint, so routing is disabled.")}
        </p>

        {quote ? (
          <div className="rounded-[6px] border border-black/10 bg-[#f7f8f5] p-3">
            <div className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 text-success" size={16} />
              <div className="min-w-0 text-xs leading-5">
                <p className="font-semibold">
                  {quote.error ? "Jupiter quote unavailable" : "Jupiter quote (not a fill)"}
                </p>
                {quote.error ? (
                  <p className="mt-1 text-muted-foreground">{quote.error}</p>
                ) : (
                  <ul className="mt-1 space-y-1 font-mono text-[11px] text-muted-foreground">
                    <li>in {quote.inAmount} → quoted out {quote.outAmount}</li>
                    <li>min out {quote.otherAmountThreshold} · {quote.swapMode} · {quote.slippageBps} bps</li>
                    <li>
                      venues {quote.routePlan?.map((hop) => hop.label).join(", ") || "--"}
                    </li>
                    <li>program {quote.swapInstruction?.programId}</li>
                    <li>
                      accounts {quote.swapInstruction?.accounts.length ?? 0}
                      {funding && quote.inAmount
                        ? ` · display in ${formatAmount(BigInt(quote.inAmount), funding.decimals)} ${funding.symbol}`
                        : ""}
                    </li>
                  </ul>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function AssetGroup({
  title,
  assets,
  selectedMint,
  onSelect,
}: {
  title: string;
  assets: CatalogAsset[];
  selectedMint: string | null;
  onSelect: (mint: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
        {title} · {assets.length}
      </p>
      <div className="max-h-56 overflow-auto rounded-[6px] border border-black/10">
        {assets.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">None from Jupiter.</p>
        ) : assets.map((asset) => {
          const selected = asset.mint === selectedMint;
          return (
            <button
              className={`grid w-full grid-cols-[1fr_auto] items-center border-b border-black/8 px-3 py-2 text-left last:border-b-0 hover:bg-[#f7f8f5] ${
                selected ? "bg-[#f0f2ef]" : ""
              }`}
              key={asset.mint}
              onClick={() => onSelect(asset.mint)}
              type="button"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{asset.symbol}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {asset.name} · {shortPublicKey(new PublicKey(asset.mint))}
                </span>
              </span>
              <span className="text-[11px] text-muted-foreground">
                {asset.verified ? "vrfd" : "unvrfd"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
