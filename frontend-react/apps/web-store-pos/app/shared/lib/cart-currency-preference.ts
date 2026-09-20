import { Currency } from '@store-mgmt/domain';

/**
 * Per-user/device cart currency preference (MultiPayments). Mirrors the
 * `lizoft.store-daily-usage-${userId}` localStorage pattern of
 * `store-usage-tracker.ts`: a raw, unprefixed-by-version key scoped to the
 * authenticated user so the choice survives reloads and the next sale reuses
 * it. Deliberately NOT zustand-persist — this is a small standalone preference,
 * read synchronously where the cart total needs it.
 *
 * SSR/localStorage-safe: absent storage yields the CUP default (the same
 * fallback every entity uses for an absent currency), and any invalid or
 * unknown stored value falls back to CUP.
 */

const CART_CURRENCY_PREFERENCE_KEY_PREFIX = 'lizoft.cart-currency-';

const VALID_CURRENCIES: ReadonlySet<number> = new Set<number>([
  Currency.CUP,
  Currency.USD,
  Currency.EUR,
  Currency.CLA,
  Currency.MLC,
  Currency.CAD,
  Currency.MXN,
]);

function getStorageKey(userId: string): string {
  return `${CART_CURRENCY_PREFERENCE_KEY_PREFIX}${userId}`;
}

function isCurrency(value: number): value is Currency {
  return VALID_CURRENCIES.has(value);
}

/** Reads the user's persisted cart currency; defaults to CUP when absent/invalid. */
export function readCartCurrencyPreference(userId: string | null | undefined): Currency {
  if (!userId) return Currency.CUP;
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (raw === null) return Currency.CUP;
    const parsed = Number(raw);
    return isCurrency(parsed) ? parsed : Currency.CUP;
  } catch {
    return Currency.CUP;
  }
}

/** Persists the user's cart currency. No-op without a user; best-effort when storage is unavailable. */
export function writeCartCurrencyPreference(
  userId: string | null | undefined,
  currency: Currency,
): void {
  if (!userId) return;
  try {
    localStorage.setItem(getStorageKey(userId), String(currency));
  } catch {
    // SSR / private mode: the preference is best-effort and must never break the cart.
  }
}
