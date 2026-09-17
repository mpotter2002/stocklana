import type { PublicKey } from "@solana/web3.js";

export type RecipeIssuer = "prestocks" | "tessera";

export type RecipeCatalogLabel = "live" | "fixture" | "unavailable";

export interface RecipeAsset {
  mint: PublicKey;
  symbol: string;
  name: string;
  issuer: RecipeIssuer;
  /** Present only when the issuer documents it. Never guessed. */
  tokenProgram: PublicKey | null;
  decimals: number | null;
}

export interface BasketRecipePreview {
  id: string;
  issuer: RecipeIssuer;
  title: string;
  symbols: string[];
  assets: RecipeAsset[];
  targetBps: number[];
  executableOnLocalnet: false;
  notAFill: true;
  admission: string;
}

export interface IssuerCatalog {
  issuer: RecipeIssuer;
  label: RecipeCatalogLabel;
  detail: string;
  assets: RecipeAsset[];
  recipes: BasketRecipePreview[];
}

export interface RecipeSnapshot {
  prestocks: IssuerCatalog;
  tessera: IssuerCatalog;
}
