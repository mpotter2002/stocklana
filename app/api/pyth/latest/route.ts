import { PythQuoteService } from "../../../../lib/pyth/quote-service.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const feedIds = [...searchParams.getAll("ids[]"), ...searchParams.getAll("ids")];
  try {
    const set = await PythQuoteService.latest(feedIds, {
      source: PythQuoteService.modeFromEnv(),
      ...(process.env.PYTH_HERMES_URL ? { hermesUrl: process.env.PYTH_HERMES_URL } : {}),
      ...(process.env.PYTH_API_KEY ? { accessToken: process.env.PYTH_API_KEY } : {}),
    });
    return Response.json(PythQuoteService.serialize(set), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Pyth quote request failed";
    return Response.json({ error: detail }, {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
