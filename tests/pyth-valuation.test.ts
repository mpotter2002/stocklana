import assert from "node:assert/strict";
import { test } from "node:test";
import { Keypair, PublicKey } from "@solana/web3.js";
import { PythFeeds } from "../lib/pyth/feeds.ts";
import { HermesPriceClient } from "../lib/pyth/hermes.ts";
import { LocalTestPythQuotes } from "../lib/pyth/local-quotes.ts";
import { LocalTestFeedMap } from "../lib/pyth/local-test-map.ts";
import { PythQuoteClient } from "../lib/pyth/quote-client.ts";
import { PythQuoteCodec } from "../lib/pyth/quote.ts";
import { PythQuoteService } from "../lib/pyth/quote-service.ts";
import { BasketValuation } from "../lib/pyth/valuation.ts";
import { LocalTestMints } from "../lib/solana/local-test-mints.ts";

/** Documented Hermes `/v2/updates/price/latest` parsed payload from Pyth docs. */
const HERMES_DOCS_BODY = {
  binary: { encoding: "hex", data: ["504e4155"] },
  parsed: [
    {
      id: "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
      price: {
        price: "6140993501000",
        conf: "3287868567",
        expo: -8,
        publish_time: 1_714_746_101,
      },
      ema_price: {
        price: "6094004700000",
        conf: "3792887800",
        expo: -8,
        publish_time: 1_714_746_101,
      },
      metadata: {
        slot: 138_881_186,
        proof_available_time: 1_714_746_103,
        prev_publish_time: 1_714_746_101,
      },
    },
    {
      id: "c96458d393fe9deb7a7d63a0ac41e2898a67a7750dbd166673279e06c868df0a",
      price: {
        price: "4959503",
        conf: "5465",
        expo: -8,
        publish_time: 1_714_746_101,
      },
      ema_price: {
        price: "4982594",
        conf: "5536",
        expo: -8,
        publish_time: 1_714_746_101,
      },
      metadata: {
        slot: 138_881_186,
        proof_available_time: 1_714_746_103,
        prev_publish_time: 1_714_746_101,
      },
    },
  ],
};

test("Pyth Core feed IDs match Hermes price_feeds lookups", () => {
  assert.equal(
    PythFeeds.USDC_USD.id,
    "eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
  );
  assert.equal(PythFeeds.USDC_USD.pythSymbol, "Crypto.USDC/USD");
  assert.equal(
    PythFeeds.AAPL_USD.id,
    "49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688",
  );
  assert.equal(PythFeeds.normalizeId(`0x${PythFeeds.MSFT_USD.id.toUpperCase()}`), PythFeeds.MSFT_USD.id);
  assert.throws(() => PythFeeds.normalizeId("not-a-feed"));
});

test("local test symbols map to official Pyth stand-in feeds, not invented mints", () => {
  const owner = Keypair.generate().publicKey;
  const mintKeys = [Keypair.generate(), Keypair.generate(), Keypair.generate(), Keypair.generate()];
  const issued = LocalTestMints.issue({
    owner,
    rentLamports: 1_461_600n,
    mintKeys,
  });
  assert.equal(LocalTestFeedMap.byLocalSymbol("USDCt")?.feed.pythSymbol, "Crypto.USDC/USD");
  assert.equal(LocalTestFeedMap.byMint(issued.mintSet.funding.mint, issued.mintSet)?.feed.displaySymbol, "USDC");
  assert.equal(
    LocalTestFeedMap.byMint(issued.mintSet.assets[0]!.mint, issued.mintSet)?.feed.pythSymbol,
    "Equity.US.AAPL/USD",
  );
  assert.equal(LocalTestFeedMap.byMint(new PublicKey(new Uint8Array(32).fill(9)), issued.mintSet), null);
});

test("parser accepts the documented Hermes latest-price shape", () => {
  const quotes = PythQuoteCodec.parseHermesBody(HERMES_DOCS_BODY, "hermes");
  assert.equal(quotes.length, 2);
  assert.equal(quotes[0]?.price, 6_140_993_501_000n);
  assert.equal(quotes[0]?.expo, -8);
  assert.equal(quotes[0]?.source, "hermes");
  assert.equal(quotes[1]?.conf, 5465n);
});

test("parser rejects incomplete or zero Hermes prices", () => {
  assert.throws(() => PythQuoteCodec.parseHermesBody({}, "hermes"));
  assert.throws(() => PythQuoteCodec.parseHermesBody({ parsed: [{ id: "aa" }] }, "hermes"));
  assert.throws(() => PythQuoteCodec.fromHermesFeed({
    id: PythFeeds.USDC_USD.id,
    price: { price: "0", conf: "1", expo: -8, publish_time: 1 },
  }, "hermes"));
});

test("local-test quotes stay in Pyth price/expo form and are labeled", () => {
  const quotes = LocalTestPythQuotes.quotes();
  assert.equal(quotes.every((quote) => quote.source === "local-test"), true);
  const usdc = quotes.find((quote) => quote.feedId === PythFeeds.USDC_USD.id);
  assert.equal(usdc?.price, 100_000_000n);
  assert.equal(usdc?.expo, -8);
  assert.equal(BasketValuation.formatUnitPrice(usdc!), "$1");
});

test("holdings valuation uses bigint and does not invent an unpriced total", () => {
  const quotes = LocalTestPythQuotes.quotes();
  const snapshot = BasketValuation.valueHoldings([
    {
      mint: "funding",
      symbol: "USDCt",
      amount: 25_000_000n,
      decimals: 6,
      feedId: PythFeeds.USDC_USD.id,
    },
    {
      mint: "alpha",
      symbol: "ALPHAt",
      amount: 2_000_000n,
      decimals: 6,
      feedId: PythFeeds.AAPL_USD.id,
    },
  ], quotes);
  assert.equal(snapshot.complete, true);
  assert.equal(snapshot.pricedUsdAtoms, 225_000_000n);
  assert.equal(BasketValuation.headline(snapshot), "$225");
  assert.equal(BasketValuation.sourceLabel(snapshot), "Pyth local test");
  assert.equal(BasketValuation.formatUnitPrice(snapshot.holdings[1]!.quote!), "$100");
});

test("missing feed stays Not priced instead of filling fixture dollars", () => {
  const snapshot = BasketValuation.valueHoldings([
    {
      mint: "unknown",
      symbol: "UNKN",
      amount: 1_000_000n,
      decimals: 6,
      feedId: null,
    },
    {
      mint: "funding",
      symbol: "USDCt",
      amount: 10_000_000n,
      decimals: 6,
      feedId: PythFeeds.USDC_USD.id,
    },
  ], LocalTestPythQuotes.quotes());
  assert.equal(snapshot.complete, false);
  assert.equal(snapshot.pricedUsdAtoms, 10_000_000n);
  assert.equal(BasketValuation.headline(snapshot), "Partial $10");
  assert.equal(snapshot.holdings[0]?.status, "not-priced");
});

test("empty holdings and fully unpriced baskets stay honest", () => {
  assert.equal(BasketValuation.headline(BasketValuation.valueHoldings([], [])), "--");
  const unpriced = BasketValuation.valueHoldings([
    { mint: "x", symbol: "X", amount: 1n, decimals: 6, feedId: null },
  ], []);
  assert.equal(BasketValuation.headline(unpriced), "Not priced");
});

test("Hermes client builds the documented latest-price URL", () => {
  const url = HermesPriceClient.latestUrl(
    [PythFeeds.USDC_USD.id],
    "https://hermes.pyth.network",
  );
  assert.equal(url.includes("/v2/updates/price/latest"), true);
  assert.equal(url.includes(`ids%5B%5D=0x${PythFeeds.USDC_USD.id}`), true);
  assert.equal(url.includes("parsed=true"), true);
});

test("quote service uses Hermes when it returns a parsed set", async () => {
  const set = await PythQuoteService.latest([PythFeeds.USDC_USD.id], {
    source: "auto",
    hermesUrl: "https://hermes.pyth.network",
    accessToken: "test-token",
    fetchImpl: async (input, init) => {
      assert.equal(String(input).startsWith("https://hermes.pyth.network/v2/updates/price/latest"), true);
      assert.equal((init as RequestInit).headers instanceof Headers, true);
      assert.equal(((init as RequestInit).headers as Headers).get("Authorization"), "Bearer test-token");
      return new Response(JSON.stringify({
        parsed: [{
          id: PythFeeds.USDC_USD.id,
          price: { price: "100000000", conf: "10", expo: -8, publish_time: 1_714_746_101 },
        }],
      }), { status: 200 });
    },
  });
  assert.equal(set.source, "hermes");
  assert.equal(set.quotes[0]?.source, "hermes");
  assert.equal(set.error, null);
});

test("auto mode falls back to labeled local-test quotes when Hermes is unauthorized", async () => {
  const set = await PythQuoteService.latest([PythFeeds.AAPL_USD.id], {
    source: "auto",
    fetchImpl: async () => new Response("unauthorized", { status: 401 }),
  });
  assert.equal(set.source, "local-test");
  assert.equal(set.quotes[0]?.source, "local-test");
  assert.match(set.error ?? "", /Hermes unavailable/);
  assert.equal(BasketValuation.formatUnitPrice(set.quotes[0]!), "$100");
});

test("hermes-only mode does not invent quotes after a fetch failure", async () => {
  const set = await PythQuoteService.latest([PythFeeds.USDC_USD.id], {
    source: "hermes",
    fetchImpl: async () => new Response("unauthorized", { status: 401 }),
  });
  assert.equal(set.source, "hermes");
  assert.equal(set.quotes.length, 0);
  assert.equal(set.error?.includes("401"), true);
});

test("browser quote client deserializes the local app payload", async () => {
  const local = PythQuoteService.serialize({
    source: "local-test",
    hermesUrl: null,
    quotes: LocalTestPythQuotes.quotes([PythFeeds.USDC_USD.id]),
    error: null,
  });
  const set = await PythQuoteClient.latest([PythFeeds.USDC_USD.id], async (input) => {
    assert.equal(String(input).startsWith("/api/pyth/latest?"), true);
    return new Response(JSON.stringify(local), { status: 200 });
  });
  assert.equal(set.source, "local-test");
  assert.equal(set.quotes[0]?.price, 100_000_000n);
});
