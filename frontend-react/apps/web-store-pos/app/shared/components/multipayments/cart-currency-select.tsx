import { useIntl } from 'react-intl';
import { Currency, EModules } from '@store-mgmt/domain';
import type { UserModel } from '@store-mgmt/domain';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { useCartStore } from '~/shared/lib/stores/cart-store';
import { currencyLabel } from '~/shared/lib/format-money-with-currency';
import { writeCartCurrencyPreference } from '~/shared/lib/cart-currency-preference';

/** Fixed prefix of the options: CUP (default) then USD. Cart currencies append after. */
const BASE_OPTIONS: { value: Currency; label: string }[] = [
  { value: Currency.CUP, label: 'CUP' },
  { value: Currency.USD, label: 'USD' },
];

interface CurrencyOption {
  value: number;
  label: string;
}

/** Defensivo: perfiles cacheados de sesiones previas pueden no traer storeModuleIds. */
export function hasMultiPaymentsAvailable(user: UserModel | null): boolean {
  return (
    !!user && Array.isArray(user.storeModuleIds) && user.storeModuleIds.includes(EModules.MultiPayments)
  );
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
  if (!hasMultiPaymentsAvailable(user)) {
    return null;
  }

  const options = buildCurrencyOptions(items);
  const selected = options.some((option) => option.value === value) ? value : Currency.CUP;

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
