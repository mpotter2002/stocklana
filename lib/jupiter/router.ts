import { PublicKey } from "@solana/web3.js";
import {
  JUPITER_API_BASE,
  JUPITER_DEFAULT_SLIPPAGE_BPS,
  JUPITER_MAX_ROUTE_ACCOUNTS,
  JUPITER_SWAP_BUILD_PATH,
  JUPITER_V6_PROGRAM_ID,
} from "./constants.ts";
import { JupiterHttp, type JupiterFetch } from "./http.ts";
import { JupiterU64 } from "./u64.ts";

export interface JupiterAccountMeta {
  pubkey: PublicKey;
  isSigner: boolean;
  isWritable: boolean;
}

export interface JupiterApiInstruction {
  programId: PublicKey;
  accounts: JupiterAccountMeta[];
  data: Buffer;
}

export interface JupiterRouteHop {
  percent: number;
  bps: number;
  ammKey: string;
  label: string;
  inputMint: PublicKey;
  outputMint: PublicKey;
  inAmount: bigint;
  outAmount: bigint;
}

export interface JupiterBuild {
  inputMint: PublicKey;
  outputMint: PublicKey;
  inAmount: bigint;
  outAmount: bigint;
  otherAmountThreshold: bigint;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string | null;
  routePlan: JupiterRouteHop[];
  swapInstruction: JupiterApiInstruction;
  setupInstructions: JupiterApiInstruction[];
}

export interface JupiterBuildRequest {
  inputMint: PublicKey;
  outputMint: PublicKey;
  amount: bigint;
  taker: PublicKey;
  slippageBps?: number;
  maxAccounts?: number;
  destinationTokenAccount?: PublicKey;
  wrapAndUnwrapSol?: boolean;
}

export class JupiterRouter {
  static parseAccount(raw: unknown): JupiterAccountMeta {
    if (!raw || typeof raw !== "object") {
      throw new Error("Jupiter instruction account is missing");
    }
    const row = raw as Record<string, unknown>;
    if (
      typeof row.pubkey !== "string"
      || typeof row.isSigner !== "boolean"
      || typeof row.isWritable !== "boolean"
    ) {
      throw new Error("Jupiter instruction account is malformed");
    }
    return {
      pubkey: new PublicKey(row.pubkey),
      isSigner: row.isSigner,
      isWritable: row.isWritable,
    };
  }

  static parseInstruction(raw: unknown, label: string): JupiterApiInstruction {
    if (!raw || typeof raw !== "object") {
      throw new Error(`${label} is missing`);
    }
    const row = raw as Record<string, unknown>;
    if (typeof row.programId !== "string" || typeof row.data !== "string" || !Array.isArray(row.accounts)) {
      throw new Error(`${label} is malformed`);
    }
    const data = Buffer.from(row.data, "base64");
    if (data.length === 0 && row.data.length > 0) {
      throw new Error(`${label} data is not valid base64`);
    }
    return {
      programId: new PublicKey(row.programId),
      accounts: row.accounts.map((account) => JupiterRouter.parseAccount(account)),
      data,
    };
  }

  static parseRouteHop(raw: unknown): JupiterRouteHop {
    if (!raw || typeof raw !== "object") {
      throw new Error("Jupiter route hop is missing");
    }
    const row = raw as Record<string, unknown>;
    const swap = row.swapInfo;
    if (!swap || typeof swap !== "object") {
      throw new Error("Jupiter route hop is missing swapInfo");
    }
    const info = swap as Record<string, unknown>;
    if (
      typeof row.percent !== "number"
      || typeof row.bps !== "number"
      || typeof info.ammKey !== "string"
      || typeof info.label !== "string"
      || typeof info.inputMint !== "string"
      || typeof info.outputMint !== "string"
      || typeof info.inAmount !== "string"
      || typeof info.outAmount !== "string"
    ) {
      throw new Error("Jupiter route hop is malformed");
    }
    return {
      percent: row.percent,
      bps: row.bps,
      ammKey: info.ammKey,
      label: info.label,
      inputMint: new PublicKey(info.inputMint),
      outputMint: new PublicKey(info.outputMint),
      inAmount: JupiterU64.parse(info.inAmount, "route inAmount"),
      outAmount: JupiterU64.parse(info.outAmount, "route outAmount"),
    };
  }

  static parseBuild(raw: unknown): JupiterBuild {
    if (!raw || typeof raw !== "object") {
      throw new Error("Jupiter /build response is missing");
    }
    const row = raw as Record<string, unknown>;
    if (
      typeof row.inputMint !== "string"
      || typeof row.outputMint !== "string"
      || typeof row.inAmount !== "string"
      || typeof row.outAmount !== "string"
      || typeof row.otherAmountThreshold !== "string"
      || typeof row.swapMode !== "string"
      || typeof row.slippageBps !== "number"
      || !Number.isInteger(row.slippageBps)
      || !Array.isArray(row.routePlan)
    ) {
      throw new Error("Jupiter /build response is missing documented quote fields");
    }
    const setup = Array.isArray(row.setupInstructions)
      ? row.setupInstructions.map((instruction, index) =>
        JupiterRouter.parseInstruction(instruction, `setupInstructions[${index}]`)
      )
      : [];
    const priceImpactPct = row.priceImpactPct === undefined || row.priceImpactPct === null
      ? null
      : String(row.priceImpactPct);
    return {
      inputMint: new PublicKey(row.inputMint),
      outputMint: new PublicKey(row.outputMint),
      inAmount: JupiterU64.parse(row.inAmount, "inAmount"),
      outAmount: JupiterU64.parse(row.outAmount, "outAmount"),
      otherAmountThreshold: JupiterU64.parse(
        row.otherAmountThreshold,
        "otherAmountThreshold",
      ),
      swapMode: row.swapMode,
      slippageBps: row.slippageBps,
      priceImpactPct,
      routePlan: row.routePlan.map((hop) => JupiterRouter.parseRouteHop(hop)),
      swapInstruction: JupiterRouter.parseInstruction(row.swapInstruction, "swapInstruction"),
      setupInstructions: setup,
    };
  }

  static buildUrl(request: JupiterBuildRequest, apiBase = JUPITER_API_BASE): string {
    if (request.amount <= 0n) {
      throw new RangeError("Jupiter build amount must be greater than zero");
    }
    JupiterU64.parse(request.amount.toString(), "amount");
    const slippage = request.slippageBps ?? JUPITER_DEFAULT_SLIPPAGE_BPS;
    const maxAccounts = request.maxAccounts ?? JUPITER_MAX_ROUTE_ACCOUNTS;
    if (!Number.isInteger(slippage) || slippage < 0 || slippage > 10_000) {
      throw new RangeError("slippageBps must be an integer between 0 and 10000");
    }
    if (!Number.isInteger(maxAccounts) || maxAccounts < 1 || maxAccounts > 64) {
      throw new RangeError("maxAccounts must be an integer between 1 and 64");
    }
    const params = new URLSearchParams({
      inputMint: request.inputMint.toBase58(),
      outputMint: request.outputMint.toBase58(),
      amount: request.amount.toString(),
      taker: request.taker.toBase58(),
      slippageBps: String(slippage),
      maxAccounts: String(maxAccounts),
      wrapAndUnwrapSol: String(request.wrapAndUnwrapSol ?? false),
    });
    if (request.destinationTokenAccount) {
      params.set("destinationTokenAccount", request.destinationTokenAccount.toBase58());
    }
    return JupiterHttp.join(apiBase, JUPITER_SWAP_BUILD_PATH, params);
  }

  static async build(
    request: JupiterBuildRequest,
    options: {
      fetchImpl?: JupiterFetch;
      apiBase?: string;
      apiKey?: string;
    } = {},
  ): Promise<JupiterBuild> {
    const fetchImpl = options.fetchImpl ?? fetch;
    const url = JupiterRouter.buildUrl(request, options.apiBase ?? JUPITER_API_BASE);
    const response = await JupiterHttp.readJson(fetchImpl, url, options.apiKey);
    if (response.status !== 200) {
      const detail = typeof response.body === "object" && response.body
        ? JSON.stringify(response.body)
        : String(response.body ?? "");
      throw new Error(`Jupiter /build failed with HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
    }
    const parsed = JupiterRouter.parseBuild(response.body);
    if (!parsed.swapInstruction.programId.equals(JUPITER_V6_PROGRAM_ID)) {
      throw new Error("Jupiter /build returned an undocumented swap program");
    }
    return parsed;
  }
}
