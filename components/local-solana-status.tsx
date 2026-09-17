"use client";

import {
  CircleAlert,
  CircleCheck,
  RefreshCw,
  Wallet,
} from "lucide-react";
import type { PublicKey } from "@solana/web3.js";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  inspectLocalRuntime,
  type LocalRuntimeStatus,
} from "../lib/solana/basket-client";
import {
  asPublicKey,
  getInjectedSolanaWallet,
  shortPublicKey,
  type InjectedSolanaWallet,
} from "../lib/solana/injected-wallet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type WalletStatus =
  | { state: "missing" }
  | { state: "ready" }
  | { state: "connecting" }
  | { state: "connected"; address: string }
  | { state: "error" };

const UNKNOWN_RUNTIME: LocalRuntimeStatus = {
  validator: "offline",
  programDeployed: null,
  jupiterSwapDeployed: null,
  slot: null,
  version: null,
};

export function LocalSolanaStatus({
  onOwnerChange,
  onRuntimeChange,
}: {
  onOwnerChange?: (owner: PublicKey | null) => void;
  onRuntimeChange?: (runtime: LocalRuntimeStatus) => void;
}) {
  const [runtime, setRuntime] = useState(UNKNOWN_RUNTIME);
  const [checking, setChecking] = useState(true);
  const [wallet, setWallet] = useState<WalletStatus>({ state: "missing" });
  const [walletError, setWalletError] = useState<string | null>(null);
  const [injectedWallet, setInjectedWallet] = useState<InjectedSolanaWallet | null>(null);
  const connectingRef = useRef(false);
  const onOwnerChangeRef = useRef(onOwnerChange);
  const onRuntimeChangeRef = useRef(onRuntimeChange);
  onOwnerChangeRef.current = onOwnerChange;
  onRuntimeChangeRef.current = onRuntimeChange;

  const publishOwner = useCallback((owner: PublicKey | null) => {
    onOwnerChangeRef.current?.(owner);
  }, []);

  const refresh = useCallback(async () => {
    setChecking(true);
    const injected = getInjectedSolanaWallet();
    setInjectedWallet(injected);
    const connectedOwner = injected?.isConnected
      ? asPublicKey(injected.publicKey)
      : null;
    if (!connectingRef.current) {
      setWallet(
        connectedOwner
          ? { state: "connected", address: shortPublicKey(connectedOwner) }
          : injected
            ? { state: "ready" }
            : { state: "missing" },
      );
      publishOwner(connectedOwner);
    }
    const nextRuntime = await inspectLocalRuntime();
    setRuntime(nextRuntime);
    onRuntimeChangeRef.current?.(nextRuntime);
    setChecking(false);
  }, [publishOwner]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const injected = injectedWallet;
    if (!injected?.on) return;

    const handleAccountChanged = (publicKey: PublicKey | null) => {
      const owner = asPublicKey(publicKey);
      setWalletError(null);
      connectingRef.current = false;
      setWallet(
        owner
          ? { state: "connected", address: shortPublicKey(owner) }
          : { state: "ready" },
      );
      publishOwner(owner);
    };
    injected.on("accountChanged", handleAccountChanged);
    return () => injected.off?.("accountChanged", handleAccountChanged);
  }, [injectedWallet, publishOwner]);

  async function toggleWallet(): Promise<void> {
    setWalletError(null);
    const injected = getInjectedSolanaWallet();
    if (!injected) {
      connectingRef.current = false;
      setWallet({ state: "missing" });
      publishOwner(null);
      return;
    }

    if (wallet.state === "connected") {
      try {
        await injected.disconnect();
        connectingRef.current = false;
        setWallet({ state: "ready" });
        publishOwner(null);
      } catch {
        setWalletError("Disconnect failed. Try again.");
      }
      return;
    }

    connectingRef.current = true;
    setWallet({ state: "connecting" });
    try {
      const result = await injected.connect();
      const owner = asPublicKey(result.publicKey);
      connectingRef.current = false;
      if (!owner) {
        setWallet({ state: "error" });
        publishOwner(null);
        return;
      }
      setWallet({
        state: "connected",
        address: shortPublicKey(owner),
      });
      publishOwner(owner);
    } catch {
      connectingRef.current = false;
      setWallet({ state: "error" });
      publishOwner(null);
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
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Badge variant="outline">LOCAL TEST</Badge>
      <StatusChip
        label="Validator"
        state={checking ? "checking" : runtime.validator === "online" ? "ok" : "warn"}
        value={validatorValue}
      />
      <StatusChip
        label="Program"
        state={checking ? "checking" : runtime.programDeployed ? "ok" : "warn"}
        value={programValue}
      />
      <StatusChip
        label="Jupiter v6"
        state={
          checking
            ? "checking"
            : runtime.jupiterSwapDeployed
              ? "ok"
              : "warn"
        }
        value={
          checking
            ? "Checking"
            : runtime.jupiterSwapDeployed === true
              ? "Deployed"
              : runtime.validator === "online"
                ? "Not on localnet"
                : "Unchecked"
        }
      />
      <div className="flex items-center gap-2">
        <StatusChip
          label="Wallet"
          state={
            wallet.state === "connected"
              ? "ok"
              : wallet.state === "connecting"
                ? "checking"
                : "warn"
          }
          value={walletLabel(wallet)}
        />
        {walletError ? <p role="alert" className="text-xs text-destructive">{walletError}</p> : null}
        {wallet.state !== "missing" ? (
          <Button
            disabled={wallet.state === "connecting"}
            onClick={() => void toggleWallet()}
            size="sm"
            type="button"
            variant={wallet.state === "connected" ? "outline" : "default"}
          >
            {wallet.state === "connecting" ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Wallet data-icon="inline-start" />
            )}
            {wallet.state === "connected" ? "Disconnect" : "Connect wallet"}
          </Button>
        ) : null}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label="Refresh local connection"
              disabled={checking}
              onClick={() => void refresh()}
              size="icon-sm"
              type="button"
              variant="outline"
            >
              <RefreshCw className={checking ? "animate-spin" : undefined} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Refresh local connection</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

function StatusChip({
  label,
  value,
  state,
}: {
  label: string;
  value: string;
  state: "ok" | "warn" | "checking";
}) {
  const Icon = state === "ok" ? CircleCheck : state === "checking" ? Spinner : CircleAlert;
  return (
    <div className="flex min-w-0 items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1">
      <Icon
        className={cn(
          "size-3.5",
          state === "ok" && "text-success",
          state === "checking" && "text-muted-foreground",
          state === "warn" && "text-destructive",
        )}
      />
      <div className="min-w-0">
        <p className="text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
          {label}
        </p>
        <p className="max-w-40 truncate font-mono text-[11px]">{value}</p>
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
