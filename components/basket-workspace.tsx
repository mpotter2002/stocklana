"use client";

import {
  AlertTriangle,
  ArrowRight,
  Check,
  CircleDollarSign,
  Layers3,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { allocateInvestment, equalWeights } from "../lib/allocation.ts";
import { formatAmount, parseAmount } from "../lib/amounts.ts";
import { LocalSolanaStatus } from "./local-solana-status";

const ASSETS = [
  { id: "alpha", symbol: "ALPHAt", name: "Alpha test equity", color: "#2f6f58" },
  { id: "beacon", symbol: "BEACONt", name: "Beacon test equity", color: "#3d68a0" },
  { id: "cedar", symbol: "CEDARt", name: "Cedar test equity", color: "#b45b46" },
] as const;

type Execution = "draft" | "ready" | "running" | "attention" | "complete" | "exiting";

export function BasketWorkspace() {
  const [connected, setConnected] = useState(false);
  const [selected, setSelected] = useState<string[]>(["alpha", "beacon"]);
  const [amount, setAmount] = useState("25");
  const [execution, setExecution] = useState<Execution>("draft");
  const [completed, setCompleted] = useState(0);
  const [testRecovery, setTestRecovery] = useState(true);
  const selectedAssets = ASSETS.filter((asset) => selected.includes(asset.id));
  const weights = equalWeights(selectedAssets.length);

  let allocations: bigint[] = [];
  let amountError = "";
  try {
    allocations = allocateInvestment(parseAmount(amount, 6), selectedAssets.length);
  } catch (error) {
    amountError = error instanceof Error ? error.message : "Invalid amount";
  }

  function resetExecution(): void {
    setExecution("draft");
    setCompleted(0);
  }

  function toggleAsset(id: string): void {
    setSelected((current) => {
      if (current.includes(id)) {
        return current.length === 2 ? current : current.filter((item) => item !== id);
      }
      return current.length === 3 ? current : [...current, id];
    });
    resetExecution();
  }

  function advance(): void {
    if (execution === "draft") {
      setExecution("ready");
      return;
    }
    if (execution === "ready") {
      setCompleted(1);
      setExecution(selectedAssets.length === 1 ? "complete" : "running");
      return;
    }
    if (execution === "running" && testRecovery && completed === 1) {
      setExecution("attention");
      return;
    }
    completeNextLeg();
  }

  function completeNextLeg(): void {
    const next = completed + 1;
    setCompleted(next);
    setExecution(next === selectedAssets.length ? "complete" : "running");
  }

  const actionLabel = !connected
    ? "Use fixture wallet"
    : amountError
      ? "Check amount"
      : execution === "draft"
        ? "Prepare basket"
        : execution === "ready"
          ? "Execute leg 1"
          : execution === "running"
            ? `Execute leg ${completed + 1}`
            : execution === "complete"
              ? "Basket complete"
              : execution === "exiting"
                ? "Recovered in kind"
                : "Action required";

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
              LOCAL FIXTURES
            </span>
            <button
              className="inline-flex h-9 items-center gap-2 rounded-[6px] border border-white/20 px-3 text-sm font-medium hover:bg-white/10"
              onClick={() => {
                setConnected((value) => !value);
                resetExecution();
              }}
              type="button"
            >
              {connected ? <LogOut size={15} /> : <Wallet size={15} />}
              {connected ? "8XnQ...fixture" : "Demo wallet"}
            </button>
          </div>
        </div>
      </header>

      <section className="border-b border-black/10 bg-white">
        <dl className="mx-auto grid max-w-[1440px] grid-cols-2 gap-y-5 px-5 py-6 md:grid-cols-4 md:px-8">
          <Metric label="Portfolio value" value="$0.00" />
          <Metric label="Invested" value="$0.00" />
          <Metric label="Available USDC" value={connected ? "$125.00" : "--"} />
          <Metric label="Open baskets" value="0" />
        </dl>
      </section>

      <LocalSolanaStatus />

      <div className="mx-auto grid max-w-[1440px] lg:grid-cols-[minmax(0,1fr)_390px]">
        <section className="px-5 py-8 md:px-8 lg:border-r lg:border-black/10">
          <div className="mb-7 flex items-end justify-between gap-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-[var(--muted)]">
                New basket
              </p>
              <h1 className="text-2xl font-semibold">Choose your holdings</h1>
            </div>
            <span className="text-sm tabular-nums text-[var(--muted)]">
              {selected.length}/3 selected
            </span>
          </div>

          <div className="overflow-hidden rounded-[6px] border border-black/10 bg-white">
            <div className="grid grid-cols-[1fr_90px_44px] border-b border-black/10 bg-[#f0f2ef] px-4 py-2 text-[11px] font-semibold uppercase text-[var(--muted)]">
              <span>Asset</span><span className="text-right">Target</span><span />
            </div>
            {ASSETS.map((asset) => {
              const index = selectedAssets.findIndex((item) => item.id === asset.id);
              const isSelected = index !== -1;
              return (
                <button
                  aria-pressed={isSelected}
                  className="grid w-full grid-cols-[1fr_90px_44px] items-center border-b border-black/8 px-4 py-4 text-left last:border-b-0 hover:bg-[#f7f8f5] disabled:cursor-not-allowed"
                  disabled={isSelected && selected.length === 2}
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
                      <span className="block truncate text-xs text-[var(--muted)]">{asset.name}</span>
                    </span>
                  </span>
                  <span className="text-right font-mono text-sm tabular-nums">
                    {isSelected ? `${(weights[index] ?? 0) / 100}%` : "--"}
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
            Investment
          </label>
          <div className="mt-2 flex max-w-md items-center rounded-[6px] border border-black/15 bg-white focus-within:border-[var(--blue)] focus-within:ring-2 focus-within:ring-[var(--blue)]/10">
            <CircleDollarSign className="ml-3 text-[var(--muted)]" size={18} />
            <input
              className="h-12 min-w-0 flex-1 bg-transparent px-3 font-mono text-lg outline-none"
              id="investment"
              inputMode="decimal"
              onChange={(event) => {
                setAmount(event.target.value);
                resetExecution();
              }}
              value={amount}
            />
            <span className="pr-4 text-xs font-semibold text-[var(--muted)]">USDC</span>
          </div>
          <p className={`mt-2 min-h-5 text-xs ${amountError ? "text-[var(--red)]" : "text-[var(--muted)]"}`}>
            {amountError || "Local calculation only"}
          </p>
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
                  {allocations[index] === undefined ? "--" : `$${formatAmount(allocations[index], 6)}`}
                </span>
              </div>
            ))}
          </div>

          <dl className="my-6 space-y-3 border-y border-black/10 py-5 text-sm">
            <PreviewRow label="Assets" value={`${selectedAssets.length}`} />
            <PreviewRow label="Weighting" value="Equal" />
            <PreviewRow label="Execution" value="Sequential" />
            <PreviewRow label="Network" value="Local validator" />
          </dl>

          <label className="flex cursor-pointer items-center justify-between gap-4 text-sm">
            <span className="flex items-center gap-2">
              <ShieldCheck size={17} className="text-[var(--green)]" />
              Test recovery
            </span>
            <input
              checked={testRecovery}
              className="size-4 accent-[var(--green)]"
              onChange={(event) => {
                setTestRecovery(event.target.checked);
                resetExecution();
              }}
              type="checkbox"
            />
          </label>

          <ExecutionPanel completed={completed} count={selectedAssets.length} state={execution} />

          {execution === "attention" ? (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-[6px] bg-[var(--ink)] px-4 text-sm font-semibold text-white"
                onClick={completeNextLeg}
                type="button"
              >
                <RefreshCw size={15} />Retry leg
              </button>
              <button
                className="inline-flex h-11 items-center justify-center rounded-[6px] border border-black/20 bg-white px-4 text-sm font-semibold"
                onClick={() => setExecution("exiting")}
                type="button"
              >
                Exit in kind
              </button>
            </div>
          ) : (
            <button
              className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[6px] bg-[var(--ink)] px-4 text-sm font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:bg-black/25"
              disabled={execution === "complete" || execution === "exiting" || Boolean(amountError)}
              onClick={!connected ? () => setConnected(true) : advance}
              type="button"
            >
              {execution === "complete" ? <Check size={16} /> : <ArrowRight size={16} />}
              {actionLabel}
            </button>
          )}
          <p className="mt-4 text-center text-[11px] leading-5 text-[var(--muted)]">
            Local fixtures only. No wallet transaction or market order is sent.
          </p>
        </aside>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l border-black/10 pl-4 first:border-l-0 first:pl-0 md:pl-6">
      <dt className="text-xs text-[var(--muted)]">{label}</dt>
      <dd className="mt-1 font-mono text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">{label}</dt><dd className="font-medium">{value}</dd></div>;
}

function ExecutionPanel({ state, completed, count }: {
  state: Execution;
  completed: number;
  count: number;
}) {
  if (state === "draft") return null;
  const attention = state === "attention";
  const exiting = state === "exiting";
  return (
    <div className={`mt-5 rounded-[6px] border p-4 ${
      attention ? "border-[var(--red)]/30 bg-[#fff8f5]"
        : exiting ? "border-[var(--blue)]/25 bg-[#f5f8fc]"
          : "border-black/10 bg-white"
    }`}>
      <div className="flex items-start gap-3">
        {attention ? <AlertTriangle className="mt-0.5 text-[var(--red)]" size={18} />
          : <ShieldCheck className="mt-0.5 text-[var(--green)]" size={18} />}
        <div>
          <p className="text-sm font-semibold">
            {attention ? `Leg ${completed + 1} needs attention`
              : exiting ? "Assets recovered"
                : state === "complete" ? "Basket complete"
                  : `${completed} of ${count} legs complete`}
          </p>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            {attention ? "Completed legs remain recorded. Retry or recover current holdings."
              : exiting ? "Holdings and residual USDC returned to the test wallet."
                : "Progress reflects the current operation snapshot."}
          </p>
        </div>
      </div>
    </div>
  );
}
