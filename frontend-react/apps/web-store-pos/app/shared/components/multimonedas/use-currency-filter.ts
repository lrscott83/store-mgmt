import { useState } from 'react';
import type { Currency } from '@store-mgmt/domain';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { hasMultiMonedasAvailable } from '~/shared/components/multimonedas/currency-select';

export interface CurrencyFilterState {
  /** True only when the module is active AND 2+ currencies are present. */
  visible: boolean;
  /** The currency the view must filter by, or null when `visible` is false. */
  currency: Currency | null;
  setCurrency: (currency: Currency) => void;
  /** The full option list the select must offer (agreed order). */
  currencies: readonly Currency[];
}

/**
 * Currency-filter state shared by every migrated view (currency-filter-per-view).
 *
 * The caller derives the option list from the view's UNFILTERED data set
 * (`presentCurrencies`) and passes it here; the hook decides visibility and
 * keeps the resolved selection.
 *
 * Selection survival: the user's pick lives in local state, so re-renders never
 * lose it. A pick that is no longer among `currencies` (e.g. the data changed)
 * falls back to `currencies[0]` — the first of the agreed order, USD in the
 * common case. Without the module, or with fewer than two currencies, the
 * filter is hidden and `currency` is null.
 */
export function useCurrencyFilter(currencies: readonly Currency[]): CurrencyFilterState {
  const user = useAuthStore((s) => s.user);
  const visible = hasMultiMonedasAvailable(user) && currencies.length >= 2;
  const [selected, setSelected] = useState<Currency | null>(null);

  const resolved = visible
    ? selected !== null && currencies.includes(selected)
      ? selected
      : (currencies[0] ?? null)
    : null;

  return {
    visible,
    currency: resolved,
    setCurrency: setSelected,
    currencies,
  };
}
