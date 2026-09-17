import { PublicKey } from "@solana/web3.js";
import { PRESTOCKS_API_URL, RECIPE_FETCH_TIMEOUT_MS } from "./constants.ts";
import { RecipeHttp, type RecipeFetch } from "./http.ts";
import type { RecipeAsset } from "./types.ts";

export class PreStocksCatalog {
  static parseAsset(raw: unknown): RecipeAsset | null {
    if (!raw || typeof raw !== "object") return null;
    const row = raw as Record<string, unknown>;
    if (typeof row.name !== "string" || typeof row.symbol !== "string") return null;
    if (typeof row.contract_address !== "string") return null;
    try {
      const mint = new PublicKey(row.contract_address);
      return {
        mint,
        symbol: row.symbol,
        name: row.name,
        issuer: "prestocks",
        tokenProgram: null,
        decimals: null,
      };
    } catch {
      return null;
    }
  }

  static selectAssets(raw: unknown): RecipeAsset[] {
    if (!Array.isArray(raw)) {
      throw new Error("PreStocks catalog must be an array");
    }
    const listed: RecipeAsset[] = [];
    const seen = new Set<string>();
    for (const entry of raw) {
      const parsed = PreStocksCatalog.parseAsset(entry);
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
    const url = options.apiUrl ?? PRESTOCKS_API_URL;
    const timeoutMs = options.timeoutMs ?? RECIPE_FETCH_TIMEOUT_MS;
    const response = await RecipeHttp.readJson(fetchImpl, url, { timeoutMs });
    if (response.status !== 200) {
      throw new Error(`PreStocks catalog failed with HTTP ${response.status}`);
    }
    return PreStocksCatalog.selectAssets(response.body);
  }
}
