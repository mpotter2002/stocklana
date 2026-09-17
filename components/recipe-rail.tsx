"use client";

import { RefreshCw, ShieldCheck } from "lucide-react";
import { PublicKey } from "@solana/web3.js";
import { useCallback, useEffect, useState } from "react";
import { shortPublicKey } from "../lib/solana/injected-wallet";
import {
  PEGLENS_RELATED_URL,
  PRESTOCKS_PRODUCTS_URL,
  TESSERA_APP_URL,
  TESSERA_DOCS_URL,
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
  issuer: "prestocks" | "tessera";
  tokenProgram: string | null;
  decimals: number | null;
};

type RecipeJson = {
  id: string;
  issuer: "prestocks" | "tessera";
  title: string;
  symbols: string[];
  targetBps: number[];
  executableOnLocalnet: false;
  notAFill: true;
  admission: string;
  assets: RecipeAssetJson[];
};

type IssuerPayload = {
  issuer: "prestocks" | "tessera";
  label: "live" | "fixture" | "unavailable";
  detail: string;
  assets: RecipeAssetJson[];
  recipes: RecipeJson[];
};

type CatalogPayload = {
  prestocks: IssuerPayload;
  tessera: IssuerPayload;
};

function badgeFor(issuer: "prestocks" | "tessera", label: IssuerPayload["label"]): string {
  const name = issuer === "prestocks" ? "PRESTOCKS" : "TESSERA";
  if (label === "live") return `${name} LIVE`;
  if (label === "fixture") return `${name} FIXTURE`;
  return `${name} UNAVAILABLE`;
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
        const recipes = [...(body.prestocks.recipes), ...(body.tessera.recipes)];
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

  const recipes = catalog
    ? [...catalog.prestocks.recipes, ...catalog.tessera.recipes]
    : [];
  const selected = recipes.find((recipe) => recipe.id === selectedId) ?? null;

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <CardDescription className="text-[11px] font-medium tracking-[0.14em] uppercase">
              Recipe rail
            </CardDescription>
            <CardTitle>PreStocks and Tessera recipes</CardTitle>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              {catalog ? badgeFor("prestocks", catalog.prestocks.label) : "UNCHECKED"}
            </Badge>
            <Badge variant="outline">
              {catalog ? badgeFor("tessera", catalog.tessera.label) : "UNCHECKED"}
            </Badge>
            <Button
              aria-label="Refresh PreStocks and Tessera recipes"
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
          These are 2–3 asset basket <span className="font-medium text-foreground">previews</span> from
          issuer catalogs. They are not local test mints, not Jupiter xStocks, not Pyth marks,
          and not fills. PreStocks and Tessera stay on separate rails — mixing other pre-IPO
          tokens would make a PreStocks bounty claim ineligible. Local create/deposit still uses
          issued validator mints.{" "}
          <a className="underline underline-offset-3" href={PEGLENS_RELATED_URL} rel="noreferrer" target="_blank">
            PegLens
          </a>{" "}
          links these issuers as related; this rail surfaces recipes in-product.
        </p>
        <p className="text-xs leading-5 break-words text-muted-foreground">
          {catalog
            ? `${catalog.prestocks.detail} · ${catalog.tessera.detail}`
            : catalogError ?? (loading ? "Loading PreStocks and Tessera catalogs…" : "")}
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <IssuerGroup
            title="PreStocks"
            catalog={catalog?.prestocks ?? null}
            selectedId={selectedId}
            onSelect={setSelectedId}
            productsUrl={PRESTOCKS_PRODUCTS_URL}
          />
          <IssuerGroup
            title="Tessera"
            catalog={catalog?.tessera ?? null}
            selectedId={selectedId}
            onSelect={setSelectedId}
            productsUrl={TESSERA_APP_URL}
          />
        </div>

        {selected ? (
          <Alert>
            <ShieldCheck />
            <AlertTitle>Recipe preview (not a create, not a fill)</AlertTitle>
            <AlertDescription>
              <ul className="mt-1 flex flex-col gap-1 font-mono text-[11px]">
                <li>{selected.title} · {selected.issuer}</li>
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
            No recipe is available to preview. The UI will not invent PreStocks or Tessera mints.
          </p>
        )}

        <p className="text-xs leading-5 text-muted-foreground">
          Tessera docs:{" "}
          <a className="underline underline-offset-3" href={TESSERA_DOCS_URL} rel="noreferrer" target="_blank">
            docs.tessera.pe
          </a>
          . PreStocks products:{" "}
          <a className="underline underline-offset-3" href={PRESTOCKS_PRODUCTS_URL} rel="noreferrer" target="_blank">
            prestocks.com/products
          </a>
          .
        </p>
      </CardContent>
    </Card>
  );
}

function IssuerGroup({
  title,
  catalog,
  selectedId,
  onSelect,
  productsUrl,
}: {
  title: string;
  catalog: IssuerPayload | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  productsUrl: string;
}) {
  const recipes = catalog?.recipes ?? [];
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
        {title} · {recipes.length} recipes · {catalog?.assets.length ?? 0} tokens
      </p>
      <div className="max-h-56 overflow-auto rounded-lg border">
        {recipes.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">
            {catalog?.label === "unavailable"
              ? `${title} catalog is unavailable. No mints invented.`
              : `No ${title} recipes from the current catalog.`}
          </p>
        ) : recipes.map((recipe) => {
          const selected = recipe.id === selectedId;
          return (
            <button
              className={cn(
                "grid w-full grid-cols-[1fr_auto] items-center border-b px-3 py-2 text-left last:border-b-0 hover:bg-muted",
                selected && "bg-accent",
              )}
              key={recipe.id}
              onClick={() => onSelect(recipe.id)}
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
      <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
        <a className="underline underline-offset-3" href={productsUrl} rel="noreferrer" target="_blank">
          {title} product page
        </a>
      </p>
    </div>
  );
}
