import { PublicKey } from "@solana/web3.js";
import {
  RECIPE_FETCH_TIMEOUT_MS,
  TESSERA_API_URL,
  TESSERA_DOCUMENTED_DECIMALS,
  TESSERA_TOKEN_2022_PROGRAM_ID,
} from "./constants.ts";
import { RecipeHttp, type RecipeFetch } from "./http.ts";
import type { RecipeAsset } from "./types.ts";

export class TesseraCatalog {
  static parseAsset(raw: unknown): RecipeAsset | null {
    if (!raw || typeof raw !== "object") return null;
    const row = raw as Record<string, unknown>;
    const symbol = typeof row.code === "string"
      ? row.code
      : typeof row.symbol === "string"
        ? row.symbol
        : null;
    if (!symbol || typeof row.name !== "string" || typeof row.mint !== "string") {
      return null;
    }
    try {
      return {
        mint: new PublicKey(row.mint),
        symbol,
        name: row.name,
        issuer: "tessera",
        tokenProgram: new PublicKey(TESSERA_TOKEN_2022_PROGRAM_ID),
        decimals: TESSERA_DOCUMENTED_DECIMALS,
      };
    } catch {
      return null;
    }
  }

  static selectAssets(raw: unknown): RecipeAsset[] {
    if (!Array.isArray(raw)) {
      throw new Error("Tessera catalog must be an array");
    }
    const listed: RecipeAsset[] = [];
    const seen = new Set<string>();
    for (const entry of raw) {
      const parsed = TesseraCatalog.parseAsset(entry);
      if (!parsed) continue;
      const id = parsed.mint.toBase58();
      if (seen.has(id)) continue;
      seen.add(id);
      listed.push(parsed);
    }
    listed.sort((left, right) => left.symbol.localeCompare(right.symbol));
    return listed;
  }

  static async load(options: {
    fetchImpl?: RecipeFetch;
    apiUrl?: string;
    timeoutMs?: number;
  } = {}): Promise<RecipeAsset[]> {
    const fetchImpl = options.fetchImpl ?? fetch;
    const url = options.apiUrl ?? TESSERA_API_URL;
    const timeoutMs = options.timeoutMs ?? RECIPE_FETCH_TIMEOUT_MS;
    const response = await RecipeHttp.readJson(fetchImpl, url, { timeoutMs });
    if (response.status !== 200) {
      throw new Error(`Tessera catalog failed with HTTP ${response.status}`);
    }
    return TesseraCatalog.selectAssets(response.body);
  }
}
