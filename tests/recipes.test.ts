import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { RecipeCatalog } from "../lib/recipes/catalog.ts";
import { RecipeComposer } from "../lib/recipes/compose.ts";
import type { RecipeFetch } from "../lib/recipes/http.ts";
import { RecipeJson } from "../lib/recipes/json.ts";
import { PreStocksCatalog } from "../lib/recipes/prestocks.ts";

const prestocksBody = JSON.parse(
  await readFile(new URL("../lib/recipes/recorded/prestocks.json", import.meta.url), "utf8"),
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

test("composer builds equal-weight PreStocks-only recipes", () => {
  const recipes = RecipeComposer.fromPreStocks(PreStocksCatalog.selectAssets(prestocksBody));
  assert.ok(recipes.some((recipe) => recipe.id === "prestocks-openai-anthropic"));
  assert.ok(recipes.some((recipe) => recipe.id === "prestocks-openai-anthropic-spacex"));
  assert.equal(recipes.every((recipe) => recipe.issuer === "prestocks"), true);
  assert.equal(recipes.every((recipe) => recipe.assets.every((asset) => asset.issuer === "prestocks")), true);
  assert.equal(recipes.every((recipe) => recipe.executableOnLocalnet === false), true);
  assert.equal(recipes.every((recipe) => recipe.notAFill === true), true);
  assert.equal(recipes.some((recipe) => recipe.id.startsWith("tessera-")), false);
  const two = recipes.find((recipe) => recipe.id === "prestocks-openai-anthropic");
  const three = recipes.find((recipe) => recipe.id === "prestocks-openai-anthropic-spacex");
  assert.deepEqual(two?.targetBps, [5000, 5000]);
  assert.deepEqual(three?.targetBps, [3334, 3333, 3333]);
});

test("missing catalog symbols skip the recipe instead of inventing a mint", () => {
  const onlyOpenAi = PreStocksCatalog.selectAssets(prestocksBody).filter((asset) => asset.symbol === "OPENAI");
  const recipes = RecipeComposer.fromPreStocks(onlyOpenAi);
  assert.equal(recipes.length, 0);
});

test("auto source uses the live PreStocks catalog when it responds", async () => {
  const snapshot = await RecipeCatalog.load({
    source: "auto",
    fetchImpl: fetchScript([
      { match: /prestocks\.com/, status: 200, body: prestocksBody },
    ]),
  });
  assert.equal(snapshot.prestocks.label, "live");
  assert.ok(snapshot.prestocks.recipes.length >= 1);
  const json = RecipeJson.snapshot(snapshot);
  assert.equal("tessera" in json, false);
  assert.equal(json.prestocks.recipes[0]?.executableOnLocalnet, false);
  assert.equal(json.prestocks.recipes.every((recipe) => recipe.issuer === "prestocks"), true);
});

test("catalog load never fetches Tessera", async () => {
  const snapshot = await RecipeCatalog.load({
    source: "auto",
    fetchImpl: async (url) => {
      if (/tessera/i.test(url)) throw new Error("Tessera must not be fetched on the PreStocks path");
      if (!/prestocks\.com/.test(url)) throw new Error(`Unexpected fetch ${url}`);
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify(prestocksBody);
        },
      };
    },
  });
  assert.equal(snapshot.prestocks.label, "live");
  assert.equal(
    snapshot.prestocks.assets.every((asset) => asset.issuer === "prestocks"),
    true,
  );
});

test("auto source falls back to a labeled PreStocks fixture when live is blocked", async () => {
  const snapshot = await RecipeCatalog.load({
    source: "auto",
    fetchImpl: fetchScript([
      { match: /prestocks\.com/, status: 503, body: { error: "down" } },
    ]),
    prestocksFixture: prestocksBody,
  });
  assert.equal(snapshot.prestocks.label, "fixture");
  assert.match(snapshot.prestocks.detail, /not live marks/);
  assert.ok(snapshot.prestocks.recipes.length >= 1);
});

test("live source stays empty when PreStocks is blocked instead of inventing mints", async () => {
  const snapshot = await RecipeCatalog.load({
    source: "live",
    fetchImpl: fetchScript([
      { match: /prestocks\.com/, status: 503, body: { error: "down" } },
    ]),
  });
  assert.equal(snapshot.prestocks.label, "unavailable");
  assert.equal(snapshot.prestocks.assets.length, 0);
  assert.equal(snapshot.prestocks.recipes.length, 0);
});

test("fixture source never calls the network", async () => {
  const snapshot = await RecipeCatalog.load({
    source: "fixture",
    fetchImpl: async () => {
      throw new Error("network should not be used in fixture mode");
    },
    prestocksFixture: prestocksBody,
  });
  assert.equal(snapshot.prestocks.label, "fixture");
  assert.ok(snapshot.prestocks.recipes.some((recipe) => recipe.id === "prestocks-spacex-openai"));
});
