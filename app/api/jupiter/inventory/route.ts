import { JupiterCatalog } from "../../../../lib/jupiter/catalog.ts";
import { JUPITER_API_BASE } from "../../../../lib/jupiter/constants.ts";
import { JupiterJson } from "../../../../lib/jupiter/json.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const sourceEnv = process.env.STOCKLANA_INVENTORY_SOURCE;
  const source = sourceEnv === "jupiter" || sourceEnv === "backpack" || sourceEnv === "auto"
    ? sourceEnv
    : "auto";
  const snapshot = await JupiterCatalog.load({
    apiBase: process.env.JUPITER_API_BASE ?? JUPITER_API_BASE,
    source,
    ...(process.env.JUPITER_API_KEY ? { apiKey: process.env.JUPITER_API_KEY } : {}),
  });
  return Response.json(JupiterJson.catalog(snapshot), {
    headers: { "Cache-Control": "no-store" },
  });
}
