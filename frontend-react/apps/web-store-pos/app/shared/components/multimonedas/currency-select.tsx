import { useIntl } from 'react-intl';
import { Currency, EModules } from '@store-mgmt/domain';
import type { UserModel } from '@store-mgmt/domain';
import { useAuthStore } from '~/shared/lib/stores/auth-store';

/** Options in the required order: CUP default first, then the foreign codes. */
const CURRENCY_OPTIONS: { value: number; label: string }[] = [
  { value: Currency.CUP, label: 'CUP' },
  { value: Currency.USD, label: 'USD' },
  { value: Currency.EUR, label: 'EUR' },
  { value: Currency.CLA, label: 'CLA' },
  { value: Currency.MLC, label: 'MLC' },
  { value: Currency.CAD, label: 'CAD' },
  { value: Currency.MXN, label: 'MXN' },
];

export function hasMultiMonedasAvailable(user: UserModel | null): boolean {
  // Defensivo: perfiles cacheados de sesiones previas pueden no traer storeModuleIds.
  return !!user && Array.isArray(user.storeModuleIds) && user.storeModuleIds.includes(EModules.MultiMonedas);
}

interface CurrencySelectProps {
  /** Controlled value (domain Currency). */
  value: number | undefined;
  onChange: (currency: number) => void;
  /** Accessible label (already intl-formatted by the caller). */
  label: string;
  testId?: string;
  disabled?: boolean;
}

/**
 * Currency selector for price/cost fields — rendered ONLY when the store has the
 * MultiMonedas module (module 15). Without the module nothing renders and every
 * entity keeps the domain default (CUP), preserving the pre-MultiMonedas UX.
 */
export function CurrencySelect({ value, onChange, label, testId, disabled }: CurrencySelectProps) {
  const intl = useIntl();
  const user = useAuthStore((s) => s.user);
  if (!hasMultiMonedasAvailable(user)) {
    return null;
  }
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <select
        value={value ?? Currency.CUP}
        onChange={(e) => onChange(Number(e.target.value))}
        data-testid={testId}
        disabled={disabled}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
      >
        {CURRENCY_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="sr-only">{intl.formatMessage({ id: 'GENERAL.CURRENCY' })}</span>
    </div>
  );
}
