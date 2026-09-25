import { useState, useEffect, useCallback, useMemo, useRef, type FormEvent } from 'react';
import { useIntl } from 'react-intl';
import {
  Currency,
  EFeatures,
  EModules,
  SalePaymentMethod,
  channelKey,
  defaultPaymentMethodForCurrency,
  isValidChannel,
  type ChannelRate,
} from '@store-mgmt/domain';
import { adminFeatureModuleLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { Card } from '~/shared/components/ui/card';
import { Button } from '~/shared/components/ui/button';
import { Modal } from '~/shared/components/ui/modal';
import { ConfirmDialog } from '~/shared/components/ui/confirm-dialog';
import { HelpIcon, PlusIcon, TrashIcon } from '~/shared/components/ui/icons';
import { currencyLabel } from '~/shared/lib/format-money-with-currency';
import { fromLocalDayKey, toLocalDayKey } from '~/shared/lib/date-utils';
import { ChannelRateOfflineService } from '../lib/services/channel-rate-offline-service';
import { channelLabel } from '../lib/channel-label';

// multipayments — same guard as the Configurations feature and the daily
// exchange-rate register (OwnerAdmin / SuperAdmin plus the feature gate), AND
// the MultiPayments module gate (D11): without module 16 the page does not
// exist, so the route is not reachable even by direct URL.
export const clientLoader = adminFeatureModuleLoader(
  [EFeatures.Configurations],
  [EModules.MultiPayments],
);

const METHOD_OPTIONS: SalePaymentMethod[] = [
  SalePaymentMethod.Efectivo,
  SalePaymentMethod.Zelle,
  SalePaymentMethod.Transferencia,
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
 * The rate currently in force per channel (T22, card 1). One row per
 * `(method, currency)`: the most recent row for that channel by the same
 * recency order the history uses. The caller passes ONLY active rows
 * (`isActive !== false`), so the table shows the latest ACTIVE rate of each
 * channel; when that newest row is deactivated, the previous active row takes
 * its place. The append-only history keeps every row.
 */
function latestPerChannel(rates: ChannelRate[]): ChannelRate[] {
  const byChannel = new Map<string, ChannelRate>();
  for (const rate of rates) {
    const key = channelKey(rate.method, rate.currency);
    if (!byChannel.has(key)) byChannel.set(key, rate);
  }
  return [...byChannel.values()];
}

/**
 * "Tasas de Cambio" register (multipayments). Append-only by contract: a new
 * effective moment is a NEW row, and historical rows are never edited or
 * deleted. Deactivation only flips `isActive` so the row leaves the conversion
 * cascade; it never removes history. Registration happens only through the
 * `+ Tasa` popup; the view shows the rates currently in force (card 1, active
 * rows only) and the full history (card 2). All Spanish copy comes from i18n
 * keys. Every info trigger (`?` in the header and per-row details) opens a
 * popup — never an inline expansion.
 */
export function ChannelRatesPage() {
  const intl = useIntl();
  const formatMessage = useCallback((id: string) => intl.formatMessage({ id }), [intl]);
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');

  const [records, setRecords] = useState<ChannelRate[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [detailsRate, setDetailsRate] = useState<ChannelRate | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<ChannelRate | null>(null);
  const [method, setMethod] = useState<SalePaymentMethod>(SalePaymentMethod.Efectivo);
  const [currency, setCurrency] = useState<Currency>(Currency.CUP);
  const [valueDraft, setValueDraft] = useState('');
  const [effectiveFromDraft, setEffectiveFromDraft] = useState(() => toLocalDayKey(new Date()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [savedMessage, setSavedMessage] = useState(false);
  const savedMessageTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // The success banner auto-hides after 3s. A pending timer is cleared before a
  // new one is scheduled (so a fast second submit cannot leave the earlier
  // timer alive) and on unmount (so no timer fires against a dead component).
  useEffect(
    () => () => {
      if (savedMessageTimer.current !== undefined) clearTimeout(savedMessageTimer.current);
    },
    [],
  );

  const load = useCallback(() => {
    if (!storeId) return;
    const svc = new ChannelRateOfflineService(storeId);
    setRecords(sortByRecency(svc.getStorageChannelRates()));
  }, [storeId]);

  useEffect(() => {
    load();
  }, [load]);

  // Card 1: the latest ACTIVE rate per channel (deactivated rows never show
  // here; the previous active row of the channel takes over after a
  // deactivation).
  const currentRates = useMemo(
    () => latestPerChannel(records.filter((rate) => rate.isActive !== false)),
    [records],
  );

  // Only real channels are offered: the method selector is limited to the
  // methods that exist for the chosen currency, so Zelle+CUP or Efectivo+MLC
  // can never be picked.
  const methodOptions = METHOD_OPTIONS.filter((option) => isValidChannel(option, currency));

  function handleCurrencyChange(next: Currency) {
    setCurrency(next);
    // Re-pin the method when the new currency does not support the current one.
    setMethod((current) =>
      isValidChannel(current, next) ? current : defaultPaymentMethodForCurrency(next),
    );
  }

  function openRegisterDialog() {
    setError(undefined);
    setFormOpen(true);
  }

  /** Details + dates of a row, as the `?` popup content of both tables. */
  function detailsText(record: ChannelRate): string {
    const created = record.createdDate ? toLocalDayKey(record.createdDate) : '—';
    const status = formatMessage(
      record.isActive === false ? 'CHANNEL_RATES.INACTIVE_STATUS' : 'CHANNEL_RATES.ACTIVE_STATUS',
    );
    return [
      channelLabel(record.method, record.currency, formatMessage),
      `${formatMessage('CHANNEL_RATES.VALUE_LABEL')}: ${record.value}`,
      `${formatMessage('CHANNEL_RATES.EFFECTIVE_FROM_LABEL')}: ${toLocalDayKey(record.effectiveFrom)}`,
      `${formatMessage('CHANNEL_RATES.CREATED_DATE_COLUMN')}: ${created}`,
      `${formatMessage('CHANNEL_RATES.STATUS_COLUMN')}: ${status}`,
    ].join(' · ');
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
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

    // Defensive guard: the selector already offers only real channels, but no
    // caller may register a pair that does not exist.
    if (!isValidChannel(method, currency)) {
      setError(intl.formatMessage({ id: 'CHANNEL_RATES.INVALID_CHANNEL' }));
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
    setFormOpen(false);
    setSavedMessage(true);
    if (savedMessageTimer.current !== undefined) clearTimeout(savedMessageTimer.current);
    savedMessageTimer.current = setTimeout(() => setSavedMessage(false), 3000);
  }

  // Deactivate a stored row (T19b) after the confirmation popup. Registration
  // stays append-only: this only flips the usability flag, so the row leaves
  // the conversion cascade while remaining visible in the history. The "Tasas
  // Vigentes" table then resolves the channel to its latest ACTIVE row.
  function handleDeactivate(record: ChannelRate) {
    if (!record.id) return;
    setDeactivateTarget(null);
    const svc = new ChannelRateOfflineService(storeId);
    const result = svc.setChannelRateActive(record.id, false);
    if (!result.succeeded) {
      setError(intl.formatMessage({ id: 'CHANNEL_RATES.TOGGLE_ERROR' }));
      return;
    }
    load();
  }

  return (
    <div className="space-y-3 p-2 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-lg font-semibold sm:text-xl">
          {intl.formatMessage({ id: 'CHANNEL_RATES.TITLE' })}
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            aria-label={intl.formatMessage({ id: 'CHANNEL_RATES.HELP_LABEL' })}
            title={intl.formatMessage({ id: 'CHANNEL_RATES.HELP_LABEL' })}
            className="rounded p-1 text-text-muted hover:bg-surface-hover"
            data-testid="channel-rate-help"
          >
            <HelpIcon className="h-5 w-5" />
          </button>
        </h1>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="fab"
            onClick={openRegisterDialog}
            className="px-3 py-2 sm:px-5 sm:py-3"
            data-testid="channel-rate-add"
          >
            <PlusIcon className="h-4 w-4" />
            {intl.formatMessage({ id: 'CHANNEL_RATES.ADD_RATE' })}
          </Button>
        </div>
      </div>

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

      <Card title={intl.formatMessage({ id: 'CHANNEL_RATES.CURRENT_TITLE' })} padding="tight">
        {currentRates.length === 0 ? (
          <p className="p-2 text-sm text-text-muted" data-testid="channel-rate-current-empty">
            {intl.formatMessage({ id: 'CHANNEL_RATES.NO_CURRENT_RECORDS' })}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-text-muted">
                  <th className="px-2 py-1.5">
                    {intl.formatMessage({ id: 'CHANNEL_RATES.CHANNEL_COLUMN' })}
                  </th>
                  <th className="px-2 py-1.5">
                    {intl.formatMessage({ id: 'CHANNEL_RATES.VALUE_COLUMN' })}
                  </th>
                  {/* Deactivate column: no header text by design. */}
                  <th className="px-2 py-1.5" />
                  <th className="px-2 py-1.5">
                    {intl.formatMessage({ id: 'CHANNEL_RATES.DETAILS_COLUMN' })}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {currentRates.map((record, index) => {
                  const rowKey = record.id ?? String(index);
                  return (
                    <tr
                      key={rowKey}
                      data-testid={`channel-rate-current-row-${rowKey}`}
                    >
                      <td className="px-2 py-1.5 text-text">
                        {channelLabel(record.method, record.currency, formatMessage)}
                      </td>
                      <td className="px-2 py-1.5 text-text">{record.value}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setDeactivateTarget(record)}
                          aria-label={intl.formatMessage({ id: 'CHANNEL_RATES.DEACTIVATE' })}
                          title={intl.formatMessage({ id: 'CHANNEL_RATES.DEACTIVATE' })}
                          className="rounded p-1 text-text-muted hover:bg-surface-hover hover:text-danger"
                          data-testid={`channel-rate-current-deactivate-${rowKey}`}
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setDetailsRate(record)}
                          aria-label={intl.formatMessage({ id: 'CHANNEL_RATES.DETAILS_LABEL' })}
                          title={intl.formatMessage({ id: 'CHANNEL_RATES.DETAILS_LABEL' })}
                          className="rounded p-1 text-text-muted hover:bg-surface-hover"
                          data-testid={`channel-rate-current-details-${rowKey}`}
                        >
                          <HelpIcon className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={intl.formatMessage({ id: 'CHANNEL_RATES.HISTORY_TITLE' })} padding="tight">
        {records.length === 0 ? (
          <p className="p-2 text-sm text-text-muted" data-testid="channel-rate-empty">
            {intl.formatMessage({ id: 'CHANNEL_RATES.NO_RECORDS' })}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-text-muted">
                  <th className="px-2 py-1.5">
                    {intl.formatMessage({ id: 'CHANNEL_RATES.CHANNEL_COLUMN' })}
                  </th>
                  <th className="px-2 py-1.5">
                    {intl.formatMessage({ id: 'CHANNEL_RATES.VALUE_COLUMN' })}
                  </th>
                  <th className="px-2 py-1.5">
                    {intl.formatMessage({ id: 'CHANNEL_RATES.DETAILS_COLUMN' })}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {records.map((record, index) => {
                  const rowKey = record.id ?? String(index);
                  const inactive = record.isActive === false;
                  return (
                    <tr
                      key={rowKey}
                      data-testid={`channel-rate-row-${rowKey}`}
                      className={inactive ? 'opacity-60' : undefined}
                    >
                      <td className="px-2 py-1.5 text-text">
                        {channelLabel(record.method, record.currency, formatMessage)}
                      </td>
                      <td className="px-2 py-1.5 text-text">{record.value}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setDetailsRate(record)}
                          aria-label={intl.formatMessage({ id: 'CHANNEL_RATES.DETAILS_LABEL' })}
                          title={intl.formatMessage({ id: 'CHANNEL_RATES.DETAILS_LABEL' })}
                          className="rounded p-1 text-text-muted hover:bg-surface-hover"
                          data-testid={`channel-rate-details-${rowKey}`}
                        >
                          <HelpIcon className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Registration popup (T22). */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={intl.formatMessage({ id: 'CHANNEL_RATES.FORM_TITLE' })}
        testId="channel-rate-add-dialog"
      >
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
              {methodOptions.map((option) => (
                <option key={option} value={option}>
                  {channelLabel(option, currency, formatMessage)}
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
              onChange={(e) => handleCurrencyChange(Number(e.target.value) as Currency)}
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
      </Modal>

      {/* Header help popup — explains what the rate value means. */}
      <Modal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title={intl.formatMessage({ id: 'CHANNEL_RATES.HELP_LABEL' })}
        testId="channel-rate-help-dialog"
      >
        <p className="text-sm text-text-muted" data-testid="channel-rate-help-text">
          {intl.formatMessage({ id: 'CHANNEL_RATES.HELP' })}
        </p>
      </Modal>

      {/* Per-row details popup (both tables). */}
      <Modal
        open={detailsRate !== null}
        onClose={() => setDetailsRate(null)}
        title={intl.formatMessage({ id: 'CHANNEL_RATES.DETAILS_LABEL' })}
        testId="channel-rate-details-dialog"
      >
        <p className="text-sm text-text-muted" data-testid="channel-rate-details-text">
          {detailsRate ? detailsText(detailsRate) : ''}
        </p>
      </Modal>

      {/* Deactivate confirmation — deactivation is NOT a delete: the row stays
          in the append-only history and the channel resolves to its latest
          active rate. */}
      <ConfirmDialog
        open={deactivateTarget !== null}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={() => {
          if (deactivateTarget) handleDeactivate(deactivateTarget);
        }}
        title={intl.formatMessage({ id: 'CHANNEL_RATES.DEACTIVATE_CONFIRM_TITLE' })}
        description={intl.formatMessage({ id: 'CHANNEL_RATES.DEACTIVATE_CONFIRM_MESSAGE' })}
        confirmLabel={intl.formatMessage({ id: 'CHANNEL_RATES.DEACTIVATE' })}
        confirmIntent="warning"
      />
    </div>
  );
}

export default ChannelRatesPage;