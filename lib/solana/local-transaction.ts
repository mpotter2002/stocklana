import {
  AnchorError,
  ProgramError,
} from "@coral-xyz/anchor/dist/browser/index.js";
import {
  SendTransactionError,
  Transaction,
  type ConfirmOptions,
  type SendOptions,
  type TransactionSignature,
} from "@solana/web3.js";
import type { PublicKey, Signer, Transaction as SolanaTransaction } from "@solana/web3.js";
import { LOCAL_RPC_URL } from "./basket-client.ts";
import basketIdl from "./idl/basket.json" with { type: "json" };
import type { InjectedSolanaWallet } from "./injected-wallet.ts";

export type LocalTransactionFailureKind =
  | "not-local"
  | "wallet-unavailable"
  | "wallet-rejected"
  | "expired"
  | "program"
  | "rpc"
  | "confirmation";

export interface LocalWalletSigner {
  publicKey: PublicKey;
  signTransaction(transaction: SolanaTransaction): Promise<SolanaTransaction>;
}

export interface LatestBlockhash {
  blockhash: string;
  lastValidBlockHeight: number;
}

export interface SignatureResult {
  err: unknown;
}

export interface ConfirmResult {
  value: SignatureResult;
}

export interface LocalTransactionConnection {
  rpcEndpoint: string;
  getLatestBlockhash(commitment?: ConfirmOptions["commitment"]): Promise<LatestBlockhash>;
  sendRawTransaction(
    rawTransaction: Buffer | Uint8Array | number[],
    options?: SendOptions,
  ): Promise<TransactionSignature>;
  confirmTransaction(
    strategy: {
      signature: TransactionSignature;
      blockhash: string;
      lastValidBlockHeight: number;
    },
    commitment?: ConfirmOptions["commitment"],
  ): Promise<ConfirmResult>;
}

export interface SubmitInstructions {
  connection: LocalTransactionConnection;
  wallet: LocalWalletSigner;
  instructions: Transaction["instructions"];
  extraSigners?: Signer[];
}

export interface SubmittedTransaction {
  signature: TransactionSignature;
}

const IDL_ERRORS = new Map<number, string>(
  (basketIdl.errors ?? []).map((entry) => [entry.code, entry.msg]),
);

export class LocalTransactionError extends Error {
  readonly kind: LocalTransactionFailureKind;
  readonly signature: TransactionSignature | null;
  readonly programCode: string | null;

  constructor(
    message: string,
    kind: LocalTransactionFailureKind,
    signature: TransactionSignature | null = null,
    programCode: string | null = null,
  ) {
    super(message);
    this.name = "LocalTransactionError";
    this.kind = kind;
    this.signature = signature;
    this.programCode = programCode;
  }
}

export class LocalTransactionRunner {
  static isLocalRpcUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost")
        && parsed.port === "8899";
    } catch {
      return false;
    }
  }

  static signerFromInjected(wallet: InjectedSolanaWallet): LocalWalletSigner {
    if (!wallet.publicKey || !wallet.signTransaction) {
      throw new LocalTransactionError(
        "Connected wallet cannot sign transactions",
        "wallet-unavailable",
      );
    }
    return {
      publicKey: wallet.publicKey,
      signTransaction: (transaction) => wallet.signTransaction!(transaction),
    };
  }

  static async submit(params: SubmitInstructions): Promise<SubmittedTransaction> {
    if (!LocalTransactionRunner.isLocalRpcUrl(params.connection.rpcEndpoint)) {
      throw new LocalTransactionError(
        `Transactions are only enabled for the local validator at ${LOCAL_RPC_URL}`,
        "not-local",
      );
    }
    if (params.instructions.length === 0) {
      throw new LocalTransactionError("Transaction has no instructions", "rpc");
    }

    const latest = await params.connection.getLatestBlockhash("confirmed");
    const transaction = new Transaction({
      feePayer: params.wallet.publicKey,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    }).add(...params.instructions);
    if (params.extraSigners && params.extraSigners.length > 0) {
      transaction.partialSign(...params.extraSigners);
    }

    let signed: SolanaTransaction;
    try {
      signed = await params.wallet.signTransaction(transaction);
    } catch (error) {
      throw mapFailure(error, null);
    }

    let signature: TransactionSignature;
    try {
      signature = await params.connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });
    } catch (error) {
      throw mapFailure(error, null);
    }

    try {
      const confirmation = await params.connection.confirmTransaction({
        signature,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
      }, "confirmed");
      if (confirmation.value.err) {
        throw new LocalTransactionError(
          "Transaction failed on the local validator. Read chain state before retrying.",
          "confirmation",
          signature,
        );
      }
    } catch (error) {
      if (error instanceof LocalTransactionError) throw error;
      throw mapFailure(error, signature);
    }

    return { signature };
  }
}

export function describeLocalTransactionError(error: unknown): string {
  if (error instanceof LocalTransactionError) return error.message;
  if (error instanceof Error) return error.message;
  return "Transaction failed";
}

function mapFailure(
  error: unknown,
  signature: TransactionSignature | null,
): LocalTransactionError {
  if (error instanceof LocalTransactionError) return error;
  if (isWalletRejection(error)) {
    return new LocalTransactionError(
      "Wallet rejected the signature request",
      "wallet-rejected",
      signature,
    );
  }
  if (isExpired(error)) {
    return new LocalTransactionError(
      "The blockhash expired before confirmation. Read chain state before retrying.",
      "expired",
      signature,
    );
  }

  const logs = transactionLogs(error);
  if (logs) {
    const anchor = AnchorError.parse(logs);
    if (anchor) {
      return new LocalTransactionError(
        anchor.error.errorMessage,
        "program",
        signature,
        anchor.error.errorCode.code,
      );
    }
    const program = ProgramError.parse(error, IDL_ERRORS);
    if (program) {
      return new LocalTransactionError(
        program.msg,
        "program",
        signature,
        String(program.code),
      );
    }
  }

  const message = error instanceof Error ? error.message : "Local RPC request failed";
  return new LocalTransactionError(message, "rpc", signature);
}

function isWalletRejection(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: number; message?: string; name?: string };
  if (candidate.code === 4001) return true;
  const message = (candidate.message ?? "").toLowerCase();
  return message.includes("user rejected")
    || message.includes("rejected the request")
    || candidate.name === "WalletSignTransactionError";
}

function isExpired(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: string; message?: string };
  if (candidate.name === "TransactionExpiredBlockheightExceededError") return true;
  const message = (candidate.message ?? "").toLowerCase();
  return message.includes("block height exceeded")
    || message.includes("blockhash not found")
    || message.includes("transaction expired");
}

function transactionLogs(error: unknown): string[] | null {
  if (error instanceof SendTransactionError) {
    return error.logs ?? null;
  }
  if (error && typeof error === "object" && "logs" in error) {
    const logs = (error as { logs?: unknown }).logs;
    if (Array.isArray(logs) && logs.every((line) => typeof line === "string")) {
      return logs;
    }
  }
  return null;
}
