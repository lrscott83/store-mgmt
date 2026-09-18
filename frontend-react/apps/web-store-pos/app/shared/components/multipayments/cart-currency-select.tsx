import { useEffect } from 'react';
import { useIntl } from 'react-intl';
import { Currency } from '@store-mgmt/domain';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { useCartStore } from '~/shared/lib/stores/cart-store';
import { currencyLabel } from '~/shared/lib/format-money-with-currency';
import { writeCartCurrencyPreference } from '~/shared/lib/cart-currency-preference';
import { hasMultiPaymentsModuleAvailable } from '~/shared/lib/auth/authorization-service';

/** Fixed prefix of the options: CUP (default) then USD. Cart currencies append after. */
const BASE_OPTIONS: { value: Currency; label: string }[] = [
  { value: Currency.CUP, label: currencyLabel(Currency.CUP) },
  { value: Currency.USD, label: currencyLabel(Currency.USD) },
];

interface CurrencyOption {
  value: number;
  label: string;
}

/**
 * Options = CUP, USD, then every distinct currency present in the cart.
 * CUP/USD are already in the prefix, so cart duplicates are skipped.
 */
function buildCurrencyOptions(items: { product: { currency?: Currency } }[]): CurrencyOption[] {
  const options: CurrencyOption[] = [...BASE_OPTIONS];
  const seen = new Set<number>(options.map((option) => option.value));
  for (const item of items) {
    const currency = item.product.currency ?? Currency.CUP;
    if (!seen.has(currency)) {
      options.push({ value: currency, label: currencyLabel(currency) });
      seen.add(currency);
    }
  }
  return options;
}

interface CartCurrencySelectProps {
  /** Controlled value (domain Currency) — the caller keeps the sale currency in sync. */
  value: Currency;
  onChange: (currency: Currency) => void;
  testId?: string;
}

/**
 * Cart currency selector — rendered ONLY when the store has the MultiPayments
 * module (module 16). Without the module nothing renders and the cart keeps its
 * pre-MultiPayments behavior (the first item's currency). The selected value is
 * persisted per user so it survives reloads and is reused on the next sale.
 */
export function CartCurrencySelect({ value, onChange, testId }: CartCurrencySelectProps) {
  const intl = useIntl();
  const user = useAuthStore((s) => s.user);
  const items = useCartStore((s) => s.items);
  const available = hasMultiPaymentsModuleAvailable(user);

  const options = available ? buildCurrencyOptions(items) : [];
  const selected = options.some((option) => option.value === value) ? value : Currency.CUP;

  // The controlled `value` can name a currency that is not among the built
  // options (e.g. a persisted EUR with a CUP-only cart). The select renders the
  // fallback, so tell the parent about it — otherwise the visible label and the
  // priced currency drift apart.
  useEffect(() => {
    if (available && selected !== value) {
      onChange(selected);
    }
  }, [available, selected, value, onChange]);

  if (!available) {
    return null;
  }

  function handleChange(currency: number) {
    writeCartCurrencyPreference(user?.id, currency as Currency);
    onChange(currency as Currency);
  }

  return (
    <div className="border-b border-border px-4 py-3">
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {intl.formatMessage({ id: 'SHOPPING_CART.CURRENCY_LABEL' })}
      </label>
      <select
        value={selected}
        onChange={(e) => handleChange(Number(e.target.value))}
        data-testid={testId ?? 'cart-currency-select'}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
