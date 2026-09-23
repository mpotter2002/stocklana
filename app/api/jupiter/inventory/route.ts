import { JupiterInventoryCache } from "../../../../lib/jupiter/cache.ts";
import { JupiterCatalog } from "../../../../lib/jupiter/catalog.ts";
import { JUPITER_API_BASE } from "../../../../lib/jupiter/constants.ts";
import { JupiterJson } from "../../../../lib/jupiter/json.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function inventorySource(): "auto" | "jupiter" | "backpack" {
  const sourceEnv = process.env.STOCKLANA_INVENTORY_SOURCE;
  return sourceEnv === "jupiter" || sourceEnv === "backpack" || sourceEnv === "auto" ? sourceEnv : "auto";
}

// One cache per server process: repeat page loads reuse the last real Jupiter answer
// instead of re-running the keyless search fan-out that trips Jupiter's 429.
const inventoryCache = new JupiterInventoryCache({
  load: () => JupiterCatalog.load({
    apiBase: process.env.JUPITER_API_BASE ?? JUPITER_API_BASE,
    source: inventorySource(),
    ...(process.env.JUPITER_API_KEY ? { apiKey: process.env.JUPITER_API_KEY } : {}),
  }),
});

export async function GET(): Promise<Response> {
  const { snapshot, cache } = await inventoryCache.get();
  return Response.json({ ...JupiterJson.catalog(snapshot), cache }, {
    headers: {
      "Cache-Control": "no-store",
      "X-Inventory-Cache": cache.status,
      "X-Inventory-Age": String(cache.ageSeconds),
    },
  });
}
