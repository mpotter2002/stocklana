import { JupiterU64 } from "../../../../lib/jupiter/u64.ts";
import { JUPITER_API_BASE } from "../../../../lib/jupiter/constants.ts";
import { JupiterJson } from "../../../../lib/jupiter/json.ts";
import { JupiterRouter } from "../../../../lib/jupiter/router.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const inputMint = required(url, "inputMint");
    const outputMint = required(url, "outputMint");
    const amount = required(url, "amount");
    const taker = required(url, "taker");
    const destination = url.searchParams.get("destinationTokenAccount");
    const build = await JupiterRouter.build({
      inputMint: JupiterJson.publicKey(inputMint, "inputMint"),
      outputMint: JupiterJson.publicKey(outputMint, "outputMint"),
      amount: JupiterU64.parse(amount, "amount"),
      taker: JupiterJson.publicKey(taker, "taker"),
      ...(destination
        ? { destinationTokenAccount: JupiterJson.publicKey(destination, "destinationTokenAccount") }
        : {}),
    }, {
      apiBase: process.env.JUPITER_API_BASE ?? JUPITER_API_BASE,
      ...(process.env.JUPITER_API_KEY ? { apiKey: process.env.JUPITER_API_KEY } : {}),
    });
    return Response.json(JupiterJson.quote(build), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Jupiter /build failed";
    return Response.json({
      label: "jupiter-quote",
      notAFill: true,
      error: detail,
    }, {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

function required(url: URL, name: string): string {
  const value = url.searchParams.get(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}
