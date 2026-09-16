export const U64_MAX = (1n << 64n) - 1n;

export function assertRawAmount(amount: bigint): void {
  if (amount < 0n || amount > U64_MAX) {
    throw new RangeError("Token amount must fit an unsigned 64-bit integer");
  }
}

function assertDecimals(decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new RangeError("Supported decimals are integers from 0 to 18");
  }
}

export function parseAmount(text: string, decimals: number): bigint {
  assertDecimals(decimals);
  if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(text)) {
    throw new Error("Enter a nonnegative decimal amount without separators");
  }
  const [whole = "0", fraction = ""] = text.split(".");
  if (fraction.length > decimals) {
    throw new RangeError("Amount exceeds mint precision");
  }
  const raw = BigInt(whole) * 10n ** BigInt(decimals)
    + BigInt(fraction.padEnd(decimals, "0") || "0");
  assertRawAmount(raw);
  return raw;
}

export function formatAmount(raw: bigint, decimals: number): string {
  assertDecimals(decimals);
  assertRawAmount(raw);
  if (decimals === 0) return raw.toString();
  const padded = raw.toString().padStart(decimals + 1, "0");
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return padded.slice(0, -decimals) + (fraction ? `.${fraction}` : "");
}
