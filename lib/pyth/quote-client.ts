import { PythQuoteService, type PythQuoteSet } from "./quote-service.ts";

export class PythQuoteClient {
  static async latest(
    feedIds: readonly string[],
    fetchImpl: typeof fetch = fetch,
  ): Promise<PythQuoteSet> {
    const params = new URLSearchParams();
    for (const id of feedIds) {
      params.append("ids[]", id);
    }
    const response = await fetchImpl(`/api/pyth/latest?${params.toString()}`, {
      cache: "no-store",
    });
    const body: unknown = await response.json();
    if (!response.ok) {
      const message = errorMessage(body) ?? `Pyth quote request failed (${response.status})`;
      throw new Error(message);
    }
    return PythQuoteService.deserialize(asSerializedSet(body));
  }
}

function errorMessage(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("error" in body)) return null;
  const error = (body as { error: unknown }).error;
  return typeof error === "string" && error.length > 0 ? error : null;
}

function asSerializedSet(body: unknown): Parameters<typeof PythQuoteService.deserialize>[0] {
  if (!body || typeof body !== "object") {
    throw new Error("Pyth quote response is not an object");
  }
  return body as Parameters<typeof PythQuoteService.deserialize>[0];
}
