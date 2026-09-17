import { BackpackInventory, type BackpackStockMarket } from "./backpack.ts";
import type { JupiterFetch } from "./http.ts";
import {
  JupiterInventory,
  type JupiterFundingMint,
  type JupiterListedAsset,
} from "./inventory.ts";

export type InventorySource = "jupiter" | "backpack-backup" | "blocked";

export interface JupiterInventorySnapshot {
  source: InventorySource;
  catalogLabel: "live" | "blocked";
  usedSearchFallback: boolean;
  assets: JupiterListedAsset[];
  funding: JupiterFundingMint | null;
  backpack: BackpackStockMarket[];
  detail: string;
}

export class JupiterCatalog {
  static async load(options: {
    fetchImpl?: JupiterFetch;
    apiBase?: string;
    apiKey?: string;
    source?: "auto" | "jupiter" | "backpack";
  } = {}): Promise<JupiterInventorySnapshot> {
    const source = options.source ?? "auto";
    if (source === "backpack") {
      return JupiterCatalog.fromBackpack(options.fetchImpl, "requested backpack-only source");
    }
    try {
      const loaded = await JupiterInventory.load(options);
      if (loaded.assets.length === 0) {
        if (source === "auto") {
          return JupiterCatalog.fromBackpack(
            options.fetchImpl,
            "Jupiter returned no xStocks or indexes tagged stocks/xstocks",
          );
        }
        return {
          source: "jupiter",
          catalogLabel: "live",
          usedSearchFallback: loaded.usedSearchFallback,
          assets: [],
          funding: loaded.funding,
          backpack: [],
          detail: "Jupiter returned no xStocks or indexes tagged stocks/xstocks",
        };
      }
      return {
        source: "jupiter",
        catalogLabel: "live",
        usedSearchFallback: loaded.usedSearchFallback,
        assets: loaded.assets,
        funding: loaded.funding,
        backpack: [],
        detail: loaded.usedSearchFallback
          ? "Jupiter /tokens/v2/tag?query=stocks was unavailable; inventory is from /tokens/v2/search filtered by stocks/xstocks tags."
          : "Jupiter /tokens/v2/tag?query=stocks",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Jupiter inventory failed";
      if (source === "jupiter") {
        return {
          source: "blocked",
          catalogLabel: "blocked",
          usedSearchFallback: false,
          assets: [],
          funding: null,
          backpack: [],
          detail: message,
        };
      }
      return JupiterCatalog.fromBackpack(options.fetchImpl, message);
    }
  }

  private static async fromBackpack(
    fetchImpl: JupiterFetch | undefined,
    reason: string,
  ): Promise<JupiterInventorySnapshot> {
    try {
      const backpack = await BackpackInventory.load(fetchImpl ? { fetchImpl } : {});
      return {
        source: "backpack-backup",
        catalogLabel: "blocked",
        usedSearchFallback: false,
        assets: [],
        funding: null,
        backpack,
        detail: `Jupiter path blocked (${reason}). Backpack markets are venue symbols only; they are not Solana mints and cannot be routed as Jupiter CPI legs.`,
      };
    } catch (backupError) {
      const backup = backupError instanceof Error ? backupError.message : "Backpack backup failed";
      return {
        source: "blocked",
        catalogLabel: "blocked",
        usedSearchFallback: false,
        assets: [],
        funding: null,
        backpack: [],
        detail: `Jupiter path blocked (${reason}). Backpack backup also failed: ${backup}`,
      };
    }
  }
}
