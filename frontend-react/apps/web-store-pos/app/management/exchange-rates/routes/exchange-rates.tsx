import { useState, useEffect, useCallback } from 'react';
import { useIntl } from 'react-intl';
import { EFeatures, type ExchangeRate } from '@store-mgmt/domain';
import { adminFeatureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { Card } from '~/shared/components/ui/card';
import { Button } from '~/shared/components/ui/button';
import { ChevronDownIcon, CloseIcon, EditIcon, SaveIcon } from '~/shared/components/ui/icons';
import { ExchangeRateOfflineService } from '../lib/services/exchange-rate-offline-service';
import { getExchangeRateAnchor } from '~/shared/lib/exchange-rates/exchange-rate-daily';

// daily-exchange-rate — same guard as the Configurations feature: OwnerAdmin /
// SuperAdmin bypass plus the feature-gate for the rest.
export const clientLoader = adminFeatureLoader([EFeatures.Configurations]);

/** Month bucket: 'YYYY-MM' key, the month's first record date (for the label), and its records. */
interface MonthGroup {
  monthKey: string;
  date: Date;
  records: ExchangeRate[];
}

/**
 * Groups records into month buckets keyed 'YYYY-MM' (derived from the record's
 * day-key id, which is already 'YYYY-MM-DD'), newest month first, days within
 * each month newest first. Mirrors the collapsed-panel pattern of the history
 * views (entries.tsx / expenses-history.tsx) but grouped by MONTH, not by day.
 */
function groupByMonth(records: ExchangeRate[]): MonthGroup[] {
  const byMonth = new Map<string, MonthGroup>();
  for (const record of records) {
    const monthKey = record.id.slice(0, 7); // 'YYYY-MM' from 'YYYY-MM-DD'
    let group = byMonth.get(monthKey);
    if (!group) {
      group = { monthKey, date: record.date, records: [] };
      byMonth.set(monthKey, group);
    }
    group.records.push(record);
  }
  return [...byMonth.values()].sort((a, b) => (a.monthKey < b.monthKey ? 1 : -1));
}

const MONTH_NAMES_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/**
 * "2026 - Septiembre"-style month label (year first, month capitalized) from a
 * fixed Spanish month-name table — deterministic across Node/jsdom/browser
 * builds (toLocaleDateString('es', …) month-part output varies by environment,
 * which the test suite must not depend on).
 */
function monthLabelStable(date: Date): string {
  const month = MONTH_NAMES_ES[date.getMonth()];
  return `${date.getFullYear()} - ${month.charAt(0).toUpperCase()}${month.slice(1)}`;
}

/** 'YYYY-MM' month key of a date, local time. */
function toLocalMonthKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Daily USD→MN exchange-rate register, grouped by month with collapsed panels
 * (only the CURRENT month starts expanded — the register grows one day at a
 * time, so past months are read-mostly history). Each row shows the day number
 * and the value; the edit icon on the right opens a popup modal (the app's
 * standard modal shape) to edit that day's value — the register's only write
 * operation (no create/delete by design).
 */
export function ExchangeRatesPage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');

  const [records, setRecords] = useState<ExchangeRate[]>([]);
  const [expandedMonthKeys, setExpandedMonthKeys] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<ExchangeRate | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [savedMessage, setSavedMessage] = useState(false);
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
    // Only the CURRENT month starts expanded; every other month stays collapsed.
    const currentMonthKey = toLocalMonthKey(new Date());
    setExpandedMonthKeys(
      new Set(stored.some((r) => r.id.startsWith(currentMonthKey)) ? [currentMonthKey] : []),
    );
    setLoadError(undefined);
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleMonthPanel(monthKey: string) {
    setExpandedMonthKeys((prev) => {
      const next = new Set(prev);
      if (next.has(monthKey)) next.delete(monthKey);
      else next.add(monthKey);
      return next;
    });
  }

  function openEdit(record: ExchangeRate) {
    setEditing(record);
    setDraft(String(record.value));
    setError(undefined);
  }

  function closeEdit() {
    setEditing(null);
    setDraft('');
    setError(undefined);
  }

  async function handleSave() {
    if (!editing) return;
    const parsed = Number(draft);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError(intl.formatMessage({ id: 'EXCHANGE_RATES.INVALID_VALUE' }));
      return;
    }

    setSaving(true);
    const svc = new ExchangeRateOfflineService(storeId);
    const result = svc.updateValue(editing.id, parsed);
    setSaving(false);

    if (!result.succeeded) {
      // The only failure mode is a missing record — reload to resync the list.
      setError(result.errors[0]?.description ?? '');
      void load();
      return;
    }
    setRecords((prev) =>
      prev.map((r) => (r.id === editing.id ? (result.data as ExchangeRate) : r)),
    );
    closeEdit();
    setSavedMessage(true);
    setTimeout(() => setSavedMessage(false), 3000);
  }

  const monthGroups = groupByMonth(records);

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">
        {intl.formatMessage({ id: 'EXCHANGE_RATES.TITLE' })}
      </h1>

      {savedMessage && (
        <p role="status" className="text-sm text-success">
          {intl.formatMessage({ id: 'EXCHANGE_RATES.SAVED' })}
        </p>
      )}

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
          <div className="space-y-2">
            {monthGroups.map((monthGroup) => {
              const isExpanded = expandedMonthKeys.has(monthGroup.monthKey);
              return (
                <div
                  key={monthGroup.monthKey}
                  className="rounded-lg border border-border bg-surface"
                >
                  <div className="flex items-center gap-2 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleMonthPanel(monthGroup.monthKey)}
                      className="flex w-full items-center justify-between gap-4 text-left"
                      data-testid={`rate-month-panel-toggle-${monthGroup.monthKey}`}
                      aria-expanded={isExpanded}
                    >
                      <span className="text-sm font-medium text-text">
                        {monthLabelStable(monthGroup.date)}
                      </span>
                      <ChevronDownIcon isExpanded={isExpanded} className="text-text-muted" />
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="border-t border-border px-4 py-3">
                      <ul className="divide-y divide-border">
                        {monthGroup.records.map((record) => (
                          <li
                            key={record.id}
                            className="flex items-center justify-between gap-4 py-2"
                            data-testid={`rate-row-${record.id}`}
                          >
                            <span className="text-sm font-medium text-text">
                              {record.date.getDate()}
                            </span>
                            <span className="flex items-center gap-3">
                              <span className="text-sm whitespace-nowrap text-text">
                                {record.value}
                              </span>
                              <button
                                type="button"
                                onClick={() => openEdit(record)}
                                aria-label={`${intl.formatMessage({ id: 'EXCHANGE_RATES.EDIT' })} ${record.date.getDate()}`}
                                title={intl.formatMessage({ id: 'EXCHANGE_RATES.EDIT' })}
                                data-testid={`rate-edit-${record.id}`}
                                className="rounded p-1 text-text-muted hover:bg-background-hover hover:text-primary"
                              >
                                <EditIcon className="h-4 w-4" />
                              </button>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Edit popup — the app's standard modal shape (fixed overlay + card). */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">
                {intl.formatMessage({ id: 'EXCHANGE_RATES.EDIT_TITLE' })}
              </h2>
              <button
                type="button"
                onClick={closeEdit}
                aria-label={intl.formatMessage({ id: 'GENERAL.CLOSE' })}
                data-testid="rate-edit-close"
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <CloseIcon />
              </button>
            </div>

            <p className="mb-3 text-sm text-text">
              {monthLabelStable(editing.date)} — {editing.date.getDate()}
            </p>

            <div className="mb-4">
              <label
                htmlFor="rate-value-input"
                className="mb-1 block text-xs font-medium text-gray-600"
              >
                {intl.formatMessage({ id: 'EXCHANGE_RATES.VALUE_COLUMN' })}
              </label>
              <input
                id="rate-value-input"
                type="number"
                min="0"
                step="0.01"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
                data-testid="rate-value-input"
                autoFocus
              />
              {error && (
                <p role="alert" className="mt-1 text-xs text-red-600" data-testid="rate-edit-error">
                  {error}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="fab" type="button" onClick={closeEdit} data-testid="rate-edit-cancel">
                <CloseIcon />
                {intl.formatMessage({ id: 'GENERAL.CLOSE' })}
              </Button>
              <Button
                variant="fab"
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                data-testid="rate-edit-submit"
              >
                <SaveIcon />
                {intl.formatMessage({ id: 'EXCHANGE_RATES.SAVE' })}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ExchangeRatesPage;
