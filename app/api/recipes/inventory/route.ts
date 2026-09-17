import { RecipeCatalog } from "../../../../lib/recipes/catalog.ts";
import { PRESTOCKS_API_URL } from "../../../../lib/recipes/constants.ts";
import { RecipeJson } from "../../../../lib/recipes/json.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const snapshot = await RecipeCatalog.load({
    source: RecipeCatalog.modeFromEnv(),
    prestocksUrl: process.env.PRESTOCKS_API_URL ?? PRESTOCKS_API_URL,
  });
  return Response.json(RecipeJson.snapshot(snapshot), {
    headers: { "Cache-Control": "no-store" },
  });
}
