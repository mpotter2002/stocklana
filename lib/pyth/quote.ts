import { PythFeeds } from "./feeds.ts";

export type PythQuoteSource = "hermes" | "local-test";

export interface PythQuote {
  feedId: string;
  pythSymbol: string;
  displaySymbol: string;
  price: bigint;
  conf: bigint;
  expo: number;
  publishTime: number;
  source: PythQuoteSource;
}

export interface SerializedPythQuote {
  feedId: string;
  pythSymbol: string;
  displaySymbol: string;
  price: string;
  conf: string;
  expo: number;
  publishTime: number;
  source: PythQuoteSource;
}

export interface HermesParsedPrice {
  price: string;
  conf: string;
  expo: number;
  publish_time: number;
}

export interface HermesParsedFeed {
  id: string;
  price: HermesParsedPrice;
  ema_price?: HermesParsedPrice;
  metadata?: {
    slot?: number;
    proof_available_time?: number;
    prev_publish_time?: number;
  };
}

export interface HermesLatestPriceResponse {
  parsed?: HermesParsedFeed[];
  binary?: {
    encoding?: string;
    data?: string[];
  };
}

export class PythQuoteCodec {
  static fromHermesFeed(
    feed: HermesParsedFeed,
    source: PythQuoteSource,
  ): PythQuote {
    if (!feed || typeof feed !== "object") {
      throw new Error("Hermes parsed feed is missing");
    }
    const feedId = PythFeeds.normalizeId(feed.id);
    const known = PythFeeds.byId(feedId);
    const spot = feed.price;
    if (!spot || typeof spot !== "object") {
      throw new Error("Hermes parsed feed is missing price");
    }
    if (!Number.isInteger(spot.expo) || spot.expo < -18 || spot.expo > 18) {
      throw new Error("Hermes price exponent is outside the supported range");
    }
    if (!Number.isInteger(spot.publish_time) || spot.publish_time <= 0) {
      throw new Error("Hermes publish time is missing");
    }
    const price = parseSignedInteger(spot.price, "price");
    const conf = parseUnsignedInteger(spot.conf, "conf");
    if (price <= 0n) {
      throw new Error("Hermes price must be positive");
    }
    return {
      feedId,
      pythSymbol: known?.pythSymbol ?? `pyth:${feedId}`,
      displaySymbol: known?.displaySymbol ?? feedId.slice(0, 8),
      price,
      conf,
      expo: spot.expo,
      publishTime: spot.publish_time,
      source,
    };
  }

  static parseHermesBody(body: unknown, source: PythQuoteSource): PythQuote[] {
    if (!body || typeof body !== "object") {
      throw new Error("Hermes response is not an object");
    }
    const parsed = (body as HermesLatestPriceResponse).parsed;
    if (!Array.isArray(parsed)) {
      throw new Error("Hermes response is missing parsed price updates");
    }
    return parsed.map((feed) => PythQuoteCodec.fromHermesFeed(feed, source));
  }

  static serialize(quote: PythQuote): SerializedPythQuote {
    return {
      feedId: quote.feedId,
      pythSymbol: quote.pythSymbol,
      displaySymbol: quote.displaySymbol,
      price: quote.price.toString(),
      conf: quote.conf.toString(),
      expo: quote.expo,
      publishTime: quote.publishTime,
      source: quote.source,
    };
  }

  static deserialize(row: SerializedPythQuote): PythQuote {
    if (row.source !== "hermes" && row.source !== "local-test") {
      throw new Error("Quote source must be hermes or local-test");
    }
    return PythQuoteCodec.fromHermesFeed({
      id: row.feedId,
      price: {
        price: row.price,
        conf: row.conf,
        expo: row.expo,
        publish_time: row.publishTime,
      },
    }, row.source);
  }
}

function parseSignedInteger(value: string, label: string): bigint {
  if (typeof value !== "string" || !/^-?[0-9]+$/.test(value)) {
    throw new Error(`Hermes ${label} is not an integer string`);
  }
  return BigInt(value);
}

function parseUnsignedInteger(value: string, label: string): bigint {
  const parsed = parseSignedInteger(value, label);
  if (parsed < 0n) {
    throw new Error(`Hermes ${label} must be nonnegative`);
  }
  return parsed;
}
