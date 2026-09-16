"use client";

import {
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  RefreshCw,
  Wallet,
} from "lucide-react";
import type { PublicKey } from "@solana/web3.js";
import { useCallback, useEffect, useState } from "react";
import {
  inspectLocalRuntime,
  type LocalRuntimeStatus,
} from "../lib/solana/basket-client";
import {
  getInjectedSolanaWallet,
  shortPublicKey,
  type InjectedSolanaWallet,
} from "../lib/solana/injected-wallet";

type WalletStatus =
  | { state: "missing" }
  | { state: "ready" }
  | { state: "connecting" }
  | { state: "connected"; address: string }
  | { state: "error" };

const UNKNOWN_RUNTIME: LocalRuntimeStatus = {
  validator: "offline",
  programDeployed: null,
  slot: null,
  version: null,
};

export function LocalSolanaStatus() {
  const [runtime, setRuntime] = useState(UNKNOWN_RUNTIME);
  const [checking, setChecking] = useState(true);
  const [wallet, setWallet] = useState<WalletStatus>({ state: "missing" });
  const [walletError, setWalletError] = useState<string | null>(null);
  const [injectedWallet, setInjectedWallet] = useState<InjectedSolanaWallet | null>(null);

  const refresh = useCallback(async () => {
    setChecking(true);
    const injected = getInjectedSolanaWallet();
    setInjectedWallet(injected);
    setWallet((current) => {
      if (current.state === "connecting") {
        return current;
      }
      if (injected?.isConnected && injected.publicKey) {
        return { state: "connected", address: shortPublicKey(injected.publicKey) };
      }
      return injected ? { state: "ready" } : { state: "missing" };
    });
    setRuntime(await inspectLocalRuntime());
    setChecking(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const injected = injectedWallet;
    if (!injected?.on) return;

    const handleAccountChanged = (publicKey: PublicKey | null) => {
      setWalletError(null);
      setWallet(
        publicKey
          ? { state: "connected", address: shortPublicKey(publicKey) }
          : { state: "ready" },
      );
    };
    injected.on("accountChanged", handleAccountChanged);
    return () => injected.off?.("accountChanged", handleAccountChanged);
  }, [injectedWallet]);

  async function toggleWallet(): Promise<void> {
    setWalletError(null);
    const injected = getInjectedSolanaWallet();
    if (!injected) {
      setWallet({ state: "missing" });
      return;
    }

    if (wallet.state === "connected") {
      try {
        await injected.disconnect();
        setWallet({ state: "ready" });
      } catch {
        setWalletError("Disconnect failed. Try again.");
      }
      return;
    }

    setWallet({ state: "connecting" });
    try {
      const result = await injected.connect();
      setWallet({
        state: "connected",
        address: shortPublicKey(result.publicKey),
      });
    } catch {
      setWallet({ state: "error" });
    }
  }

  const validatorValue = checking
    ? "Checking"
    : runtime.validator === "online"
      ? `Online · slot ${runtime.slot?.toLocaleString("en-US")}`
      : "Offline";
  const programValue = checking
    ? "Checking"
    : runtime.programDeployed === true
      ? "Deployed"
      : runtime.programDeployed === false
        ? "Not deployed"
        : "Unchecked";

  return (
    <section className="border-b border-black/10 bg-[#edf2f0]">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-5 py-4 md:px-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
          <StatusItem
            label="Local validator"
            state={
              checking
                ? "checking"
                : runtime.validator === "online"
                  ? "ok"
                  : "warn"
            }
            value={validatorValue}
          />
          <StatusItem
            label="Basket program"
            state={
              checking ? "checking" : runtime.programDeployed ? "ok" : "warn"
            }
            value={programValue}
          />
          <StatusItem
            label="Browser wallet"
            state={
              wallet.state === "connected"
                ? "ok"
                : wallet.state === "connecting"
                  ? "checking"
                  : "warn"
            }
            value={walletLabel(wallet)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {walletError ? <p role="alert" className="text-xs text-[var(--red)]">{walletError}</p> : null}
          {wallet.state !== "missing" ? (
            <button
              className="inline-flex h-9 items-center gap-2 rounded-[6px] border border-black/15 bg-white px-3 text-sm font-medium hover:bg-black/5 disabled:cursor-wait"
              disabled={wallet.state === "connecting"}
              onClick={() => void toggleWallet()}
              type="button"
            >
              <Wallet size={15} aria-hidden="true" />
              {wallet.state === "connected" ? "Disconnect" : "Connect wallet"}
            </button>
          ) : null}
          <button
            aria-label="Refresh local connection"
            className="grid size-9 place-items-center rounded-[6px] border border-black/15 bg-white hover:bg-black/5 disabled:cursor-wait"
            disabled={checking}
            onClick={() => void refresh()}
            title="Refresh local connection"
            type="button"
          >
            <RefreshCw className={checking ? "animate-spin" : ""} size={15} />
          </button>
        </div>
      </div>
    </section>
  );
}

function StatusItem({
  label,
  value,
  state,
}: {
  label: string;
  value: string;
  state: "ok" | "warn" | "checking";
}) {
  const Icon =
    state === "ok"
      ? CircleCheck
      : state === "checking"
        ? LoaderCircle
        : CircleAlert;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Icon
        className={
          state === "ok"
            ? "text-[var(--green)]"
            : state === "checking"
              ? "animate-spin text-[var(--blue)]"
              : "text-[var(--red)]"
        }
        size={16}
      />
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase text-[var(--muted)]">
          {label}
        </p>
        <p className="truncate text-xs font-medium">{value}</p>
      </div>
    </div>
  );
}

function walletLabel(wallet: WalletStatus): string {
  if (wallet.state === "connected") return wallet.address;
  if (wallet.state === "connecting") return "Connecting";
  if (wallet.state === "ready") return "Ready";
  if (wallet.state === "error") return "Connection declined";
  return "Not detected";
}
