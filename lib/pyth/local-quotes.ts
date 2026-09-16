import { PythFeeds } from "./feeds.ts";
import {
  PythQuoteCodec,
  type HermesParsedFeed,
  type PythQuote,
} from "./quote.ts";

/**
 * Round hermetic quotes in the Hermes parsed-price shape.
 * These are local-test numbers, not live marks.
 *
 * USDCt / USDC → $1, ALPHAt / AAPL → $100, BEACONt / MSFT → $200,
 * CEDARt / GOOGL → $50, each with expo -8.
 */
export class LocalTestPythQuotes {
  static readonly PUBLISH_TIME = 1_714_746_101;
  static readonly EXPO = -8;

  static hermesParsedFeeds(): HermesParsedFeed[] {
    return [
      localFeed(PythFeeds.USDC_USD.id, 100_000_000n),
      localFeed(PythFeeds.AAPL_USD.id, 10_000_000_000n),
      localFeed(PythFeeds.MSFT_USD.id, 20_000_000_000n),
      localFeed(PythFeeds.GOOGL_USD.id, 5_000_000_000n),
    ];
  }

  static quotes(feedIds: readonly string[] = PythFeeds.all().map((feed) => feed.id)): PythQuote[] {
    const wanted = new Set(feedIds.map((id) => PythFeeds.normalizeId(id)));
    return LocalTestPythQuotes.hermesParsedFeeds()
      .filter((feed) => wanted.has(feed.id))
      .map((feed) => PythQuoteCodec.fromHermesFeed(feed, "local-test"));
  }
}

function localFeed(id: string, price: bigint): HermesParsedFeed {
  return {
    id,
    price: {
      price: price.toString(),
      conf: "1",
      expo: LocalTestPythQuotes.EXPO,
      publish_time: LocalTestPythQuotes.PUBLISH_TIME,
    },
    ema_price: {
      price: price.toString(),
      conf: "1",
      expo: LocalTestPythQuotes.EXPO,
      publish_time: LocalTestPythQuotes.PUBLISH_TIME,
    },
  };
}
