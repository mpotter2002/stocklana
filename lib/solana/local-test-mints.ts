import {
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMintInstruction,
  createMintToInstruction,
  MINT_SIZE,
} from "@solana/spl-token";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  type Connection,
  type TransactionInstruction,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TokenAccounts } from "./token-accounts.ts";

export const LOCAL_TEST_DECIMALS = 6;
export const LOCAL_TEST_FUNDING_AMOUNT = 1_000_000n * 1_000_000n;
export const LOCAL_TEST_MINTS_STORAGE_KEY = "stocklana.local-test-mints.v1";

export interface LocalTestMint {
  symbol: string;
  name: string;
  color: string;
  mint: PublicKey;
  tokenProgram: PublicKey;
  decimals: number;
}

export interface LocalTestMintSet {
  owner: PublicKey;
  funding: LocalTestMint;
  assets: LocalTestMint[];
}

export interface IssuedTestMints {
  mintSet: LocalTestMintSet;
  instructions: TransactionInstruction[];
  extraSigners: Keypair[];
}

interface StoredTestMint {
  symbol: string;
  name: string;
  color: string;
  mint: string;
  tokenProgram: string;
  decimals: number;
}

interface StoredTestMintSet {
  owner: string;
  funding: StoredTestMint;
  assets: StoredTestMint[];
}

const FUNDING_TEMPLATE = {
  symbol: "USDCt",
  name: "Local test USD",
  color: "#2f6f58",
} as const;

const ASSET_TEMPLATES = [
  { symbol: "ALPHAt", name: "Alpha test equity", color: "#2f6f58" },
  { symbol: "BEACONt", name: "Beacon test equity", color: "#3d68a0" },
  { symbol: "CEDARt", name: "Cedar test equity", color: "#b45b46" },
] as const;

export class LocalSolAirdrop {
  static readonly MIN_LAMPORTS = 1_000_000_000n;

  static async ensure(
    connection: Connection,
    owner: PublicKey,
  ): Promise<"already-funded" | "airdropped"> {
    const balance = BigInt(await connection.getBalance(owner, "confirmed"));
    if (balance >= LocalSolAirdrop.MIN_LAMPORTS) return "already-funded";
    const signature = await connection.requestAirdrop(owner, 2_000_000_000);
    const latest = await connection.getLatestBlockhash("confirmed");
    await connection.confirmTransaction({
      signature,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    }, "confirmed");
    return "airdropped";
  }
}

export class LocalTestMints {
  static load(owner: PublicKey): LocalTestMintSet | null {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(LOCAL_TEST_MINTS_STORAGE_KEY);
    if (!raw) return null;
    try {
      const stored = JSON.parse(raw) as StoredTestMintSet;
      if (stored.owner !== owner.toBase58() || !Array.isArray(stored.assets)) {
        return null;
      }
      if (hasSecretMaterial(stored)) return null;
      return {
        owner,
        funding: deserializeMint(stored.funding),
        assets: stored.assets.map(deserializeMint),
      };
    } catch {
      return null;
    }
  }

  static save(mintSet: LocalTestMintSet): void {
    if (typeof window === "undefined") return;
    const stored: StoredTestMintSet = {
      owner: mintSet.owner.toBase58(),
      funding: serializeMint(mintSet.funding),
      assets: mintSet.assets.map(serializeMint),
    };
    window.localStorage.setItem(LOCAL_TEST_MINTS_STORAGE_KEY, JSON.stringify(stored));
  }

  static clear(): void {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(LOCAL_TEST_MINTS_STORAGE_KEY);
  }

  static async mintRentLamports(connection: Connection): Promise<bigint> {
    return BigInt(await connection.getMinimumBalanceForRentExemption(MINT_SIZE));
  }

  static async stillOnChain(
    connection: Connection,
    mintSet: LocalTestMintSet,
  ): Promise<boolean> {
    for (const mint of [mintSet.funding, ...mintSet.assets]) {
      const account = await connection.getAccountInfo(mint.mint, "confirmed");
      if (!account || !account.owner.equals(mint.tokenProgram)) return false;
    }
    return true;
  }

  static issue(params: {
    owner: PublicKey;
    rentLamports: bigint;
    mintKeys?: Keypair[];
  }): IssuedTestMints {
    if (params.rentLamports <= 0n || params.rentLamports > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new RangeError("Mint rent must fit a safe lamport value");
    }
    const mintKeys = params.mintKeys ?? [
      Keypair.generate(),
      Keypair.generate(),
      Keypair.generate(),
      Keypair.generate(),
    ];
    if (mintKeys.length !== 4) {
      throw new Error("Local test issuance expects a funding mint and three asset mints");
    }
    const lamports = Number(params.rentLamports);
    const instructions: TransactionInstruction[] = [];
    const created = mintKeys.map((keypair) => {
      instructions.push(
        SystemProgram.createAccount({
          fromPubkey: params.owner,
          newAccountPubkey: keypair.publicKey,
          space: MINT_SIZE,
          lamports,
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMintInstruction(
          keypair.publicKey,
          LOCAL_TEST_DECIMALS,
          params.owner,
          null,
          TOKEN_PROGRAM_ID,
        ),
      );
      return keypair.publicKey;
    });
    const fundingMint = created[0]!;
    const fundingAta = TokenAccounts.ownerAddress(
      fundingMint,
      params.owner,
      TOKEN_PROGRAM_ID,
    );
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(
        params.owner,
        fundingAta,
        params.owner,
        fundingMint,
        TOKEN_PROGRAM_ID,
      ),
      createMintToInstruction(
        fundingMint,
        fundingAta,
        params.owner,
        LOCAL_TEST_FUNDING_AMOUNT,
        [],
        TOKEN_PROGRAM_ID,
      ),
    );

    const mintSet: LocalTestMintSet = {
      owner: params.owner,
      funding: {
        ...FUNDING_TEMPLATE,
        mint: fundingMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        decimals: LOCAL_TEST_DECIMALS,
      },
      assets: ASSET_TEMPLATES.map((template, index) => ({
        ...template,
        mint: created[index + 1]!,
        tokenProgram: TOKEN_PROGRAM_ID,
        decimals: LOCAL_TEST_DECIMALS,
      })),
    };

    return {
      mintSet,
      instructions,
      extraSigners: mintKeys,
    };
  }
}

function serializeMint(mint: LocalTestMint): StoredTestMint {
  return {
    symbol: mint.symbol,
    name: mint.name,
    color: mint.color,
    mint: mint.mint.toBase58(),
    tokenProgram: mint.tokenProgram.toBase58(),
    decimals: mint.decimals,
  };
}

function deserializeMint(stored: StoredTestMint): LocalTestMint {
  if (!Number.isInteger(stored.decimals) || stored.decimals < 0 || stored.decimals > 18) {
    throw new Error("Stored test mint decimals are invalid");
  }
  return {
    symbol: stored.symbol,
    name: stored.name,
    color: stored.color,
    mint: new PublicKey(stored.mint),
    tokenProgram: new PublicKey(stored.tokenProgram),
    decimals: stored.decimals,
  };
}

function hasSecretMaterial(value: unknown): boolean {
  const json = JSON.stringify(value);
  return json.includes("secretKey") || json.includes("secret_key");
}
