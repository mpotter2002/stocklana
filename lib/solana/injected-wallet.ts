import {
  PublicKey,
  type Transaction,
  type VersionedTransaction,
} from "@solana/web3.js";

type WalletTransaction = Transaction | VersionedTransaction;

export interface InjectedSolanaWallet {
  publicKey?: PublicKey | null;
  isConnected?: boolean;
  connect(options?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: PublicKey }>;
  disconnect(): Promise<void>;
  signTransaction?<T extends WalletTransaction>(transaction: T): Promise<T>;
  signAllTransactions?<T extends WalletTransaction>(transactions: T[]): Promise<T[]>;
  on?(event: "accountChanged", handler: (publicKey: PublicKey | null) => void): void;
  off?(event: "accountChanged", handler: (publicKey: PublicKey | null) => void): void;
}

declare global {
  interface Window {
    solana?: InjectedSolanaWallet;
  }
}

export function getInjectedSolanaWallet(): InjectedSolanaWallet | null {
  if (typeof window === "undefined") return null;
  const wallet = window.solana;
  return wallet && typeof wallet.connect === "function" ? wallet : null;
}

export function shortPublicKey(publicKey: PublicKey): string {
  const value = publicKey.toBase58();
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
