import { BACKPACK_MARKETS_URL } from "./constants.ts";
import { JupiterHttp, type JupiterFetch } from "./http.ts";

export interface BackpackStockMarket {
  symbol: string;
  baseSymbol: string;
  quoteSymbol: string;
  marketType: string;
  rwaMarketType: "STOCK";
  visible: boolean | null;
  orderBookState: string | null;
  source: "backpack";
}

export class BackpackInventory {
  static parseMarket(raw: unknown): BackpackStockMarket | null {
    if (!raw || typeof raw !== "object") return null;
    const row = raw as Record<string, unknown>;
    if (
      row.rwaMarketType !== "STOCK"
      || typeof row.symbol !== "string"
      || typeof row.baseSymbol !== "string"
      || typeof row.quoteSymbol !== "string"
      || typeof row.marketType !== "string"
    ) {
      return null;
    }
    return {
      symbol: row.symbol,
      baseSymbol: row.baseSymbol,
      quoteSymbol: row.quoteSymbol,
      marketType: row.marketType,
      rwaMarketType: "STOCK",
      visible: typeof row.visible === "boolean" ? row.visible : null,
      orderBookState: typeof row.orderBookState === "string" ? row.orderBookState : null,
      source: "backpack",
    };
  }

  static selectStockMarkets(raw: unknown): BackpackStockMarket[] {
    if (!Array.isArray(raw)) {
      throw new Error("Backpack markets response must be an array");
    }
    return raw
      .map((entry) => BackpackInventory.parseMarket(entry))
      .filter((entry): entry is BackpackStockMarket => entry !== null);
  }

  static async load(options: {
    fetchImpl?: JupiterFetch;
  } = {}): Promise<BackpackStockMarket[]> {
    const fetchImpl = options.fetchImpl ?? fetch;
    const response = await JupiterHttp.readJson(fetchImpl, BACKPACK_MARKETS_URL);
    if (response.status !== 200) {
      throw new Error(`Backpack markets failed with HTTP ${response.status}`);
    }
    return BackpackInventory.selectStockMarkets(response.body);
  }
}
