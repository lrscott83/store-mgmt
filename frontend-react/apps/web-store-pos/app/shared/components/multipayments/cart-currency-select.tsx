import { useEffect, useRef } from 'react';
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
  // The store slice is typed as an array, but a malformed persisted/mocked state
  // can still hand a non-array here; fall back to the fixed prefix rather than
  // throw, since callers only use the result to pick a visible fallback.
  for (const item of Array.isArray(items) ? items : []) {
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
 *
 * Layout: compact inline control (label + select in one row) so the cart can
 * place it in the header toolbar next to "Limpiar"/"Registrar" without a
 * full-width row of its own. On narrow screens the header wraps, keeping the
 * control usable.
 */
export function CartCurrencySelect({ value, onChange, testId }: CartCurrencySelectProps) {
  const intl = useIntl();
  const user = useAuthStore((s) => s.user);
  const items = useCartStore((s) => s.items);
  const available = hasMultiPaymentsModuleAvailable(user);

  // Built unconditionally (pure computation) because hooks must run on every
  // render; when the module is absent the early return below discards them.
  const options = buildCurrencyOptions(items);
  const selected = options.some((option) => option.value === value) ? value : Currency.CUP;
  const lastEmitted = useRef<Currency | undefined>(undefined);

  // The controlled `value` can name a currency that is not among the built
  // options (e.g. a persisted EUR with a CUP-only cart). The select renders the
  // fallback, so tell the parent about it — otherwise the visible label and the
  // priced currency drift apart. The ref bounds the notice to once per
  // divergence: a parent with an unstable `onChange` identity would otherwise
  // re-run this effect on every render and repeat the call.
  useEffect(() => {
    if (!available) return;
    if (selected === value) {
      lastEmitted.current = undefined;
      return;
    }
    if (lastEmitted.current === selected) return;
    lastEmitted.current = selected;
    onChange(selected);
  }, [available, selected, value, onChange]);

  if (!available) {
    return null;
  }

  function handleChange(currency: number) {
    writeCartCurrencyPreference(user?.id, currency as Currency);
    onChange(currency as Currency);
  }

  return (
    <div className="flex items-center gap-1">
      <label className="whitespace-nowrap text-xs font-medium text-text-muted">
        {intl.formatMessage({ id: 'SHOPPING_CART.CURRENCY_LABEL' })}
      </label>
      <select
        value={selected}
        onChange={(e) => handleChange(Number(e.target.value))}
        data-testid={testId ?? 'cart-currency-select'}
        className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-text focus:outline-none focus:ring-1 focus:ring-primary"
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
