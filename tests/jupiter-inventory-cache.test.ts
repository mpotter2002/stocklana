import assert from "node:assert/strict";
import { test } from "node:test";
import { PublicKey } from "@solana/web3.js";
import type { JupiterInventorySnapshot } from "../lib/jupiter/catalog.ts";
import { JupiterInventoryCache } from "../lib/jupiter/cache.ts";

const AAPLX = new PublicKey("XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp");
const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

function live(count = 1): JupiterInventorySnapshot {
  return {
    source: "jupiter",
    catalogLabel: "live",
    usedSearchFallback: true,
    assets: Array.from({ length: count }, () => ({
      mint: AAPLX,
      symbol: "AAPLx",
      name: "Apple xStock",
      decimals: 8,
      tokenProgram: TOKEN_PROGRAM,
      tags: ["xstocks"],
      kind: "xstock" as const,
      verified: true,
      source: "jupiter" as const,
    })),
    funding: null,
    backpack: [],
    detail: "Jupiter /tokens/v2/tag?query=stocks",
  };
}

function rateLimited(): JupiterInventorySnapshot {
  return {
    source: "backpack-backup",
    catalogLabel: "blocked",
    usedSearchFallback: false,
    assets: [],
    funding: null,
    backpack: [],
    detail: "Jupiter path blocked (Jupiter stocks tag failed with HTTP 400; search fallback failed with HTTP 429).",
  };
}

function harness(results: Array<JupiterInventorySnapshot | Error>) {
  let clock = 1_000_000;
  let calls = 0;
  const cache = new JupiterInventoryCache({
    now: () => clock,
    freshMs: 5 * 60_000,
    staleMs: 60 * 60_000,
    load: async () => {
      const next = results[Math.min(calls, results.length - 1)];
      calls += 1;
      if (!next) throw new Error("harness has no scripted result");
      if (next instanceof Error) throw next;
      return next;
    },
  });
  return {
    cache,
    advance(ms: number) {
      clock += ms;
    },
    calls: () => calls,
  };
}

test("repeat page loads inside the fresh window reuse one Jupiter fetch", async () => {
  const h = harness([live(21)]);
  const first = await h.cache.get();
  h.advance(60_000);
  const second = await h.cache.get();
  assert.equal(h.calls(), 1);
  assert.equal(first.cache.status, "miss");
  assert.equal(second.cache.status, "hit");
  assert.equal(second.cache.ageSeconds, 60);
  assert.equal(second.snapshot.assets.length, 21);
});

test("concurrent requests share a single in-flight Jupiter load", async () => {
  const h = harness([live(3)]);
  const [a, b, c] = await Promise.all([h.cache.get(), h.cache.get(), h.cache.get()]);
  assert.equal(h.calls(), 1);
  assert.equal(a.snapshot.assets.length, 3);
  assert.equal(b.snapshot.assets.length, 3);
  assert.equal(c.snapshot.assets.length, 3);
});

test("after the fresh window it refetches from Jupiter", async () => {
  const h = harness([live(2), live(5)]);
  await h.cache.get();
  h.advance(5 * 60_000 + 1);
  const next = await h.cache.get();
  assert.equal(h.calls(), 2);
  assert.equal(next.cache.status, "miss");
  assert.equal(next.snapshot.assets.length, 5);
});

test("a 429 after a good load serves the last real Jupiter inventory, labeled stale with its age", async () => {
  const h = harness([live(21), rateLimited()]);
  await h.cache.get();
  h.advance(10 * 60_000);
  const next = await h.cache.get();
  assert.equal(next.cache.status, "stale");
  assert.equal(next.cache.ageSeconds, 600);
  assert.equal(next.snapshot.source, "jupiter");
  assert.equal(next.snapshot.assets.length, 21);
  assert.match(next.snapshot.detail, /cached Jupiter inventory from 10 min ago/i);
  assert.match(next.snapshot.detail, /HTTP 429/);
});

test("stale inventory is never served past the stale limit; the honest fallback is returned instead", async () => {
  const h = harness([live(21), rateLimited()]);
  await h.cache.get();
  h.advance(60 * 60_000 + 1);
  const next = await h.cache.get();
  assert.equal(next.cache.status, "miss");
  assert.equal(next.snapshot.source, "backpack-backup");
  assert.equal(next.snapshot.assets.length, 0);
});

test("fallback and empty results are never cached, so the next request retries Jupiter", async () => {
  const h = harness([rateLimited(), live(4)]);
  const first = await h.cache.get();
  assert.equal(first.snapshot.source, "backpack-backup");
  const second = await h.cache.get();
  assert.equal(h.calls(), 2);
  assert.equal(second.snapshot.assets.length, 4);
});

test("a thrown load with no cache rethrows; with a cache it serves stale", async () => {
  const empty = harness([new Error("socket hang up")]);
  await assert.rejects(() => empty.cache.get(), /socket hang up/);

  const warm = harness([live(2), new Error("socket hang up")]);
  await warm.cache.get();
  warm.advance(6 * 60_000);
  const next = await warm.cache.get();
  assert.equal(next.cache.status, "stale");
  assert.match(next.snapshot.detail, /socket hang up/);
});
