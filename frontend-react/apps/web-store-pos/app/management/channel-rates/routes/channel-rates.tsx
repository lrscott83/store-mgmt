import { useState, useEffect, useCallback } from 'react';
import { useIntl } from 'react-intl';
import {
  Currency,
  EFeatures,
  SalePaymentMethod,
  salePaymentMethodLabel,
  type ChannelRate,
} from '@store-mgmt/domain';
import { adminFeatureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { Card } from '~/shared/components/ui/card';
import { Button } from '~/shared/components/ui/button';
import { currencyLabel, formatMoneyWithCurrency } from '~/shared/lib/format-money-with-currency';
import { fromLocalDayKey, toLocalDayKey } from '~/shared/lib/date-utils';
import { ChannelRateOfflineService } from '../lib/services/channel-rate-offline-service';

// multipayments — same guard as the Configurations feature and the daily
// exchange-rate register: OwnerAdmin / SuperAdmin bypass plus the feature
// gate for the rest.
export const clientLoader = adminFeatureLoader([EFeatures.Configurations]);

const METHOD_OPTIONS: { value: SalePaymentMethod; labelId: string }[] = [
  { value: SalePaymentMethod.Efectivo, labelId: 'CHANNEL_RATES.METHOD_EFECTIVO' },
  { value: SalePaymentMethod.Zelle, labelId: 'CHANNEL_RATES.METHOD_ZELLE' },
  { value: SalePaymentMethod.Transferencia, labelId: 'CHANNEL_RATES.METHOD_TRANSFERENCIA' },
];

const CURRENCY_OPTIONS: Currency[] = [
  Currency.CUP,
  Currency.USD,
  Currency.EUR,
  Currency.MLC,
  Currency.CLA,
  Currency.CAD,
  Currency.MXN,
];

/**
 * Deterministic history order: newest `effectiveFrom` first; ties broken by
 * newest `createdDate` first (rows without an audit date sort last).
 */
function sortByRecency(rates: ChannelRate[]): ChannelRate[] {
  return [...rates].sort((a, b) => {
    const byEffective = b.effectiveFrom.getTime() - a.effectiveFrom.getTime();
    if (byEffective !== 0) return byEffective;
    return (b.createdDate?.getTime() ?? 0) - (a.createdDate?.getTime() ?? 0);
  });
}

/**
 * Channel-rates register (multipayments). Append-only by contract: a new
 * effective moment is a NEW row, and historical rows are never edited or
 * deleted, so this view has no update/delete controls. All Spanish copy comes
 * from i18n keys.
 */
export function ChannelRatesPage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');

  const [records, setRecords] = useState<ChannelRate[]>([]);
  const [method, setMethod] = useState<SalePaymentMethod>(SalePaymentMethod.Efectivo);
  const [currency, setCurrency] = useState<Currency>(Currency.CUP);
  const [valueDraft, setValueDraft] = useState('');
  const [effectiveFromDraft, setEffectiveFromDraft] = useState(() => toLocalDayKey(new Date()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [savedMessage, setSavedMessage] = useState(false);

  const load = useCallback(() => {
    if (!storeId) return;
    const svc = new ChannelRateOfflineService(storeId);
    setRecords(sortByRecency(svc.getStorageChannelRates()));
  }, [storeId]);

  useEffect(() => {
    load();
  }, [load]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);

    if (!effectiveFromDraft) {
      setError(intl.formatMessage({ id: 'CHANNEL_RATES.INVALID_DATE' }));
      return;
    }

    // `fromLocalDayKey` anchors to local midnight instead of `new Date('YYYY-MM-DD')`,
    // which would parse as UTC and shift a day under negative offsets.
    const effectiveFrom = fromLocalDayKey(effectiveFromDraft);
    if (Number.isNaN(effectiveFrom.getTime())) {
      setError(intl.formatMessage({ id: 'CHANNEL_RATES.INVALID_DATE' }));
      return;
    }

    setSaving(true);
    const svc = new ChannelRateOfflineService(storeId);
    // The service is the write guard (value must be finite and > 0); on failure
    // it returns a failed DataResult and writes nothing.
    const result = svc.registerRate({
      method,
      currency,
      value: Number(valueDraft),
      effectiveFrom,
    });
    setSaving(false);

    if (!result.succeeded) {
      setError(result.errors[0]?.description ?? '');
      return;
    }

    setValueDraft('');
    load();
    setSavedMessage(true);
    setTimeout(() => setSavedMessage(false), 3000);
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">{intl.formatMessage({ id: 'CHANNEL_RATES.TITLE' })}</h1>

      {savedMessage && (
        <p role="status" className="text-sm text-success" data-testid="channel-rate-saved">
          {intl.formatMessage({ id: 'CHANNEL_RATES.SAVED' })}
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600" data-testid="channel-rate-error">
          {error}
        </p>
      )}

      <Card title={intl.formatMessage({ id: 'CHANNEL_RATES.FORM_TITLE' })}>
        <p className="mb-4 text-sm text-text-muted">
          {intl.formatMessage({ id: 'CHANNEL_RATES.INFO' })}
        </p>
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="channel-rate-method"
              className="mb-1 block text-xs font-medium text-text-muted"
            >
              {intl.formatMessage({ id: 'CHANNEL_RATES.METHOD_LABEL' })}
            </label>
            <select
              id="channel-rate-method"
              value={method}
              onChange={(e) => setMethod(Number(e.target.value) as SalePaymentMethod)}
              className="w-full rounded-md border border-border px-3 py-2 text-sm"
              data-testid="channel-rate-method"
            >
              {METHOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {intl.formatMessage({ id: option.labelId })}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="channel-rate-currency"
              className="mb-1 block text-xs font-medium text-text-muted"
            >
              {intl.formatMessage({ id: 'CHANNEL_RATES.CURRENCY_LABEL' })}
            </label>
            <select
              id="channel-rate-currency"
              value={currency}
              onChange={(e) => setCurrency(Number(e.target.value) as Currency)}
              className="w-full rounded-md border border-border px-3 py-2 text-sm"
              data-testid="channel-rate-currency"
            >
              {CURRENCY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {currencyLabel(option)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="channel-rate-value"
              className="mb-1 block text-xs font-medium text-text-muted"
            >
              {intl.formatMessage({ id: 'CHANNEL_RATES.VALUE_LABEL' })}
            </label>
            <input
              id="channel-rate-value"
              type="number"
              min="0"
              step="0.01"
              value={valueDraft}
              onChange={(e) => setValueDraft(e.target.value)}
              className="w-full rounded-md border border-border px-3 py-2 text-sm"
              data-testid="channel-rate-value"
            />
          </div>

          <div>
            <label
              htmlFor="channel-rate-effective-from"
              className="mb-1 block text-xs font-medium text-text-muted"
            >
              {intl.formatMessage({ id: 'CHANNEL_RATES.EFFECTIVE_FROM_LABEL' })}
            </label>
            <input
              id="channel-rate-effective-from"
              type="date"
              value={effectiveFromDraft}
              onChange={(e) => setEffectiveFromDraft(e.target.value)}
              className="w-full rounded-md border border-border px-3 py-2 text-sm"
              data-testid="channel-rate-effective-from"
            />
          </div>

          <div className="sm:col-span-2">
            <Button
              variant="fab"
              type="submit"
              disabled={saving}
              data-testid="channel-rate-submit"
            >
              {intl.formatMessage({ id: 'CHANNEL_RATES.REGISTER' })}
            </Button>
          </div>
        </form>
      </Card>

      <Card title={intl.formatMessage({ id: 'CHANNEL_RATES.HISTORY_TITLE' })} padding="tight">
        {records.length === 0 ? (
          <p className="p-2 text-sm text-text-muted" data-testid="channel-rate-empty">
            {intl.formatMessage({ id: 'CHANNEL_RATES.NO_RECORDS' })}
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-text-muted">
                <th className="px-3 py-2">{intl.formatMessage({ id: 'CHANNEL_RATES.CHANNEL_COLUMN' })}</th>
                <th className="px-3 py-2">{intl.formatMessage({ id: 'CHANNEL_RATES.CURRENCY_COLUMN' })}</th>
                <th className="px-3 py-2">{intl.formatMessage({ id: 'CHANNEL_RATES.VALUE_COLUMN' })}</th>
                <th className="px-3 py-2">
                  {intl.formatMessage({ id: 'CHANNEL_RATES.EFFECTIVE_FROM_COLUMN' })}
                </th>
                <th className="px-3 py-2">
                  {intl.formatMessage({ id: 'CHANNEL_RATES.CREATED_DATE_COLUMN' })}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {records.map((record, index) => (
                <tr key={record.id ?? index} data-testid={`channel-rate-row-${record.id ?? index}`}>
                  <td className="px-3 py-2 text-text">
                    {salePaymentMethodLabel(record.method, record.currency)}
                  </td>
                  <td className="px-3 py-2 text-text">{currencyLabel(record.currency)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-text">
                    {formatMoneyWithCurrency(record.value, record.currency)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-text">
                    {toLocalDayKey(record.effectiveFrom)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-text">
                    {record.createdDate ? toLocalDayKey(record.createdDate) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

export default ChannelRatesPage;
