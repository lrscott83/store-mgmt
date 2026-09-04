import { useState, useEffect, useCallback } from 'react';
import { useIntl } from 'react-intl';
import { EFeatures, type ExchangeRate } from '@store-mgmt/domain';
import { adminFeatureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { Card } from '~/shared/components/ui/card';
import { InfoBox } from '~/shared/components/ui/info-box';
import { Button } from '~/shared/components/ui/button';
import { SaveIcon } from '~/shared/components/ui/icons';
import { formatLocalDate } from '~/shared/lib/date-utils';
import { ExchangeRateOfflineService } from '../lib/services/exchange-rate-offline-service';
import { getExchangeRateAnchor } from '~/shared/lib/exchange-rates/exchange-rate-daily';

// daily-exchange-rate — same guard as the Configurations feature: OwnerAdmin /
// SuperAdmin bypass plus the feature-gate for the rest.
export const clientLoader = adminFeatureLoader([EFeatures.Configurations]);

interface RowState {
  draft: string;
  saving: boolean;
  error?: string;
  saved?: boolean;
}

/**
 * Daily USD→MN exchange-rate register.
 *
 * The list runs from TODAY down to the first day the store owner authenticated
 * on this device (`getExchangeRateAnchor`). Records are auto-generated — one
 * per local day, each inheriting the previous day's value (default 1) — so
 * this screen offers no create/delete: each row's value is editable, and that
 * is the only operation. Opening the view backfills any missing days first
 * (the auth-time backfill in auth-store covers the days the app runs without
 * anyone navigating here).
 */
export function ExchangeRatesPage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');

  const [records, setRecords] = useState<ExchangeRate[]>([]);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [loadError, setLoadError] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    if (!storeId) return;
    const svc = new ExchangeRateOfflineService(storeId);
    // View-time backfill: any authorized viewer gets the register brought up
    // to today (idempotent; never touches existing records).
    svc.backfillDailyRecords(getExchangeRateAnchor());
    const stored = [...svc.getStorageExchangeRates()].sort((a, b) =>
      a.id < b.id ? 1 : a.id > b.id ? -1 : 0,
    );
    setRecords(stored);
    setRows(
      Object.fromEntries(
        stored.map((r) => [r.id, { draft: String(r.value), saving: false } satisfies RowState]),
      ),
    );
    setLoadError(undefined);
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  function setRow(id: string, patch: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function handleSave(record: ExchangeRate) {
    const state = rows[record.id];
    if (!state) return;
    const parsed = Number(state.draft);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setRow(record.id, { error: intl.formatMessage({ id: 'EXCHANGE_RATES.INVALID_VALUE' }) });
      return;
    }

    setRow(record.id, { saving: true, error: undefined, saved: undefined });
    const svc = new ExchangeRateOfflineService(storeId);
    const result = svc.updateValue(record.id, parsed);
    setRow(record.id, { saving: false });

    if (!result.succeeded) {
      // The only failure mode is a missing record — reload to resync the list.
      setRow(record.id, { error: result.errors[0]?.description ?? '' });
      void load();
      return;
    }
    setRow(record.id, { saved: true });
    setRecords((prev) =>
      prev.map((r) => (r.id === record.id ? (result.data as ExchangeRate) : r)),
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {intl.formatMessage({ id: 'EXCHANGE_RATES.TITLE' })}
        </h1>
        {records.length > 0 && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
            ({records.length})
          </span>
        )}
      </div>

      <InfoBox>{intl.formatMessage({ id: 'EXCHANGE_RATES.INFO' })}</InfoBox>

      {loadError && (
        <p role="alert" className="text-sm text-red-600">
          {loadError}
        </p>
      )}

      {records.length === 0 ? (
        <p className="text-sm text-text-muted">
          {intl.formatMessage({ id: 'EXCHANGE_RATES.NO_RECORDS' })}
        </p>
      ) : (
        <Card padding="tight">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-background">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-text-muted">
                    {intl.formatMessage({ id: 'EXCHANGE_RATES.DATE_COLUMN' })}
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-text-muted">
                    {intl.formatMessage({ id: 'EXCHANGE_RATES.VALUE_COLUMN' })}
                  </th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {records.map((record) => {
                  const state = rows[record.id];
                  return (
                    <tr key={record.id} className="hover:bg-background">
                      <td className="px-4 py-3 font-medium text-text">
                        {formatLocalDate(record.date)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={state?.draft ?? String(record.value)}
                            onChange={(e) => setRow(record.id, { draft: e.target.value })}
                            className="w-32 rounded-md border border-border px-3 py-1.5 text-sm text-text focus:border-primary focus:outline-none"
                            aria-label={`${formatLocalDate(record.date)}`}
                          />
                          {state?.saved && (
                            <span className="text-sm text-success">
                              {intl.formatMessage({ id: 'EXCHANGE_RATES.SAVED' })}
                            </span>
                          )}
                        </div>
                        {state?.error && (
                          <p role="alert" className="mt-1 text-xs text-red-600">
                            {state.error}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          onClick={() => void handleSave(record)}
                          disabled={state?.saving}
                          className="px-3 py-1.5 text-xs"
                        >
                          <SaveIcon className="h-4 w-4" />
                          {intl.formatMessage({ id: 'EXCHANGE_RATES.SAVE' })}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

export default ExchangeRatesPage;
