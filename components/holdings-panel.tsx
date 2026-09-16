"use client";

import { Check, Layers3 } from "lucide-react";
import { LocalTestFeedMap } from "../lib/pyth/local-test-map.ts";
import type { PythQuote } from "../lib/pyth/quote.ts";
import { BasketValuation } from "../lib/pyth/valuation.ts";
import { shortPublicKey } from "../lib/solana/injected-wallet";
import { BasketView, type ListedTestAsset } from "../lib/ui/basket-view.ts";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export function HoldingsPanel({
  listedAssets,
  selectedAssets,
  selected,
  weights,
  snapshotLocked,
  quotes,
  quotesLoading,
  quoteSource,
  amount,
  amountError,
  onAmountChange,
  onToggleAsset,
}: {
  listedAssets: ListedTestAsset[];
  selectedAssets: ListedTestAsset[];
  selected: string[];
  weights: number[];
  snapshotLocked: boolean;
  quotes: readonly PythQuote[];
  quotesLoading: boolean;
  quoteSource: "hermes" | "local-test" | null;
  amount: string;
  amountError: string;
  onAmountChange: (value: string) => void;
  onToggleAsset: (id: string) => void;
}) {
  return (
    <section className="flex flex-col gap-8">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
            {snapshotLocked ? "On-chain basket" : "New basket"}
          </p>
          <h1 className="font-heading text-3xl tracking-tight">
            {snapshotLocked ? "Holdings from confirmed state" : "Choose your holdings"}
          </h1>
        </div>
        <Badge variant="secondary">{selected.length}/3 selected</Badge>
      </div>

      {listedAssets.length === 0 ? (
        <Empty className="border border-dashed bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Layers3 />
            </EmptyMedia>
            <EmptyTitle>No local test mints yet</EmptyTitle>
            <EmptyDescription>
              Connect a local wallet, then issue local test tokens. Mint addresses
              are created on the validator, not taken from fixtures.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="max-w-md">
            <ReferenceQuotes
              loading={quotesLoading}
              quotes={quotes}
              source={quoteSource}
            />
          </EmptyContent>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead>Quote</TableHead>
                <TableHead className="text-right">Target</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {listedAssets.map((asset) => {
                const selectedIndex = selectedAssets.findIndex((item) => item.id === asset.id);
                const isSelected = selectedIndex !== -1;
                const disabled = snapshotLocked || (isSelected && selected.length === 2);
                return (
                  <TableRow
                    aria-pressed={isSelected}
                    className={cn(
                      "cursor-pointer",
                      disabled && "cursor-not-allowed opacity-80",
                    )}
                    data-state={isSelected ? "selected" : undefined}
                    key={asset.id}
                    onClick={() => {
                      if (!disabled) onToggleAsset(asset.id);
                    }}
                    onKeyDown={(event) => {
                      if (disabled) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onToggleAsset(asset.id);
                      }
                    }}
                    role="button"
                    tabIndex={disabled ? -1 : 0}
                  >
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar size="sm">
                          <AvatarFallback
                            className="text-[10px] font-semibold text-primary-foreground"
                            style={{ backgroundColor: asset.color }}
                          >
                            {asset.symbol[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="font-medium">{asset.symbol}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {asset.name} · {shortPublicKey(asset.mint)}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-56 whitespace-normal text-xs text-muted-foreground">
                      {BasketView.assetPriceCaption(asset.symbol, quotes)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {isSelected ? `${(weights[selectedIndex] ?? 0) / 100}%` : "--"}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "ml-auto grid size-6 place-items-center rounded-md border",
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border",
                        )}
                      >
                        {isSelected ? <Check className="size-3.5" /> : null}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <FieldGroup className="max-w-md">
        <Field data-invalid={amountError ? true : undefined}>
          <FieldLabel htmlFor="investment">Deposit</FieldLabel>
          <InputGroup className="h-11">
            <InputGroupInput
              aria-invalid={amountError ? true : undefined}
              id="investment"
              inputMode="decimal"
              onChange={(event) => onAmountChange(event.target.value)}
              value={amount}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupText>USDCt</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
          {amountError ? (
            <FieldError>{amountError}</FieldError>
          ) : (
            <FieldDescription>
              Local test token, 6 decimals. Split below is a calculation only.
            </FieldDescription>
          )}
        </Field>
      </FieldGroup>
    </section>
  );
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
    <div className="w-full max-w-md text-left">
      <p className="mb-2 text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
        {BasketView.quotesHeading(source)}
      </p>
      <ul className="flex flex-col gap-1.5 font-mono text-xs text-muted-foreground">
        {LocalTestFeedMap.BINDINGS.map((row) => {
          const quote = quotes.find((item) => item.feedId === row.feed.id);
          return (
            <li
              className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-3"
              key={row.localSymbol}
            >
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
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {BasketView.quotesFootnote(source)}
      </p>
    </div>
  );
}
