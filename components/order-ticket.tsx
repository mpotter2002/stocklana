import { ArrowRight, Check, ShieldCheck, TriangleAlert } from "lucide-react";
import { formatAmount } from "../lib/amounts.ts";
import type { RecoveryAction } from "../lib/recovery.ts";
import type { PythQuote } from "../lib/pyth/quote.ts";
import { BasketValuation } from "../lib/pyth/valuation.ts";
import { shortPublicKey } from "../lib/solana/injected-wallet";
import type { LocalBasketBalances } from "../lib/solana/local-basket-reader";
import type { LocalTestMintSet } from "../lib/solana/local-test-mints";
import { BasketView, type ListedTestAsset, type PrimaryAction } from "../lib/ui/basket-view.ts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";

export type ChainNotice = {
  tone: "ok" | "error" | "info";
  title: string;
  detail: string;
  signature: string | null;
};

export function OrderTicket({
  selectedAssets,
  weights,
  allocations,
  basketAddress,
  pythSource,
  balances,
  mintSet,
  quotes,
  recovery,
  notice,
  primary,
  busy,
  hasCustody,
  onPrimary,
  onBeginExit,
  onFinish,
  onWithdraw,
}: {
  selectedAssets: ListedTestAsset[];
  weights: number[];
  allocations: bigint[];
  basketAddress: string;
  pythSource: string;
  balances: LocalBasketBalances | null;
  mintSet: LocalTestMintSet | null;
  quotes: readonly PythQuote[];
  recovery: RecoveryAction;
  notice: ChainNotice | null;
  primary: PrimaryAction;
  busy: boolean;
  hasCustody: boolean;
  onPrimary: () => void;
  onBeginExit: () => void;
  onFinish: () => void;
  onWithdraw: () => void;
}) {
  return (
    <Card className="lg:sticky lg:top-6">
      <CardHeader className="border-b">
        <CardTitle>Ticket</CardTitle>
        <CardDescription>
          Equal-weight preview, then a signed local-validator submit.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-3">
          {selectedAssets.length === 0 ? (
            <p className="text-sm text-muted-foreground">Select two or three assets.</p>
          ) : selectedAssets.map((asset, index) => (
            <div className="flex items-center gap-3" key={asset.id}>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full bg-foreground/70"
                  style={{ width: `${(weights[index] ?? 0) / 100}%` }}
                />
              </span>
              <span className="w-16 text-xs font-medium">{asset.symbol}</span>
              <span className="w-24 text-right font-mono text-xs tabular-nums">
                {allocations[index] === undefined ? "--" : formatAmount(allocations[index], 6)}
              </span>
            </div>
          ))}
        </div>

        <Separator />

        <dl className="flex flex-col gap-2.5 text-sm">
          <TicketRow label="Assets" value={`${selectedAssets.length}`} />
          <TicketRow label="Weighting" value="Equal" />
          <TicketRow label="Basket" value={basketAddress} />
          <TicketRow label="Network" value="Local validator" />
          <TicketRow label="Pyth source" value={pythSource} />
        </dl>

        <ChainPanel
          balances={balances}
          mintSet={mintSet}
          notice={notice}
          quotes={quotes}
          recovery={recovery}
        />
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-2">
        {recovery.kind === "prepare-leg" ? (
          <div className="grid grid-cols-2 gap-2">
            <Button
              disabled={busy || !balances?.snapshot}
              onClick={onBeginExit}
              type="button"
            >
              Begin exit
            </Button>
            <Button disabled type="button" variant="outline">
              Mock/Jupiter later
            </Button>
          </div>
        ) : recovery.kind === "finish" ? (
          <Button
            className="h-11 w-full"
            disabled={busy || !balances?.snapshot}
            onClick={onFinish}
            size="lg"
            type="button"
          >
            <Check data-icon="inline-start" />
            Finish operation
          </Button>
        ) : (
          <div className="flex flex-col gap-2">
            <Button
              className="h-11 w-full"
              disabled={primary.disabled || busy}
              onClick={onPrimary}
              size="lg"
              type="button"
            >
              {busy ? <Spinner data-icon="inline-start" /> : <ArrowRight data-icon="inline-start" />}
              {primary.label}
            </Button>
            {hasCustody && recovery.kind === "none" ? (
              <Button
                disabled={busy || !balances?.snapshot}
                onClick={onWithdraw}
                type="button"
                variant="outline"
              >
                Withdraw holdings
              </Button>
            ) : null}
            {recovery.kind === "withdraw-holdings" ? (
              <Button
                disabled={busy || !balances?.snapshot}
                onClick={onWithdraw}
                type="button"
                variant="outline"
              >
                Withdraw in kind
              </Button>
            ) : null}
          </div>
        )}
        <p className="text-center text-[11px] leading-5 text-muted-foreground">
          Local validator only. Valuation is Pyth (Hermes or labeled local test).
          The UI waits for confirmation and re-reads accounts before treating a
          submit as complete. No mainnet transaction is sent.
        </p>
      </CardFooter>
    </Card>
  );
}

function TicketRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
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
  quotes: readonly PythQuote[];
  recovery: RecoveryAction;
}) {
  const snapshot = balances?.snapshot;
  return (
    <div className="flex flex-col gap-3">
      <Alert>
        <ShieldCheck />
        <AlertTitle>
          {snapshot
            ? `Phase ${snapshot.phase} · nonce ${snapshot.operationNonce.toString()}`
            : "No basket account yet"}
        </AlertTitle>
        <AlertDescription>
          {snapshot
            ? `PDA ${shortPublicKey(snapshot.address)}. ${recovery.kind === "prepare-leg"
              ? "A leg is open on chain. Browser mock/Jupiter execution is not wired; exit in kind to recover."
              : recovery.kind === "finish"
                ? "All legs are complete on chain. Finish the operation, then withdraw if needed."
                : recovery.kind === "withdraw-holdings"
                  ? "Exit is active. Withdraw current holdings in kind."
                  : "Balances below are from confirmed token accounts."}`
            : "Create a personal basket (ID 1) after issuing local test mints."}
          {snapshot ? (
            <ul className="mt-2 flex flex-col gap-1 font-mono text-[11px]">
              {BasketView.valueCustody(balances, mintSet, quotes).holdings.map((held) => (
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
        </AlertDescription>
      </Alert>
      {notice ? (
        <Alert variant={notice.tone === "error" ? "destructive" : "default"}>
          {notice.tone === "error" ? <TriangleAlert /> : <ShieldCheck />}
          <AlertTitle>{notice.title}</AlertTitle>
          <AlertDescription>
            {notice.detail}
            {notice.signature ? (
              <p className="mt-1 truncate font-mono text-[11px]">
                sig {notice.signature}
              </p>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
