import { PythFeeds } from "./feeds.ts";
import { DEFAULT_HERMES_URL, HermesPriceClient } from "./hermes.ts";
import { LocalTestPythQuotes } from "./local-quotes.ts";
import { PythQuoteCodec, type PythQuote, type SerializedPythQuote } from "./quote.ts";

export type PythSourceMode = "auto" | "hermes" | "local-test";

export interface PythQuoteSet {
  source: "hermes" | "local-test";
  hermesUrl: string | null;
  quotes: PythQuote[];
  error: string | null;
}

export interface SerializedPythQuoteSet {
  source: "hermes" | "local-test";
  hermesUrl: string | null;
  quotes: SerializedPythQuote[];
  error: string | null;
}

export interface PythQuoteServiceOptions {
  source?: PythSourceMode;
  hermesUrl?: string;
  accessToken?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class PythQuoteService {
  static modeFromEnv(
    source = process.env.STOCKLANA_PYTH_SOURCE,
  ): PythSourceMode {
    if (source === "hermes" || source === "local-test" || source === "auto") {
      return source;
    }
    return "auto";
  }

  static async latest(
    feedIds: readonly string[],
    options: PythQuoteServiceOptions = {},
  ): Promise<PythQuoteSet> {
    const ids = [...new Set(feedIds.map((id) => PythFeeds.normalizeId(id)))];
    const mode = options.source ?? "auto";
    if (ids.length === 0) {
      return { source: "local-test", hermesUrl: null, quotes: [], error: null };
    }
    if (mode === "local-test") {
      return {
        source: "local-test",
        hermesUrl: null,
        quotes: LocalTestPythQuotes.quotes(ids),
        error: null,
      };
    }

    const hermesUrl = options.hermesUrl ?? DEFAULT_HERMES_URL;
    try {
      const quotes = await HermesPriceClient.fetchLatest(ids, {
        baseUrl: hermesUrl,
        ...(options.accessToken ? { accessToken: options.accessToken } : {}),
        ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
      });
      const wanted = new Set(ids);
      const filtered = quotes.filter((quote) => wanted.has(quote.feedId));
      return {
        source: "hermes",
        hermesUrl,
        quotes: filtered,
        error: filtered.length === ids.length
          ? null
          : "Hermes returned an incomplete parsed set; missing feeds stay not priced",
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Hermes request failed";
      if (mode === "hermes") {
        return {
          source: "hermes",
          hermesUrl,
          quotes: [],
          error: detail,
        };
      }
      return {
        source: "local-test",
        hermesUrl,
        quotes: LocalTestPythQuotes.quotes(ids),
        error: `Hermes unavailable (${detail}); using labeled local-test quotes`,
      };
    }
  }

  static serialize(set: PythQuoteSet): SerializedPythQuoteSet {
    return {
      source: set.source,
      hermesUrl: set.hermesUrl,
      quotes: set.quotes.map((quote) => PythQuoteCodec.serialize(quote)),
      error: set.error,
    };
  }

  static deserialize(set: SerializedPythQuoteSet): PythQuoteSet {
    if (set.source !== "hermes" && set.source !== "local-test") {
      throw new Error("Quote set source must be hermes or local-test");
    }
    return {
      source: set.source,
      hermesUrl: set.hermesUrl,
      quotes: set.quotes.map((quote) => PythQuoteCodec.deserialize(quote)),
      error: set.error,
    };
  }
}
