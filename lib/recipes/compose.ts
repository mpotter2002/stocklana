import { equalWeights } from "../allocation.ts";
import type { BasketRecipePreview, RecipeAsset, RecipeIssuer } from "./types.ts";

const PRESTOCKS_TEMPLATES: { id: string; title: string; symbols: readonly string[] }[] = [
  {
    id: "prestocks-openai-anthropic",
    title: "OpenAI + Anthropic",
    symbols: ["OPENAI", "ANTHROPIC"],
  },
  {
    id: "prestocks-spacex-openai",
    title: "SpaceX + OpenAI",
    symbols: ["SPACEX", "OPENAI"],
  },
  {
    id: "prestocks-openai-anthropic-spacex",
    title: "OpenAI + Anthropic + SpaceX",
    symbols: ["OPENAI", "ANTHROPIC", "SPACEX"],
  },
  {
    id: "prestocks-kalshi-polymarket",
    title: "Kalshi + Polymarket",
    symbols: ["KALSHI", "POLYMARKET"],
  },
];

const TESSERA_TEMPLATES: { id: string; title: string; symbols: readonly string[] }[] = [
  {
    id: "tessera-openai-kalshi",
    title: "T-OpenAI + T-Kalshi",
    symbols: ["tOpenAI", "tKalshi"],
  },
  {
    id: "tessera-openai-spacex",
    title: "T-OpenAI + T-SpaceX",
    symbols: ["tOpenAI", "tSpaceX"],
  },
  {
    id: "tessera-openai-kalshi-spacex",
    title: "T-OpenAI + T-Kalshi + T-SpaceX",
    symbols: ["tOpenAI", "tKalshi", "tSpaceX"],
  },
];

const ADMISSION: Record<RecipeIssuer, string> = {
  prestocks:
    "Mainnet catalog only. PreStocks list API does not include token program or mint extensions. create_basket still requires extension-free mints that exist on this validator. Preview is not a create and not a fill.",
  tessera:
    "Mainnet catalog only. Tessera docs list Token-2022 mints with transfer-fee and other extensions; create_basket rejects mint extensions. These mints are not on localnet. Preview is not a create and not a fill.",
};

export class RecipeComposer {
  static fromAssets(issuer: RecipeIssuer, assets: RecipeAsset[]): BasketRecipePreview[] {
    const templates = issuer === "prestocks" ? PRESTOCKS_TEMPLATES : TESSERA_TEMPLATES;
    const bySymbol = new Map(assets.filter((asset) => asset.issuer === issuer).map((asset) => [asset.symbol, asset]));
    const recipes: BasketRecipePreview[] = [];
    for (const template of templates) {
      const selected: RecipeAsset[] = [];
      let missing = false;
      for (const symbol of template.symbols) {
        const asset = bySymbol.get(symbol);
        if (!asset) {
          missing = true;
          break;
        }
        selected.push(asset);
      }
      if (missing) continue;
      recipes.push({
        id: template.id,
        issuer,
        title: template.title,
        symbols: [...template.symbols],
        assets: selected,
        targetBps: equalWeights(selected.length),
        executableOnLocalnet: false,
        notAFill: true,
        admission: ADMISSION[issuer],
      });
    }
    return recipes;
  }
}
