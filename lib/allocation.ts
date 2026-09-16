import { assertRawAmount } from "./amounts.ts";

export const BASIS_POINTS = 10_000;

export function equalWeights(count: number): number[] {
  if (!Number.isInteger(count) || count < 2 || count > 3) {
    throw new RangeError("Select two or three assets");
  }
  const floor = Math.floor(BASIS_POINTS / count);
  return Array.from({ length: count }, (_, index) =>
    floor + (index < BASIS_POINTS % count ? 1 : 0));
}

/** Pure arithmetic only: mint identity and allowlist checks belong elsewhere. */
export function allocate(raw: bigint, weights: readonly number[]): bigint[] {
  assertRawAmount(raw);
  if (
    weights.length < 2 || weights.length > 3
    || weights.some((weight) => !Number.isInteger(weight) || weight <= 0)
    || weights.reduce((sum, weight) => sum + weight, 0) !== BASIS_POINTS
  ) {
    throw new RangeError("Two or three positive weights must total 10000");
  }
  const denominator = BigInt(BASIS_POINTS);
  const amounts = weights.map((weight) => raw * BigInt(weight) / denominator);
  let remainder = raw - amounts.reduce((sum, amount) => sum + amount, 0n);
  // Largest remainders first; recipe order breaks ties deterministically.
  const ranked = weights.map((weight, index) => ({
    index,
    remainder: raw * BigInt(weight) % denominator,
  })).sort((a, b) => a.remainder === b.remainder
    ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  for (const { index } of ranked) {
    if (remainder === 0n) break;
    amounts[index] = amounts[index]! + 1n;
    remainder -= 1n;
  }
  return amounts;
}

export function allocateInvestment(raw: bigint, count: number): bigint[] {
  const result = allocate(raw, equalWeights(count));
  if (result.some((amount) => amount === 0n)) {
    throw new RangeError("Investment is too small to fund every leg");
  }
  return result;
}
