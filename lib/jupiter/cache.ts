import type { JupiterInventorySnapshot } from "./catalog.ts";

export type InventoryCacheStatus = "miss" | "hit" | "stale";

export interface CachedInventory {
  snapshot: JupiterInventorySnapshot;
  cache: {
    status: InventoryCacheStatus;
    /** When the served Jupiter inventory was actually fetched (epoch ms). */
    fetchedAt: number;
    ageSeconds: number;
  };
}

interface Entry {
  snapshot: JupiterInventorySnapshot;
  fetchedAt: number;
}

/**
 * Process-local cache for the Jupiter xStock inventory.
 *
 * Without a JUPITER_API_KEY the search fallback fans out several requests per page load
 * and hits Jupiter's 429 quickly. This keeps the last real Jupiter answer:
 * - fresh window: serve it without calling Jupiter;
 * - after that, refetch; if Jupiter is blocked, serve the last real inventory
 *   labeled stale with its age (never past the stale limit);
 * - fallbacks and empty lists are never cached, so the next request retries Jupiter.
 * Only responses Jupiter actually returned are ever stored. Nothing is synthesized.
 */
export class JupiterInventoryCache {
  static readonly FRESH_MS = 5 * 60_000;
  static readonly STALE_MS = 60 * 60_000;

  private entry: Entry | null = null;
  private inflight: Promise<CachedInventory> | null = null;
  private readonly load: () => Promise<JupiterInventorySnapshot>;
  private readonly now: () => number;
  private readonly freshMs: number;
  private readonly staleMs: number;

  constructor(options: {
    load: () => Promise<JupiterInventorySnapshot>;
    now?: () => number;
    freshMs?: number;
    staleMs?: number;
  }) {
    this.load = options.load;
    this.now = options.now ?? Date.now;
    this.freshMs = options.freshMs ?? JupiterInventoryCache.FRESH_MS;
    this.staleMs = options.staleMs ?? JupiterInventoryCache.STALE_MS;
  }

  static cacheable(snapshot: JupiterInventorySnapshot): boolean {
    return snapshot.source === "jupiter" && snapshot.assets.length > 0;
  }

  async get(): Promise<CachedInventory> {
    const entry = this.entry;
    if (entry && this.now() - entry.fetchedAt < this.freshMs) {
      return this.wrap(entry.snapshot, "hit", entry.fetchedAt);
    }
    if (!this.inflight) {
      this.inflight = this.refresh().finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  private async refresh(): Promise<CachedInventory> {
    let loaded: JupiterInventorySnapshot | null = null;
    let failure: string;
    try {
      loaded = await this.load();
      if (JupiterInventoryCache.cacheable(loaded)) {
        const fetchedAt = this.now();
        this.entry = { snapshot: loaded, fetchedAt };
        return this.wrap(loaded, "miss", fetchedAt);
      }
      failure = loaded.detail;
    } catch (error) {
      failure = error instanceof Error ? error.message : "Jupiter inventory failed";
      if (!this.usableStale()) throw error;
    }
    const stale = this.usableStale();
    if (stale) {
      const minutes = Math.round((this.now() - stale.fetchedAt) / 60_000);
      const snapshot: JupiterInventorySnapshot = {
        ...stale.snapshot,
        detail: `Serving cached Jupiter inventory from ${minutes} min ago; the latest refresh failed: ${failure}`,
      };
      return this.wrap(snapshot, "stale", stale.fetchedAt);
    }
    return this.wrap(loaded as JupiterInventorySnapshot, "miss", this.now());
  }

  private usableStale(): Entry | null {
    const entry = this.entry;
    return entry && this.now() - entry.fetchedAt <= this.staleMs ? entry : null;
  }

  private wrap(snapshot: JupiterInventorySnapshot, status: InventoryCacheStatus, fetchedAt: number): CachedInventory {
    return {
      snapshot,
      cache: { status, fetchedAt, ageSeconds: Math.round((this.now() - fetchedAt) / 1000) },
    };
  }
}
