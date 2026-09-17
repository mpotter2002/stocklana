"use client";

import { RefreshCw, ShieldCheck } from "lucide-react";
import { PublicKey } from "@solana/web3.js";
import { useCallback, useEffect, useState } from "react";
import { shortPublicKey } from "../lib/solana/injected-wallet";
import {
  PEGLENS_RELATED_URL,
  PRESTOCKS_PRODUCTS_URL,
  TESSERA_RELATED_URL,
} from "../lib/recipes/constants.ts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type RecipeAssetJson = {
  mint: string;
  symbol: string;
  name: string;
  issuer: "prestocks";
  tokenProgram: string | null;
  decimals: number | null;
};

type RecipeJson = {
  id: string;
  issuer: "prestocks";
  title: string;
  symbols: string[];
  targetBps: number[];
  executableOnLocalnet: false;
  notAFill: true;
  admission: string;
  assets: RecipeAssetJson[];
};

type IssuerPayload = {
  issuer: "prestocks";
  label: "live" | "fixture" | "unavailable";
  detail: string;
  assets: RecipeAssetJson[];
  recipes: RecipeJson[];
};

type CatalogPayload = {
  prestocks: IssuerPayload;
};

function badgeFor(label: IssuerPayload["label"]): string {
  if (label === "live") return "PRESTOCKS LIVE";
  if (label === "fixture") return "PRESTOCKS FIXTURE";
  return "PRESTOCKS UNAVAILABLE";
}

export function RecipeRail() {
  const [catalog, setCatalog] = useState<CatalogPayload | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setCatalogError(null);
    try {
      const response = await fetch("/api/recipes/inventory", { cache: "no-store" });
      const body = await response.json() as CatalogPayload;
      setCatalog(body);
      setSelectedId((current) => {
        const recipes = body.prestocks.recipes;
        if (current && recipes.some((recipe) => recipe.id === current)) return current;
        return recipes[0]?.id ?? null;
      });
    } catch (error) {
      setCatalog(null);
      setCatalogError(error instanceof Error ? error.message : "Recipe catalog failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const recipes = catalog?.prestocks.recipes ?? [];
  const selected = recipes.find((recipe) => recipe.id === selectedId) ?? null;

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <CardDescription className="text-[11px] font-medium tracking-[0.14em] uppercase">
              Recipe rail
            </CardDescription>
            <CardTitle>PreStocks recipes</CardTitle>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              {catalog ? badgeFor(catalog.prestocks.label) : "UNCHECKED"}
            </Badge>
            <Button
              aria-label="Refresh PreStocks recipes"
              onClick={() => void refresh()}
              size="icon-sm"
              type="button"
              variant="outline"
            >
              <RefreshCw className={loading ? "animate-spin" : undefined} />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        <p className="text-xs leading-5 text-muted-foreground">
          PreStocks-only 2–3 asset basket{" "}
          <span className="font-medium text-foreground">previews</span> from
          `GET /api/prestocks`. They are not local test mints, not Jupiter xStocks,
          not Pyth marks, and not fills. Non-PreStocks pre-IPO tokens (including
          Tessera) are omitted from this path so the PreStocks bounty story stays
          eligible. Local create/deposit still uses issued validator mints.
        </p>
        <p className="text-xs leading-5 break-words text-muted-foreground">
          {catalog?.prestocks.detail
            ?? catalogError
            ?? (loading ? "Loading PreStocks catalog…" : "")}
        </p>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
            PreStocks · {recipes.length} recipes · {catalog?.prestocks.assets.length ?? 0} tokens
          </p>
          <div className="max-h-56 overflow-auto rounded-lg border">
            {recipes.length === 0 ? (
              <p className="px-3 py-4 text-xs text-muted-foreground">
                {catalog?.prestocks.label === "unavailable"
                  ? "PreStocks catalog is unavailable. No mints invented."
                  : "No PreStocks recipes from the current catalog."}
              </p>
            ) : recipes.map((recipe) => {
              const selectedRecipe = recipe.id === selectedId;
              return (
                <button
                  className={cn(
                    "grid w-full grid-cols-[1fr_auto] items-center border-b px-3 py-2 text-left last:border-b-0 hover:bg-muted",
                    selectedRecipe && "bg-accent",
                  )}
                  key={recipe.id}
                  onClick={() => setSelectedId(recipe.id)}
                  type="button"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{recipe.title}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {recipe.symbols.join(" + ")} · {recipe.targetBps.join("/")} bps
                    </span>
                  </span>
                  <span className="text-[11px] text-muted-foreground">preview</span>
                </button>
              );
            })}
          </div>
        </div>

        {selected ? (
          <Alert>
            <ShieldCheck />
            <AlertTitle>PreStocks recipe preview (not a create, not a fill)</AlertTitle>
            <AlertDescription>
              <ul className="mt-1 flex flex-col gap-1 font-mono text-[11px]">
                <li>{selected.title} · prestocks-only</li>
                <li>weights {selected.targetBps.join(" / ")} bps · equal recipe</li>
                <li>localnet create {selected.executableOnLocalnet ? "yes" : "N/A"}</li>
                {selected.assets.map((asset) => (
                  <li key={asset.mint}>
                    {asset.symbol} {shortPublicKey(new PublicKey(asset.mint))}
                    {asset.decimals === null ? "" : ` · ${asset.decimals} dp`}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs leading-5">{selected.admission}</p>
            </AlertDescription>
          </Alert>
        ) : (
          <p className="text-xs text-muted-foreground">
            No PreStocks recipe is available to preview. The UI will not invent mints.
          </p>
        )}

        <p className="text-xs leading-5 text-muted-foreground">
          PreStocks products:{" "}
          <a className="underline underline-offset-3" href={PRESTOCKS_PRODUCTS_URL} rel="noreferrer" target="_blank">
            prestocks.com/products
          </a>
          . Related (not this bounty path):{" "}
          <a className="underline underline-offset-3" href={PEGLENS_RELATED_URL} rel="noreferrer" target="_blank">
            PegLens
          </a>
          {", "}
          <a className="underline underline-offset-3" href={TESSERA_RELATED_URL} rel="noreferrer" target="_blank">
            Tessera
          </a>
          {" "}— link-outs only; those tokens are not in these recipes.
        </p>
      </CardContent>
    </Card>
  );
}
