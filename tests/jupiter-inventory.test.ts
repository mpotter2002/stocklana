import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BackpackInventory } from "../lib/jupiter/backpack.ts";
import { JupiterCatalog } from "../lib/jupiter/catalog.ts";
import { JupiterInventory } from "../lib/jupiter/inventory.ts";
import type { JupiterFetch } from "../lib/jupiter/http.ts";

const stockSearch = JSON.parse(
  await readFile(new URL("./fixtures/jupiter/tokens-search-xstock.json", import.meta.url), "utf8"),
) as unknown;
const usdcSearch = JSON.parse(
  await readFile(new URL("./fixtures/jupiter/tokens-search-usdc.json", import.meta.url), "utf8"),
) as unknown;
const invalidTag = JSON.parse(
  await readFile(new URL("./fixtures/jupiter/tokens-tag-stocks-invalid.json", import.meta.url), "utf8"),
) as unknown;
const backpackMarkets = JSON.parse(
  await readFile(new URL("./fixtures/jupiter/backpack-markets.json", import.meta.url), "utf8"),
) as unknown;

function fetchScript(script: Array<{ match: RegExp; status: number; body: unknown }>): JupiterFetch {
  return async (url) => {
    const hit = script.find((entry) => entry.match.test(url));
    if (!hit) throw new Error(`Unexpected fetch ${url}`);
    return {
      ok: hit.status >= 200 && hit.status < 300,
      status: hit.status,
      async text() {
        return JSON.stringify(hit.body);
      },
    };
  };
}

test("stock inventory keeps Jupiter-tagged xStocks and indexes, not lookalikes", () => {
  const listed = JupiterInventory.selectStockInventory(stockSearch);
  assert.ok(listed.length >= 8);
  assert.ok(listed.every((asset) => asset.tags.includes("xstocks") || asset.tags.includes("stocks")));
  const aapl = listed.find((asset) => asset.symbol === "AAPLx");
  const spy = listed.find((asset) => asset.symbol === "SPYx");
  const qqq = listed.find((asset) => asset.symbol === "QQQx");
  const index = listed.find((asset) => asset.symbol === "USPXx");
  assert.equal(aapl?.kind, "xstock");
  assert.equal(aapl?.mint.toBase58(), "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp");
  assert.equal(spy?.kind, "index");
  assert.equal(qqq?.kind, "index");
  assert.equal(index?.kind, "index");
  assert.equal(
    listed.some((asset) => asset.mint.toBase58().endsWith("pump")),
    false,
  );
});

test("verified USDC is taken from Jupiter search, not a hardcoded fill", () => {
  const usdc = JupiterInventory.selectVerifiedUsdc(usdcSearch);
  assert.equal(usdc?.symbol, "USDC");
  assert.equal(usdc?.name, "USD Coin");
  assert.equal(usdc?.mint.toBase58(), "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
});

test("malformed token rows are dropped instead of inventing mints", () => {
  const listed = JupiterInventory.selectStockInventory([
    { symbol: "FAKE" },
    {
      id: "not-a-pubkey",
      name: "Nope",
      symbol: "NOPE",
      decimals: 6,
      tokenProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      tags: ["xstocks"],
    },
  ]);
  assert.equal(listed.length, 0);
});

test("Jupiter load falls back to search when the stocks tag is invalid", async () => {
  const loaded = await JupiterInventory.load({
    fetchImpl: fetchScript([
      { match: /\/tokens\/v2\/tag\?query=stocks/, status: 400, body: invalidTag },
      { match: /\/tokens\/v2\/search\?query=USDC/, status: 200, body: usdcSearch },
      { match: /\/tokens\/v2\/search\?query=/, status: 200, body: stockSearch },
    ]),
  });
  assert.equal(loaded.usedSearchFallback, true);
  assert.ok(loaded.assets.some((asset) => asset.symbol === "AAPLx"));
  assert.equal(loaded.funding?.symbol, "USDC");
});

test("catalog uses Backpack only after Jupiter is blocked", async () => {
  const jupiterFirst = await JupiterCatalog.load({
    fetchImpl: fetchScript([
      { match: /\/tokens\/v2\/tag\?query=stocks/, status: 400, body: invalidTag },
      { match: /\/tokens\/v2\/search\?query=USDC/, status: 200, body: usdcSearch },
      { match: /\/tokens\/v2\/search\?query=/, status: 200, body: stockSearch },
      { match: /backpack\.exchange/, status: 200, body: backpackMarkets },
    ]),
  });
  assert.equal(jupiterFirst.source, "jupiter");
  assert.equal(jupiterFirst.backpack.length, 0);

  const backup = await JupiterCatalog.load({
    fetchImpl: fetchScript([
      { match: /\/tokens\/v2\/tag/, status: 503, body: { error: "down" } },
      { match: /\/tokens\/v2\/search/, status: 503, body: { error: "down" } },
      { match: /backpack\.exchange/, status: 200, body: backpackMarkets },
    ]),
  });
  assert.equal(backup.source, "backpack-backup");
  assert.equal(backup.catalogLabel, "blocked");
  assert.equal(backup.assets.length, 0);
  assert.ok(backup.backpack.some((market) => market.symbol === "SPCX.US_USDC"));
  assert.equal(backup.backpack.some((market) => market.symbol === "SOL_USDC"), false);
});

test("Backpack parser keeps STOCK markets and drops others", () => {
  const markets = BackpackInventory.selectStockMarkets(backpackMarkets);
  assert.equal(markets.every((market) => market.rwaMarketType === "STOCK"), true);
  assert.equal(markets.some((market) => market.symbol === "SOL_USDC"), false);
});
