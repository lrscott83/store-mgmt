/**
 * Shared plan-price formatting helpers.
 * Canonical implementations — imported by the owner's store cards and the
 * super-admin store cards, matching the plan panels' format. DO NOT duplicate
 * these helpers elsewhere.
 */

/**
 * Format a plan amount as a bare number — decimals shown only when present
 * (10 → "10", 10.5 → "10.5"), no currency. Same shape as the plan panels'
 * formatPlanAmount: used for the struck-through original price.
 */
export function formatPlanAmount(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Format as "5 USD" or "5.5 USD" (no $ symbol) — same shape as the plan panels. */
export function formatPlanPrice(amount: number): string {
  return `${formatPlanAmount(amount)} USD`;
}
