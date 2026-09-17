import { PublicKey } from "@solana/web3.js";

/** Documented Swap API V2 / Tokens API V2 host. */
export const JUPITER_API_BASE = "https://api.jup.ag";

/** Jupiter Swap aggregator v6, returned as `swapInstruction.programId` on `/swap/v2/build`. */
export const JUPITER_V6_PROGRAM_ID = new PublicKey(
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
);

export const JUPITER_TOKENS_TAG_PATH = "/tokens/v2/tag";
export const JUPITER_TOKENS_SEARCH_PATH = "/tokens/v2/search";
export const JUPITER_SWAP_BUILD_PATH = "/swap/v2/build";

/** Documented tag for tokenized equities. The live API may still reject it. */
export const JUPITER_STOCKS_TAG = "stocks";

/**
 * Search strings taken from Jupiter's own xStock product naming.
 * These are queries, not mint allowlists; mints come from the response.
 */
export const JUPITER_STOCK_SEARCH_QUERIES = [
  "xStock",
  "Index xStock",
  "SP500 xStock",
  "Nasdaq xStock",
] as const;

export const BACKPACK_MARKETS_URL = "https://api.backpack.exchange/api/v1/markets";

export const JUPITER_MAX_ROUTE_ACCOUNTS = 32;
export const JUPITER_MAX_INSTRUCTION_DATA = 1232;
export const JUPITER_DEFAULT_SLIPPAGE_BPS = 50;
