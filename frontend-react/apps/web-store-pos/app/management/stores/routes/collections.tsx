import { useState, useEffect, useCallback } from 'react';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { resellerFeatureLoader } from '~/auth/routes/loaders';
import { storeHttpService } from '~/management/stores/lib/services/store-http-service';
import { PaymentConfirmModal } from '~/management/stores/components/payment-confirm-modal';
import { CollectionModuleBreakdownModal } from '~/management/stores/components/collection-module-breakdown-modal';
import { httpErrorKey } from '~/shared/lib/http/http-error';
import { formatCurrency } from '~/shared/lib/format-currency';
import { formatDateOnly } from '~/shared/lib/date-utils';
import { Button } from '~/shared/components/ui/button';
import { InfoIcon } from '~/shared/components/ui/icons';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import type { StoreModulePricingReadRow, StoreToCollect } from '@store-mgmt/domain';

// Req: Route Gating is Reseller Feature Loader, Not Admin Feature Loader — mirrors
// backend [HasPermission(StoreRoleFeatures.StorePaymentAdmin)] (roles {SuperAdmin,
// ReSeller} + FeatureType.StorePayment = 91). Same role set as owner-list.tsx, but a
// DIFFERENT feature id — do not conflate with EFeatures.Owners.
export const clientLoader = resellerFeatureLoader([EFeatures.StorePayment]);

/** Empty text -> null; a non-finite value -> null. Optional popup values are never guessed. */
function toOptionalNumber(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Two decimals — the money precision the popup shows and the payment stores. */
function toMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Read-only projection of backend-computed collections state (design.md — the
 * client adds zero entitlement/billing math). "Registrar pago" opens a confirmation popup
 * with the charged amount and the two OPTIONAL values (exchange rate, total paid); confirming
 * registers the payment then reloads the list.
 */
export function CollectionsPage() {
  const intl = useIntl();
  const user = useAuthStore((s) => s.user);
  // The breakdown is the SuperAdmin's audit view of a store's module prices — the endpoint it
  // reuses is SuperAdmin-only, so every other role keeps the plain amount column (S4).
  const canSeeBreakdown = user?.isSuperAdmin === true;
  const [rows, setRows] = useState<StoreToCollect[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  // Register-payment popup. The row under confirmation owns the amount; the route owns
  // the two optional values so the modal stays presentational.
  const [confirmRow, setConfirmRow] = useState<StoreToCollect | null>(null);
  const [rate, setRate] = useState('');
  const [totalPaid, setTotalPaid] = useState('');
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');
  // Module-breakdown popup. Same split: the row names the store, the route owns the fetch
  // and its loading/error state.
  const [breakdownRow, setBreakdownRow] = useState<StoreToCollect | null>(null);
  const [breakdownRows, setBreakdownRows] = useState<StoreModulePricingReadRow[]>([]);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [breakdownError, setBreakdownError] = useState<string | undefined>(undefined);

  const loadRows = useCallback(async () => {
    try {
      const res = await storeHttpService.getStoresToCollect();
      if (!res.succeeded) {
        setError(intl.formatMessage({ id: 'BILLING.COLLECTIONS.ERROR' }));
        return;
      }
      setRows(res.data);
      setError(undefined);
    } catch (error) {
      setError(intl.formatMessage({ id: httpErrorKey(error, 'BILLING.COLLECTIONS.ERROR') }));
    }
  }, [intl]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  function openConfirm(row: StoreToCollect) {
    setConfirmRow(row);
    setRate('');
    setTotalPaid('');
    setModalError('');
  }

  function closeConfirm() {
    if (saving) return;
    setConfirmRow(null);
    setModalError('');
  }

  async function openBreakdown(row: StoreToCollect) {
    setBreakdownRow(row);
    setBreakdownRows([]);
    setBreakdownError(undefined);
    setBreakdownLoading(true);
    try {
      const res = await storeHttpService.getStoreModulePricing(row.storeId);
      if (!res.succeeded) {
        setBreakdownError(
          intl.formatMessage({ id: 'BILLING.COLLECTIONS.MODULE_BREAKDOWN_ERROR' }),
        );
        return;
      }
      setBreakdownRows(res.data.modules);
    } catch (error) {
      setBreakdownError(
        intl.formatMessage({
          id: httpErrorKey(error, 'BILLING.COLLECTIONS.MODULE_BREAKDOWN_ERROR'),
        }),
      );
    } finally {
      setBreakdownLoading(false);
    }
  }

  function closeBreakdown() {
    setBreakdownRow(null);
    setBreakdownRows([]);
    setBreakdownError(undefined);
    setBreakdownLoading(false);
  }

  /**
   * Typing the rate recomputes the total (`amount × rate`) so the operator sees the CUP
   * amount immediately; the field stays editable, so the last value typed is what is stored.
   * Clearing the rate leaves the total as the operator left it.
   */
  function handleRateChange(value: string) {
    setRate(value);
    if (!confirmRow) return;
    const parsed = toOptionalNumber(value);
    if (parsed !== null && parsed > 0) {
      setTotalPaid(String(toMoney(confirmRow.amount * parsed)));
    }
  }

  async function handleConfirm() {
    if (!confirmRow || saving) return;
    setModalError('');
    setSaving(true);
    try {
      const saved = await storeHttpService.registerStorePayment(confirmRow.storeId, {
        exchangeRate: toOptionalNumber(rate),
        amountPaid: toOptionalNumber(totalPaid),
      });
      if (!saved.succeeded) {
        setModalError(intl.formatMessage({ id: 'BILLING.COLLECTIONS.ERROR' }));
        return;
      }
      setConfirmRow(null);
      await loadRows();
    } catch (error) {
      setModalError(intl.formatMessage({ id: httpErrorKey(error, 'BILLING.COLLECTIONS.ERROR') }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {intl.formatMessage({ id: 'BILLING.COLLECTIONS.TITLE' })}
        </h1>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-text-muted">
          {intl.formatMessage({ id: 'BILLING.COLLECTIONS.EMPTY_STATE' })}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-background">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-text-muted">
                  {intl.formatMessage({ id: 'BILLING.COLLECTIONS.STORE' })}
                </th>
                <th className="px-4 py-2 text-left font-medium text-text-muted">
                  {intl.formatMessage({ id: 'BILLING.COLLECTIONS.OWNER' })}
                </th>
                <th className="px-4 py-2 text-right font-medium text-text-muted">
                  {intl.formatMessage({ id: 'BILLING.COLLECTIONS.AMOUNT' })}
                </th>
                <th className="px-4 py-2 text-left font-medium text-text-muted">
                  {intl.formatMessage({ id: 'BILLING.COLLECTIONS.DUE_DATE' })}
                </th>
                <th className="px-4 py-2 text-left font-medium text-text-muted">
                  {intl.formatMessage({ id: 'BILLING.COLLECTIONS.STATUS' })}
                </th>
                <th className="px-4 py-2 text-right font-medium text-text-muted">
                  <span className="sr-only">
                    {intl.formatMessage({ id: 'BILLING.COLLECTIONS.REGISTER_PAYMENT' })}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.storeId} className="hover:bg-background">
                  <td className="px-4 py-3 font-medium text-text">{row.storeName}</td>
                  <td className="px-4 py-3 text-text">{row.ownerName}</td>
                  <td className="px-4 py-3 text-right text-text">
                    <div className="flex items-center justify-end gap-2">
                      {row.baseAmount > row.amount && (
                        <span
                          className="text-danger line-through"
                          data-testid={`collection-amount-base-${row.storeId}`}
                        >
                          {formatCurrency(row.baseAmount)}
                        </span>
                      )}
                      <span data-testid={`collection-amount-${row.storeId}`}>
                        {formatCurrency(row.amount)}
                      </span>
                      {canSeeBreakdown && (
                        <button
                          type="button"
                          onClick={() => openBreakdown(row)}
                          aria-label={intl.formatMessage({
                            id: 'BILLING.COLLECTIONS.MODULE_BREAKDOWN_OPEN',
                          })}
                          data-testid={`collection-breakdown-${row.storeId}`}
                          className="text-text-muted hover:text-text"
                        >
                          <InfoIcon className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text">{formatDateOnly(row.nextDueDate)}</td>
                  <td className="px-4 py-3 text-text">
                    {intl.formatMessage({ id: `BILLING.STATUS.${row.status}` })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="outline" onClick={() => openConfirm(row)}>
                      {intl.formatMessage({ id: 'BILLING.COLLECTIONS.REGISTER_PAYMENT' })}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PaymentConfirmModal
        open={confirmRow !== null}
        storeName={confirmRow?.storeName ?? ''}
        amount={confirmRow?.amount ?? 0}
        rate={rate}
        totalPaid={totalPaid}
        saving={saving}
        error={modalError}
        onRateChange={handleRateChange}
        onTotalPaidChange={setTotalPaid}
        onConfirm={handleConfirm}
        onClose={closeConfirm}
      />

      <CollectionModuleBreakdownModal
        open={breakdownRow !== null}
        storeId={breakdownRow?.storeId ?? null}
        storeName={breakdownRow?.storeName ?? ''}
        rows={breakdownRows}
        loading={breakdownLoading}
        error={breakdownError}
        onClose={closeBreakdown}
      />
    </div>
  );
}

export default CollectionsPage;
