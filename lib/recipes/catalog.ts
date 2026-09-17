import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PRESTOCKS_API_URL, TESSERA_API_URL } from "./constants.ts";
import { RecipeComposer } from "./compose.ts";
import type { RecipeFetch } from "./http.ts";
import { PreStocksCatalog } from "./prestocks.ts";
import { TesseraCatalog } from "./tessera.ts";
import type { IssuerCatalog, RecipeCatalogLabel, RecipeIssuer, RecipeSnapshot } from "./types.ts";

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
    tesseraUrl?: string;
    prestocksFixture?: unknown;
    tesseraFixture?: unknown;
  } = {}): Promise<RecipeSnapshot> {
    const source = options.source ?? "auto";
    const [prestocks, tessera] = await Promise.all([
      RecipeCatalog.loadIssuer({
        issuer: "prestocks",
        source,
        live: () => PreStocksCatalog.load({
          ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
          apiUrl: options.prestocksUrl ?? PRESTOCKS_API_URL,
        }),
        parse: (body) => PreStocksCatalog.selectAssets(body),
        fixture: () => RecipeCatalog.recordedBody("prestocks", options.prestocksFixture),
        liveDetail: "PreStocks GET /api/prestocks",
      }),
      RecipeCatalog.loadIssuer({
        issuer: "tessera",
        source,
        live: () => TesseraCatalog.load({
          ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
          apiUrl: options.tesseraUrl ?? TESSERA_API_URL,
        }),
        parse: (body) => TesseraCatalog.selectAssets(body),
        fixture: () => RecipeCatalog.recordedBody("tessera", options.tesseraFixture),
        liveDetail: "Tessera GET /v1/public/token-details",
      }),
    ]);
    return { prestocks, tessera };
  }

  private static async recordedBody(name: "prestocks" | "tessera", override?: unknown): Promise<unknown> {
    if (override !== undefined) return override;
    const path = join(process.cwd(), "lib/recipes/recorded", `${name}.json`);
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  }

  private static async loadIssuer(options: {
    issuer: RecipeIssuer;
    source: RecipeSourceMode;
    live: () => Promise<IssuerCatalog["assets"]>;
    parse: (body: unknown) => IssuerCatalog["assets"];
    fixture: () => Promise<unknown>;
    liveDetail: string;
  }): Promise<IssuerCatalog> {
    if (options.source !== "fixture") {
      try {
        const assets = await options.live();
        return RecipeCatalog.pack(options.issuer, "live", options.liveDetail, assets);
      } catch (error) {
        const message = error instanceof Error ? error.message : `${options.issuer} catalog failed`;
        if (options.source === "live") {
          return RecipeCatalog.unavailable(options.issuer, message);
        }
        try {
          const assets = options.parse(await options.fixture());
          return RecipeCatalog.pack(
            options.issuer,
            "fixture",
            `Live ${options.issuer} catalog blocked (${message}). Showing labeled recorded catalog, not live marks.`,
            assets,
          );
        } catch (fixtureError) {
          const fixture = fixtureError instanceof Error ? fixtureError.message : "recorded catalog failed";
          return RecipeCatalog.unavailable(
            options.issuer,
            `Live ${options.issuer} catalog blocked (${message}). Recorded fallback also failed: ${fixture}`,
          );
        }
      }
    }
    try {
      const assets = options.parse(await options.fixture());
      return RecipeCatalog.pack(
        options.issuer,
        "fixture",
        `STOCKLANA_RECIPE_SOURCE=fixture. Recorded ${options.issuer} catalog; not live marks.`,
        assets,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "recorded catalog failed";
      return RecipeCatalog.unavailable(options.issuer, message);
    }
  }

  private static pack(
    issuer: RecipeIssuer,
    label: RecipeCatalogLabel,
    detail: string,
    assets: IssuerCatalog["assets"],
  ): IssuerCatalog {
    return {
      issuer,
      label,
      detail,
      assets,
      recipes: RecipeComposer.fromAssets(issuer, assets),
    };
  }

  private static unavailable(issuer: RecipeIssuer, detail: string): IssuerCatalog {
    return {
      issuer,
      label: "unavailable",
      detail,
      assets: [],
      recipes: [],
    };
  }
}
