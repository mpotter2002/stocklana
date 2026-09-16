import { PythFeeds } from "./feeds.ts";
import { PythQuoteCodec, type PythQuote } from "./quote.ts";

export const DEFAULT_HERMES_URL = "https://hermes.pyth.network";

export interface HermesFetchOptions {
  baseUrl?: string;
  accessToken?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class HermesPriceClient {
  static latestUrl(feedIds: readonly string[], baseUrl = DEFAULT_HERMES_URL): string {
    const root = baseUrl.replace(/\/+$/, "");
    const params = new URLSearchParams();
    for (const id of feedIds) {
      params.append("ids[]", PythFeeds.queryId(id));
    }
    params.set("parsed", "true");
    return `${root}/v2/updates/price/latest?${params.toString()}`;
  }

  static async fetchLatest(
    feedIds: readonly string[],
    options: HermesFetchOptions = {},
  ): Promise<PythQuote[]> {
    if (feedIds.length === 0) return [];
    const baseUrl = options.baseUrl ?? DEFAULT_HERMES_URL;
    const timeoutMs = options.timeoutMs ?? 2_500;
    const fetchImpl = options.fetchImpl ?? fetch;
    const headers = new Headers({ Accept: "application/json" });
    if (options.accessToken) {
      headers.set("Authorization", `Bearer ${options.accessToken}`);
    }
    const response = await withTimeout(
      fetchImpl(HermesPriceClient.latestUrl(feedIds, baseUrl), {
        headers,
        cache: "no-store",
      }),
      timeoutMs,
    );
    if (!response.ok) {
      throw new Error(`Hermes latest-price request failed (${response.status})`);
    }
    const body: unknown = await response.json();
    return PythQuoteCodec.parseHermesBody(body, "hermes");
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error("Hermes request timed out")), timeoutMs);
  });
  try {
    return await Promise.race([promise, expired]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
