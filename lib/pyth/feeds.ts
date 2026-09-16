/** Official Pyth Core feed IDs, looked up from Hermes `/v2/price_feeds`. */

export interface PythFeed {
  /** 64-char lowercase hex, no 0x prefix. */
  id: string;
  pythSymbol: string;
  displaySymbol: string;
  assetType: "Crypto" | "Equity";
}

export class PythFeeds {
  static readonly USDC_USD: PythFeed = {
    id: "eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
    pythSymbol: "Crypto.USDC/USD",
    displaySymbol: "USDC",
    assetType: "Crypto",
  };

  static readonly AAPL_USD: PythFeed = {
    id: "49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688",
    pythSymbol: "Equity.US.AAPL/USD",
    displaySymbol: "AAPL",
    assetType: "Equity",
  };

  static readonly MSFT_USD: PythFeed = {
    id: "d0ca23c1cc005e004ccf1db5bf76aeb6a49218f43dac3d4b275e92de12ded4d1",
    pythSymbol: "Equity.US.MSFT/USD",
    displaySymbol: "MSFT",
    assetType: "Equity",
  };

  static readonly GOOGL_USD: PythFeed = {
    id: "5a48c03e9b9cb337801073ed9d166817473697efff0d138874e0f6a33d6d5aa6",
    pythSymbol: "Equity.US.GOOGL/USD",
    displaySymbol: "GOOGL",
    assetType: "Equity",
  };

  static all(): PythFeed[] {
    return [
      PythFeeds.USDC_USD,
      PythFeeds.AAPL_USD,
      PythFeeds.MSFT_USD,
      PythFeeds.GOOGL_USD,
    ];
  }

  static byId(id: string): PythFeed | null {
    const normalized = PythFeeds.normalizeId(id);
    return PythFeeds.all().find((feed) => feed.id === normalized) ?? null;
  }

  static normalizeId(id: string): string {
    const hex = id.startsWith("0x") || id.startsWith("0X") ? id.slice(2) : id;
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
      throw new Error("Pyth feed ID must be 32-byte hex");
    }
    return hex.toLowerCase();
  }

  static queryId(id: string): string {
    return `0x${PythFeeds.normalizeId(id)}`;
  }
}
