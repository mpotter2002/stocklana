import type { RecipeSnapshot } from "./types.ts";

export class RecipeJson {
  static snapshot(snapshot: RecipeSnapshot) {
    const catalog = snapshot.prestocks;
    return {
      prestocks: {
        issuer: catalog.issuer,
        label: catalog.label,
        detail: catalog.detail,
        assets: catalog.assets.map((asset) => ({
          mint: asset.mint.toBase58(),
          symbol: asset.symbol,
          name: asset.name,
          issuer: asset.issuer,
          tokenProgram: asset.tokenProgram?.toBase58() ?? null,
          decimals: asset.decimals,
        })),
        recipes: catalog.recipes.map((recipe) => ({
          id: recipe.id,
          issuer: recipe.issuer,
          title: recipe.title,
          symbols: recipe.symbols,
          targetBps: recipe.targetBps,
          executableOnLocalnet: recipe.executableOnLocalnet,
          notAFill: recipe.notAFill,
          admission: recipe.admission,
          assets: recipe.assets.map((asset) => ({
            mint: asset.mint.toBase58(),
            symbol: asset.symbol,
            name: asset.name,
            issuer: asset.issuer,
            tokenProgram: asset.tokenProgram?.toBase58() ?? null,
            decimals: asset.decimals,
          })),
        })),
      },
    };
  }
}
