import { equalWeights } from "../allocation.ts";
import type { BasketRecipePreview, RecipeAsset } from "./types.ts";

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

const PRESTOCKS_ADMISSION =
  "PreStocks-only catalog. Mainnet list API does not include token program or mint extensions. create_basket still requires extension-free mints that exist on this validator. Preview is not a create and not a fill. Non-PreStocks pre-IPO tokens are omitted from this path.";

export class RecipeComposer {
  static fromPreStocks(assets: RecipeAsset[]): BasketRecipePreview[] {
    const bySymbol = new Map(
      assets.filter((asset) => asset.issuer === "prestocks").map((asset) => [asset.symbol, asset]),
    );
    const recipes: BasketRecipePreview[] = [];
    for (const template of PRESTOCKS_TEMPLATES) {
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
        issuer: "prestocks",
        title: template.title,
        symbols: [...template.symbols],
        assets: selected,
        targetBps: equalWeights(selected.length),
        executableOnLocalnet: false,
        notAFill: true,
        admission: PRESTOCKS_ADMISSION,
      });
    }
    return recipes;
  }
}
