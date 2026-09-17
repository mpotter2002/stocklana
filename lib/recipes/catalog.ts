import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PRESTOCKS_API_URL } from "./constants.ts";
import { RecipeComposer } from "./compose.ts";
import type { RecipeFetch } from "./http.ts";
import { PreStocksCatalog } from "./prestocks.ts";
import type { IssuerCatalog, RecipeCatalogLabel, RecipeSnapshot } from "./types.ts";

export type RecipeSourceMode = "auto" | "live" | "fixture";

export class RecipeCatalog {
  static modeFromEnv(raw = process.env.STOCKLANA_RECIPE_SOURCE): RecipeSourceMode {
    if (raw === "live" || raw === "fixture" || raw === "auto") return raw;
    return "auto";
  }

  static async load(options: {
    fetchImpl?: RecipeFetch;
    source?: RecipeSourceMode;
    prestocksUrl?: string;
    prestocksFixture?: unknown;
  } = {}): Promise<RecipeSnapshot> {
    const source = options.source ?? "auto";
    const prestocks = await RecipeCatalog.loadPreStocks({
      source,
      live: () => PreStocksCatalog.load({
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
        apiUrl: options.prestocksUrl ?? PRESTOCKS_API_URL,
      }),
      fixture: () => RecipeCatalog.recordedBody(options.prestocksFixture),
    });
    return { prestocks };
  }

  private static async recordedBody(override?: unknown): Promise<unknown> {
    if (override !== undefined) return override;
    const path = join(process.cwd(), "lib/recipes/recorded", "prestocks.json");
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  }

  private static async loadPreStocks(options: {
    source: RecipeSourceMode;
    live: () => Promise<IssuerCatalog["assets"]>;
    fixture: () => Promise<unknown>;
  }): Promise<IssuerCatalog> {
    if (options.source !== "fixture") {
      try {
        const assets = await options.live();
        return RecipeCatalog.pack("live", "PreStocks GET /api/prestocks", assets);
      } catch (error) {
        const message = error instanceof Error ? error.message : "prestocks catalog failed";
        if (options.source === "live") {
          return RecipeCatalog.unavailable(message);
        }
        try {
          const assets = PreStocksCatalog.selectAssets(await options.fixture());
          return RecipeCatalog.pack(
            "fixture",
            `Live PreStocks catalog blocked (${message}). Showing labeled recorded PreStocks catalog, not live marks.`,
            assets,
          );
        } catch (fixtureError) {
          const fixture = fixtureError instanceof Error ? fixtureError.message : "recorded catalog failed";
          return RecipeCatalog.unavailable(
            `Live PreStocks catalog blocked (${message}). Recorded fallback also failed: ${fixture}`,
          );
        }
      }
    }
    try {
      const assets = PreStocksCatalog.selectAssets(await options.fixture());
      return RecipeCatalog.pack(
        "fixture",
        "STOCKLANA_RECIPE_SOURCE=fixture. Recorded PreStocks catalog; not live marks.",
        assets,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "recorded catalog failed";
      return RecipeCatalog.unavailable(message);
    }
  }

  private static pack(
    label: RecipeCatalogLabel,
    detail: string,
    assets: IssuerCatalog["assets"],
  ): IssuerCatalog {
    return {
      issuer: "prestocks",
      label,
      detail,
      assets,
      recipes: RecipeComposer.fromPreStocks(assets),
    };
  }

  private static unavailable(detail: string): IssuerCatalog {
    return {
      issuer: "prestocks",
      label: "unavailable",
      detail,
      assets: [],
      recipes: [],
    };
  }
}
