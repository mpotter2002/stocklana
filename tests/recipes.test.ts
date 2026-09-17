import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { RecipeCatalog } from "../lib/recipes/catalog.ts";
import { RecipeComposer } from "../lib/recipes/compose.ts";
import type { RecipeFetch } from "../lib/recipes/http.ts";
import { RecipeJson } from "../lib/recipes/json.ts";
import { PreStocksCatalog } from "../lib/recipes/prestocks.ts";
import { TesseraCatalog } from "../lib/recipes/tessera.ts";

const prestocksBody = JSON.parse(
  await readFile(new URL("../lib/recipes/recorded/prestocks.json", import.meta.url), "utf8"),
) as unknown;
const tesseraBody = JSON.parse(
  await readFile(new URL("../lib/recipes/recorded/tessera.json", import.meta.url), "utf8"),
) as unknown;

function fetchScript(script: Array<{ match: RegExp; status: number; body: unknown }>): RecipeFetch {
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

test("PreStocks parser keeps documented contract addresses and drops junk", () => {
  const listed = PreStocksCatalog.selectAssets(prestocksBody);
  assert.ok(listed.length >= 8);
  const openai = listed.find((asset) => asset.symbol === "OPENAI");
  const spacex = listed.find((asset) => asset.symbol === "SPACEX");
  assert.equal(openai?.mint.toBase58(), "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF");
  assert.equal(spacex?.mint.toBase58(), "PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh");
  assert.equal(openai?.tokenProgram, null);
  assert.equal(openai?.decimals, null);
  const dropped = PreStocksCatalog.selectAssets([
    { symbol: "FAKE" },
    {
      name: "Nope",
      symbol: "NOPE",
      contract_address: "not-a-pubkey",
    },
  ]);
  assert.equal(dropped.length, 0);
});

test("Tessera parser uses documented mints and Token-2022 program, not invented addresses", () => {
  const listed = TesseraCatalog.selectAssets(tesseraBody);
  assert.equal(listed.length, 3);
  const openai = listed.find((asset) => asset.symbol === "tOpenAI");
  const kalshi = listed.find((asset) => asset.symbol === "tKalshi");
  assert.equal(openai?.mint.toBase58(), "oPAiAikWTaFj9RYoRFD35ccfwhnMcB3ThgBZRHSkjTZ");
  assert.equal(kalshi?.mint.toBase58(), "TKLSidmLVt3cqGaaodG8tyRzoANfQwoh67AccjmubeZ");
  assert.equal(openai?.tokenProgram?.toBase58(), "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
  assert.equal(openai?.decimals, 9);
});

test("composer builds equal-weight same-issuer recipes and never mixes PreStocks with Tessera", () => {
  const prestocks = RecipeComposer.fromAssets("prestocks", PreStocksCatalog.selectAssets(prestocksBody));
  const tessera = RecipeComposer.fromAssets("tessera", TesseraCatalog.selectAssets(tesseraBody));
  assert.ok(prestocks.some((recipe) => recipe.id === "prestocks-openai-anthropic"));
  assert.ok(tessera.some((recipe) => recipe.id === "tessera-openai-kalshi"));
  assert.equal(prestocks.every((recipe) => recipe.assets.every((asset) => asset.issuer === "prestocks")), true);
  assert.equal(tessera.every((recipe) => recipe.assets.every((asset) => asset.issuer === "tessera")), true);
  assert.equal(prestocks.every((recipe) => recipe.executableOnLocalnet === false), true);
  assert.equal(tessera.every((recipe) => recipe.notAFill === true), true);
  const two = prestocks.find((recipe) => recipe.id === "prestocks-openai-anthropic");
  const three = tessera.find((recipe) => recipe.id === "tessera-openai-kalshi-spacex");
  assert.deepEqual(two?.targetBps, [5000, 5000]);
  assert.deepEqual(three?.targetBps, [3334, 3333, 3333]);
});

test("missing catalog symbols skip the recipe instead of inventing a mint", () => {
  const onlyOpenAi = PreStocksCatalog.selectAssets(prestocksBody).filter((asset) => asset.symbol === "OPENAI");
  const recipes = RecipeComposer.fromAssets("prestocks", onlyOpenAi);
  assert.equal(recipes.length, 0);
});

test("auto source uses live catalogs when they respond", async () => {
  const snapshot = await RecipeCatalog.load({
    source: "auto",
    fetchImpl: fetchScript([
      { match: /prestocks\.com/, status: 200, body: prestocksBody },
      { match: /tessera\.pe/, status: 200, body: tesseraBody },
    ]),
  });
  assert.equal(snapshot.prestocks.label, "live");
  assert.equal(snapshot.tessera.label, "live");
  assert.ok(snapshot.prestocks.recipes.length >= 1);
  assert.ok(snapshot.tessera.recipes.length >= 1);
  const json = RecipeJson.snapshot(snapshot);
  assert.equal(json.prestocks.recipes[0]?.executableOnLocalnet, false);
  assert.equal(json.tessera.recipes[0]?.notAFill, true);
});

test("auto source falls back to labeled fixtures independently per issuer", async () => {
  const snapshot = await RecipeCatalog.load({
    source: "auto",
    fetchImpl: fetchScript([
      { match: /prestocks\.com/, status: 503, body: { error: "down" } },
      { match: /tessera\.pe/, status: 200, body: tesseraBody },
    ]),
    prestocksFixture: prestocksBody,
  });
  assert.equal(snapshot.prestocks.label, "fixture");
  assert.equal(snapshot.tessera.label, "live");
  assert.match(snapshot.prestocks.detail, /not live marks/);
  assert.ok(snapshot.prestocks.recipes.length >= 1);
});

test("live source stays empty when a catalog is blocked instead of inventing mints", async () => {
  const snapshot = await RecipeCatalog.load({
    source: "live",
    fetchImpl: fetchScript([
      { match: /prestocks\.com/, status: 503, body: { error: "down" } },
      { match: /tessera\.pe/, status: 503, body: { error: "down" } },
    ]),
  });
  assert.equal(snapshot.prestocks.label, "unavailable");
  assert.equal(snapshot.tessera.label, "unavailable");
  assert.equal(snapshot.prestocks.assets.length, 0);
  assert.equal(snapshot.prestocks.recipes.length, 0);
  assert.equal(snapshot.tessera.recipes.length, 0);
});

test("fixture source never calls the network", async () => {
  const snapshot = await RecipeCatalog.load({
    source: "fixture",
    fetchImpl: async () => {
      throw new Error("network should not be used in fixture mode");
    },
    prestocksFixture: prestocksBody,
    tesseraFixture: tesseraBody,
  });
  assert.equal(snapshot.prestocks.label, "fixture");
  assert.equal(snapshot.tessera.label, "fixture");
  assert.ok(snapshot.prestocks.recipes.some((recipe) => recipe.id === "prestocks-spacex-openai"));
  assert.ok(snapshot.tessera.recipes.some((recipe) => recipe.id === "tessera-openai-kalshi"));
});
