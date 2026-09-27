import { useId } from 'react';
import { useIntl } from 'react-intl';
import type { Currency } from '@store-mgmt/domain';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { hasMultiMonedasAvailable } from '~/shared/components/multimonedas/currency-select';
import { currencyLabel } from '~/shared/lib/format-money-with-currency';

interface CurrencyFilterProps {
  /** Option list in the agreed order — derive it from the UNFILTERED data set. */
  currencies: readonly Currency[];
  value: Currency;
  onChange: (currency: Currency) => void;
}

/**
 * Currency filter row shared by every migrated view (currency-filter-per-view):
 * a centered `Moneda` label followed by a select, so the user works one currency
 * at a time. Renders nothing without the MultiMonedas module or with fewer than
 * two currencies. Grouping/ordering is the caller's job (`presentCurrencies`).
 */
export function CurrencyFilter({ currencies, value, onChange }: CurrencyFilterProps) {
  const intl = useIntl();
  const user = useAuthStore((s) => s.user);
  const selectId = useId();

  if (currencies.length < 2 || !hasMultiMonedasAvailable(user)) {
    return null;
  }

  const label = intl.formatMessage({ id: 'GENERAL.CURRENCY' });

  return (
    <div className="flex items-center justify-center gap-2" data-testid="currency-filter">
      <label htmlFor={selectId} className="text-sm font-medium text-gray-600">
        {label}
      </label>
      <select
        id={selectId}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) as Currency)}
        data-testid="currency-filter-select"
        aria-label={label}
        className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
      >
        {currencies.map((currency) => (
          <option key={currency} value={currency}>
            {currencyLabel(currency)}
          </option>
        ))}
      </select>
    </div>
  );
}
