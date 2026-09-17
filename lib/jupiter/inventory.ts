import { PublicKey } from "@solana/web3.js";
import {
  JUPITER_API_BASE,
  JUPITER_STOCKS_TAG,
  JUPITER_STOCK_SEARCH_QUERIES,
  JUPITER_TOKENS_SEARCH_PATH,
  JUPITER_TOKENS_TAG_PATH,
} from "./constants.ts";
import { JupiterHttp, type JupiterFetch } from "./http.ts";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "../solana/token-accounts.ts";

export type JupiterAssetKind = "xstock" | "index";

export interface JupiterMintRecord {
  id: string;
  name: string;
  symbol: string;
  decimals: number;
  tokenProgram: string;
  tags: string[];
  isVerified: boolean | null;
}

export interface JupiterListedAsset {
  mint: PublicKey;
  symbol: string;
  name: string;
  decimals: number;
  tokenProgram: PublicKey;
  tags: string[];
  kind: JupiterAssetKind;
  verified: boolean | null;
  source: "jupiter";
}

export interface JupiterFundingMint {
  mint: PublicKey;
  symbol: string;
  name: string;
  decimals: number;
  tokenProgram: PublicKey;
  tags: string[];
  source: "jupiter";
}

export class JupiterInventory {
  static parseMint(raw: unknown): JupiterMintRecord | null {
    if (!raw || typeof raw !== "object") return null;
    const row = raw as Record<string, unknown>;
    if (
      typeof row.id !== "string"
      || typeof row.name !== "string"
      || typeof row.symbol !== "string"
      || typeof row.tokenProgram !== "string"
      || typeof row.decimals !== "number"
      || !Number.isInteger(row.decimals)
      || row.decimals < 0
      || row.decimals > 18
    ) {
      return null;
    }
    try {
      new PublicKey(row.id);
      const program = new PublicKey(row.tokenProgram);
      if (!program.equals(TOKEN_PROGRAM_ID) && !program.equals(TOKEN_2022_PROGRAM_ID)) {
        return null;
      }
    } catch {
      return null;
    }
    const tags = Array.isArray(row.tags)
      ? row.tags.filter((tag): tag is string => typeof tag === "string")
      : [];
    return {
      id: row.id,
      name: row.name,
      symbol: row.symbol,
      decimals: row.decimals,
      tokenProgram: row.tokenProgram,
      tags,
      isVerified: typeof row.isVerified === "boolean" ? row.isVerified : null,
    };
  }

  static isStockTagged(record: JupiterMintRecord): boolean {
    return record.tags.includes("xstocks") || record.tags.includes("stocks");
  }

  static kindFromMetadata(name: string, symbol: string): JupiterAssetKind {
    const haystack = `${symbol} ${name}`.toLowerCase();
    if (/(sp500|s&p|nasdaq|index|etf|\bdow\b|russell)/i.test(haystack)) {
      return "index";
    }
    return "xstock";
  }

  static toListedAsset(record: JupiterMintRecord): JupiterListedAsset {
    return {
      mint: new PublicKey(record.id),
      symbol: record.symbol,
      name: record.name,
      decimals: record.decimals,
      tokenProgram: new PublicKey(record.tokenProgram),
      tags: record.tags,
      kind: JupiterInventory.kindFromMetadata(record.name, record.symbol),
      verified: record.isVerified,
      source: "jupiter",
    };
  }

  static selectStockInventory(raw: unknown): JupiterListedAsset[] {
    if (!Array.isArray(raw)) {
      throw new Error("Jupiter token list must be an array");
    }
    const listed: JupiterListedAsset[] = [];
    const seen = new Set<string>();
    for (const entry of raw) {
      const parsed = JupiterInventory.parseMint(entry);
      if (!parsed || !JupiterInventory.isStockTagged(parsed) || seen.has(parsed.id)) {
        continue;
      }
      seen.add(parsed.id);
      listed.push(JupiterInventory.toListedAsset(parsed));
    }
    listed.sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === "index" ? -1 : 1;
      return left.symbol.localeCompare(right.symbol);
    });
    return listed;
  }

  static selectVerifiedUsdc(raw: unknown): JupiterFundingMint | null {
    if (!Array.isArray(raw)) return null;
    for (const entry of raw) {
      const parsed = JupiterInventory.parseMint(entry);
      if (!parsed) continue;
      if (parsed.symbol !== "USDC" || parsed.name !== "USD Coin") continue;
      if (parsed.isVerified !== true) continue;
      if (!parsed.tags.includes("verified") && !parsed.tags.includes("stable")) continue;
      return {
        mint: new PublicKey(parsed.id),
        symbol: parsed.symbol,
        name: parsed.name,
        decimals: parsed.decimals,
        tokenProgram: new PublicKey(parsed.tokenProgram),
        tags: parsed.tags,
        source: "jupiter",
      };
    }
    return null;
  }

  static tagUrl(base = JUPITER_API_BASE): string {
    const params = new URLSearchParams({ query: JUPITER_STOCKS_TAG });
    return JupiterHttp.join(base, JUPITER_TOKENS_TAG_PATH, params);
  }

  static searchUrl(query: string, base = JUPITER_API_BASE): string {
    const params = new URLSearchParams({ query });
    return JupiterHttp.join(base, JUPITER_TOKENS_SEARCH_PATH, params);
  }

  static isInvalidTagBody(body: unknown): boolean {
    if (!body || typeof body !== "object") return false;
    const row = body as Record<string, unknown>;
    const message = typeof row.message === "string" ? row.message : "";
    const error = typeof row.error === "string" ? row.error : "";
    return /invalid tag/i.test(message) || /invalid tag/i.test(error);
  }

  static async load(options: {
    fetchImpl?: JupiterFetch;
    apiBase?: string;
    apiKey?: string;
  } = {}): Promise<{
    assets: JupiterListedAsset[];
    funding: JupiterFundingMint | null;
    usedSearchFallback: boolean;
  }> {
    const fetchImpl = options.fetchImpl ?? fetch;
    const apiBase = options.apiBase ?? JUPITER_API_BASE;
    const tagged = await JupiterHttp.readJson(
      fetchImpl,
      JupiterInventory.tagUrl(apiBase),
      options.apiKey,
    );
    let records: unknown[] = [];
    let usedSearchFallback = false;
    if (tagged.status === 200 && Array.isArray(tagged.body)) {
      records = tagged.body;
    } else {
      usedSearchFallback = true;
      const batches = await Promise.all(
        JUPITER_STOCK_SEARCH_QUERIES.map((query) =>
          JupiterHttp.readJson(
            fetchImpl,
            JupiterInventory.searchUrl(query, apiBase),
            options.apiKey,
          )
        ),
      );
      for (const batch of batches) {
        if (batch.status !== 200 || !Array.isArray(batch.body)) {
          throw new Error(
            `Jupiter stocks tag failed with HTTP ${tagged.status}; search fallback failed with HTTP ${batch.status}`,
          );
        }
        records.push(...batch.body);
      }
    }

    const usdc = await JupiterHttp.readJson(
      fetchImpl,
      JupiterInventory.searchUrl("USDC", apiBase),
      options.apiKey,
    );
    const funding = usdc.status === 200
      ? JupiterInventory.selectVerifiedUsdc(usdc.body)
      : null;

    return {
      assets: JupiterInventory.selectStockInventory(records),
      funding,
      usedSearchFallback,
    };
  }
}
