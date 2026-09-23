"use client";

import { ArrowRight, RefreshCw, ShieldCheck } from "lucide-react";
import { PublicKey } from "@solana/web3.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatAmount, parseAmount } from "../lib/amounts.ts";
import { shortPublicKey } from "../lib/solana/injected-wallet";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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
  cache?: { status: "miss" | "hit" | "stale"; fetchedAt: number; ageSeconds: number };
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
    if (catalog.source === "jupiter" && catalog.cache?.status === "stale") return "JUPITER CACHED";
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
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <CardDescription className="text-[11px] font-medium tracking-[0.14em] uppercase">
              Inventory rail
            </CardDescription>
            <CardTitle>Jupiter xStocks and indexes</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{sourceBadge}</Badge>
            <Button
              aria-label="Refresh Jupiter inventory"
              onClick={() => void refresh()}
              size="icon-sm"
              type="button"
              variant="outline"
            >
              <RefreshCw className={loading ? "animate-spin" : undefined} />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
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
            <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
              {catalog?.backpack.map((market) => (
                <li key={market.symbol}>
                  {market.symbol} · {market.baseSymbol}/{market.quoteSymbol} · no mint
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="grid gap-3 border-t pt-4 md:grid-cols-[1fr_auto] md:items-end">
          <Field data-invalid={amountError ? true : undefined}>
            <FieldLabel htmlFor="jupiter-quote-amount">Quote amount</FieldLabel>
            <Input
              aria-invalid={amountError ? true : undefined}
              className="h-11 font-mono"
              id="jupiter-quote-amount"
              inputMode="decimal"
              onChange={(event) => setAmount(event.target.value)}
              value={amount}
            />
            {amountError ? (
              <FieldError>{amountError}</FieldError>
            ) : (
              <FieldDescription>
                {funding
                  ? `Spend ${funding.symbol} (${shortPublicKey(new PublicKey(funding.mint))}) for a Jupiter quote. Min out is otherAmountThreshold, not a fill.`
                  : "Jupiter did not return a verified USDC mint, so routing is disabled."}
              </FieldDescription>
            )}
          </Field>
          <Button
            className="h-11"
            disabled={quoting || !selected || !funding || Boolean(amountError) || !rawAmount || rawAmount <= 0n}
            onClick={() => void previewRoute()}
            type="button"
          >
            {quoting ? (
              <RefreshCw className="animate-spin" data-icon="inline-start" />
            ) : (
              <ArrowRight data-icon="inline-start" />
            )}
            Preview Jupiter route
          </Button>
        </div>

        {quote ? (
          <Alert>
            <ShieldCheck />
            <AlertTitle>
              {quote.error ? "Jupiter quote unavailable" : "Jupiter quote (not a fill)"}
            </AlertTitle>
            <AlertDescription>
              {quote.error ? (
                quote.error
              ) : (
                <ul className="mt-1 flex flex-col gap-1 font-mono text-[11px]">
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
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
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
      <div className="max-h-56 overflow-auto rounded-lg border">
        {assets.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">None from Jupiter.</p>
        ) : assets.map((asset) => {
          const selected = asset.mint === selectedMint;
          return (
            <button
              className={cn(
                "grid w-full grid-cols-[1fr_auto] items-center border-b px-3 py-2 text-left last:border-b-0 hover:bg-muted",
                selected && "bg-accent",
              )}
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
