import assert from "node:assert/strict";
import { test } from "node:test";
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { LOCAL_RPC_URL } from "../lib/solana/basket-client.ts";
import {
  LocalTransactionError,
  LocalTransactionRunner,
  type LocalTransactionConnection,
  type LocalWalletSigner,
} from "../lib/solana/local-transaction.ts";

const OWNER = Keypair.generate();

function fakeBlockhash(): string {
  return Keypair.generate().publicKey.toBase58();
}

function signer(keypair: Keypair): LocalWalletSigner {
  return {
    publicKey: keypair.publicKey,
    async signTransaction(transaction: Transaction) {
      transaction.partialSign(keypair);
      return transaction;
    },
  };
}

function connection(
  overrides: Partial<LocalTransactionConnection> = {},
): LocalTransactionConnection {
  return {
    rpcEndpoint: LOCAL_RPC_URL,
    getLatestBlockhash: async () => ({
      blockhash: fakeBlockhash(),
      lastValidBlockHeight: 100,
    }),
    sendRawTransaction: async () => "5".repeat(64),
    confirmTransaction: async () => ({ value: { err: null } }),
    ...overrides,
  };
}

test("local RPC detection stays on the validator loopback port", () => {
  assert.equal(LocalTransactionRunner.isLocalRpcUrl(LOCAL_RPC_URL), true);
  assert.equal(LocalTransactionRunner.isLocalRpcUrl("http://localhost:8899"), true);
  assert.equal(LocalTransactionRunner.isLocalRpcUrl("http://127.0.0.1:8899/"), true);
  assert.equal(LocalTransactionRunner.isLocalRpcUrl("https://api.mainnet-beta.solana.com"), false);
  assert.equal(LocalTransactionRunner.isLocalRpcUrl("http://127.0.0.1:8900"), false);
});

test("runner refuses non-local endpoints before asking the wallet to sign", async () => {
  let signed = false;
  await assert.rejects(
    () => LocalTransactionRunner.submit({
      connection: connection({
        rpcEndpoint: "https://api.mainnet-beta.solana.com",
      }),
      wallet: {
        publicKey: OWNER.publicKey,
        async signTransaction(transaction) {
          signed = true;
          return transaction;
        },
      },
      instructions: [
        SystemProgram.transfer({
          fromPubkey: OWNER.publicKey,
          toPubkey: OWNER.publicKey,
          lamports: 1,
        }),
      ],
    }),
    (error: unknown) => {
      assert.ok(error instanceof LocalTransactionError);
      assert.equal(error.kind, "not-local");
      assert.equal(signed, false);
      return true;
    },
  );
});

test("runner signs, sends, and confirms a local transaction", async () => {
  const captured: Uint8Array[] = [];
  const result = await LocalTransactionRunner.submit({
    connection: connection({
      sendRawTransaction: async (raw) => {
        captured.push(Uint8Array.from(raw as Uint8Array));
        return "confirmed-sig";
      },
    }),
    wallet: signer(OWNER),
    instructions: [
      SystemProgram.transfer({
        fromPubkey: OWNER.publicKey,
        toPubkey: new PublicKey(new Uint8Array(32).fill(9)),
        lamports: 1,
      }),
    ],
  });
  assert.equal(result.signature, "confirmed-sig");
  assert.equal(captured.length, 1);
  assert.ok((captured[0]?.byteLength ?? 0) > 0);
});

test("wallet rejection, expiry, and program logs become typed failures", async () => {
  await assert.rejects(
    () => LocalTransactionRunner.submit({
      connection: connection(),
      wallet: {
        publicKey: OWNER.publicKey,
        async signTransaction() {
          const error = new Error("User rejected the request");
          (error as { code?: number }).code = 4001;
          throw error;
        },
      },
      instructions: [
        SystemProgram.transfer({
          fromPubkey: OWNER.publicKey,
          toPubkey: OWNER.publicKey,
          lamports: 1,
        }),
      ],
    }),
    (error: unknown) => {
      assert.ok(error instanceof LocalTransactionError);
      assert.equal(error.kind, "wallet-rejected");
      return true;
    },
  );

  await assert.rejects(
    () => LocalTransactionRunner.submit({
      connection: connection({
        confirmTransaction: async () => {
          const error = new Error("block height exceeded");
          error.name = "TransactionExpiredBlockheightExceededError";
          throw error;
        },
      }),
      wallet: signer(OWNER),
      instructions: [
        SystemProgram.transfer({
          fromPubkey: OWNER.publicKey,
          toPubkey: OWNER.publicKey,
          lamports: 1,
        }),
      ],
    }),
    (error: unknown) => {
      assert.ok(error instanceof LocalTransactionError);
      assert.equal(error.kind, "expired");
      assert.equal(error.signature, "5".repeat(64));
      return true;
    },
  );

  await assert.rejects(
    () => LocalTransactionRunner.submit({
      connection: connection({
        sendRawTransaction: async () => {
          throw {
            logs: [
              "Program log: AnchorError occurred. Error Code: ZeroAmount. Error Number: 6007. Error Message: Amount must be greater than zero.",
            ],
          };
        },
      }),
      wallet: signer(OWNER),
      instructions: [
        SystemProgram.transfer({
          fromPubkey: OWNER.publicKey,
          toPubkey: OWNER.publicKey,
          lamports: 1,
        }),
      ],
    }),
    (error: unknown) => {
      assert.ok(error instanceof LocalTransactionError);
      assert.equal(error.kind, "program");
      assert.equal(error.programCode, "ZeroAmount");
      assert.match(error.message, /greater than zero/i);
      return true;
    },
  );
});
