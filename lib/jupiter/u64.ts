import { MAX_U64 } from "../solana/basket-client.ts";

export class JupiterU64 {
  static parse(value: string, label: string): bigint {
    if (typeof value !== "string" || !/^[0-9]+$/.test(value)) {
      throw new Error(`${label} must be an unsigned decimal integer string`);
    }
    const parsed = BigInt(value);
    if (parsed > MAX_U64) {
      throw new RangeError(`${label} exceeds the u64 range`);
    }
    return parsed;
  }

  static parseOptional(value: unknown, label: string): bigint | null {
    if (value === null || value === undefined) return null;
    if (typeof value !== "string") {
      throw new Error(`${label} must be an unsigned decimal integer string`);
    }
    return JupiterU64.parse(value, label);
  }
}
