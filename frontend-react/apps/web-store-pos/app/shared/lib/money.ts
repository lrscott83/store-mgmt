/** Round to 2 accounting decimal places without float drift (0.1+0.2 → 0.3). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Approximate equality with an epsilon tolerance, for fractional float comparisons. */
export function approxEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}
