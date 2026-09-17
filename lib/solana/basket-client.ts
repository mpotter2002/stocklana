import { JUPITER_V6_PROGRAM_ID } from "../jupiter/constants.ts";
import type { Idl } from "@coral-xyz/anchor";
import { BorshAccountsCoder } from "@coral-xyz/anchor/dist/browser/index.js";
import {
  Connection,
  PublicKey,
  type AccountInfo,
  type Commitment,
} from "@solana/web3.js";
import basketIdl from "./idl/basket.json" with { type: "json" };

export const LOCAL_RPC_URL = "http://127.0.0.1:8899";
export const BASKET_PROGRAM_ID = new PublicKey(
  "HmDhCxRvv5c9HdmwJnHvrPJmSGVoG6m1RwrgDKxTmCmk",
);
export const MAX_U64 = (1n << 64n) - 1n;

const accountCoder = new BorshAccountsCoder(basketIdl as Idl);

type AnchorInteger = { toString(): string };
type AnchorPhase = Record<string, Record<string, never>>;

interface DecodedLeg {
  input_mint: PublicKey;
  input_token_program: PublicKey;
  output_mint: PublicKey;
  output_token_program: PublicKey;
  max_input: AnchorInteger;
  min_output: AnchorInteger;
}

export interface DecodedBasketState {
  owner: PublicKey;
  basket_id: AnchorInteger;
  bump: number;
  asset_count: number;
  funding_mint: PublicKey;
  funding_token_program: PublicKey;
  mints: PublicKey[];
  token_programs: PublicKey[];
  target_bps: number[];
  operation_nonce: AnchorInteger;
  phase: AnchorPhase;
  leg_count: number;
  expires_at_slot: AnchorInteger;
  legs: DecodedLeg[];
  completed_legs: boolean[];
}

export type BasketPhase =
  | "idle"
  | "buying"
  | "selling"
  | "rebalancing"
  | "exiting";

export interface BasketLegSnapshot {
  inputMint: PublicKey;
  inputTokenProgram: PublicKey;
  outputMint: PublicKey;
  outputTokenProgram: PublicKey;
  maxInput: bigint;
  minOutput: bigint;
  complete: boolean;
}

export interface BasketSnapshot {
  address: PublicKey;
  owner: PublicKey;
  basketId: bigint;
  bump: number;
  fundingMint: PublicKey;
  fundingTokenProgram: PublicKey;
  mints: PublicKey[];
  tokenPrograms: PublicKey[];
  targetBps: number[];
  operationNonce: bigint;
  phase: BasketPhase;
  expiresAtSlot: bigint;
  legs: BasketLegSnapshot[];
}

export interface LocalRuntimeStatus {
  validator: "online" | "offline";
  programDeployed: boolean | null;
  jupiterSwapDeployed: boolean | null;
  slot: number | null;
  version: string | null;
}

interface RuntimeConnection {
  getAccountInfo(
    publicKey: PublicKey,
    commitment?: Commitment,
  ): Promise<AccountInfo<Buffer> | null>;
  getSlot(commitment?: Commitment): Promise<number>;
  getVersion(): Promise<{ "solana-core": string }>;
}

export function createLocalConnection(): Connection {
  return new Connection(LOCAL_RPC_URL, "confirmed");
}

export function encodeU64LE(value: bigint): Uint8Array {
  if (value < 0n || value > MAX_U64) {
    throw new RangeError("Basket ID must fit an unsigned 64-bit integer");
  }

  const bytes = new Uint8Array(8);
  let remaining = value;
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return bytes;
}

export function deriveBasketAddress(
  owner: PublicKey,
  basketId: bigint,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      new TextEncoder().encode("basket"),
      owner.toBytes(),
      encodeU64LE(basketId),
    ],
    BASKET_PROGRAM_ID,
  )[0];
}

export function decodeBasketSnapshot(
  address: PublicKey,
  data: Buffer | Uint8Array,
): BasketSnapshot {
  const decoded = accountCoder.decode(
    "BasketState",
    Buffer.from(data),
  ) as DecodedBasketState;
  return normalizeBasketSnapshot(address, decoded);
}

export function normalizeBasketSnapshot(
  address: PublicKey,
  decoded: DecodedBasketState,
): BasketSnapshot {
  const assetCount = decoded.asset_count;
  const legCount = decoded.leg_count;

  if (!Number.isInteger(assetCount) || assetCount < 2 || assetCount > 3) {
    throw new Error("Decoded basket has an invalid asset count");
  }
  if (!Number.isInteger(legCount) || legCount < 0 || legCount > 6) {
    throw new Error("Decoded basket has an invalid leg count");
  }
  if (decoded.mints.length < assetCount
    || decoded.token_programs.length < assetCount
    || decoded.target_bps.length < assetCount
    || decoded.legs.length < legCount
    || decoded.completed_legs.length < legCount
    || decoded.completed_legs.slice(0, legCount).some((done) => typeof done !== "boolean")) {
    throw new Error("Decoded basket has truncated or invalid state arrays");
  }
  const phase = decodePhase(decoded.phase);
  const active = phase === "buying" || phase === "selling" || phase === "rebalancing";
  if (active !== (legCount > 0)) {
    throw new Error("Decoded basket phase does not match its operation");
  }
  const basketId = decodeU64(decoded.basket_id);
  if (!deriveBasketAddress(decoded.owner, basketId).equals(address)) {
    throw new Error("Decoded basket identity does not match its address");
  }

  return {
    address,
    owner: decoded.owner,
    basketId,
    bump: decoded.bump,
    fundingMint: decoded.funding_mint,
    fundingTokenProgram: decoded.funding_token_program,
    mints: decoded.mints.slice(0, assetCount),
    tokenPrograms: decoded.token_programs.slice(0, assetCount),
    targetBps: decoded.target_bps.slice(0, assetCount),
    operationNonce: decodeU64(decoded.operation_nonce),
    phase,
    expiresAtSlot: decodeU64(decoded.expires_at_slot),
    legs: decoded.legs.slice(0, legCount).map((leg, index) => ({
      inputMint: leg.input_mint,
      inputTokenProgram: leg.input_token_program,
      outputMint: leg.output_mint,
      outputTokenProgram: leg.output_token_program,
      maxInput: decodeU64(leg.max_input),
      minOutput: decodeU64(leg.min_output),
      complete: decoded.completed_legs[index]!,
    })),
  };
}

export async function fetchBasketSnapshot(
  connection: Connection,
  owner: PublicKey,
  basketId: bigint,
): Promise<BasketSnapshot | null> {
  const address = deriveBasketAddress(owner, basketId);
  const account = await connection.getAccountInfo(address, "confirmed");
  if (!account) return null;
  if (!account.owner.equals(BASKET_PROGRAM_ID)) {
    throw new Error("Basket account is owned by an unexpected program");
  }
  return decodeBasketSnapshot(address, account.data);
}

export async function inspectLocalRuntime(
  connection: RuntimeConnection = createLocalConnection(),
  timeoutMs = 2_500,
): Promise<LocalRuntimeStatus> {
  try {
    const version = await withTimeout(connection.getVersion(), timeoutMs);
    const [slot, program, jupiter] = await withTimeout(
      Promise.all([
        connection.getSlot("confirmed"),
        connection.getAccountInfo(BASKET_PROGRAM_ID, "confirmed"),
        connection.getAccountInfo(JUPITER_V6_PROGRAM_ID, "confirmed"),
      ]),
      timeoutMs,
    );
    return {
      validator: "online",
      programDeployed: program?.executable === true,
      jupiterSwapDeployed: jupiter?.executable === true,
      slot,
      version: version["solana-core"],
    };
  } catch {
    return {
      validator: "offline",
      programDeployed: null,
      jupiterSwapDeployed: null,
      slot: null,
      version: null,
    };
  }
}

function decodePhase(phase: AnchorPhase): BasketPhase {
  if (Object.keys(phase).length !== 1) {
    throw new Error("Decoded basket has an ambiguous phase");
  }
  const name = Object.keys(phase)[0]?.toLowerCase();
  if (
    name === "idle" ||
    name === "buying" ||
    name === "selling" ||
    name === "rebalancing" ||
    name === "exiting"
  ) {
    return name;
  }
  throw new Error("Decoded basket has an unknown phase");
}

function decodeU64(value: AnchorInteger): bigint {
  const raw = BigInt(value.toString());
  if (raw < 0n || raw > MAX_U64) {
    throw new Error("Decoded basket integer is outside the u64 range");
  }
  return raw;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error("Local RPC timed out")), timeoutMs);
  });
  try {
    return await Promise.race([promise, expired]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
