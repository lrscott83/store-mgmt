import { useState, useEffect, useCallback } from 'react';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { resellerFeatureLoader } from '~/auth/routes/loaders';
import { storeHttpService } from '~/management/stores/lib/services/store-http-service';
import { formatCurrency } from '~/shared/lib/format-currency';
import { formatDateOnly } from '~/shared/lib/date-utils';
import { Button } from '~/shared/components/ui/button';
import type { StoreToCollect } from '@store-mgmt/domain';

// Req: Route Gating is Reseller Feature Loader, Not Admin Feature Loader — mirrors
// backend [HasPermission(StoreRoleFeatures.StorePaymentAdmin)] (roles {SuperAdmin,
// ReSeller} + FeatureType.StorePayment = 91). Same role set as owner-list.tsx, but a
// DIFFERENT feature id — do not conflate with EFeatures.Owners.
export const clientLoader = resellerFeatureLoader([EFeatures.StorePayment]);

/**
 * Read-only projection of backend-computed collections state (design.md — the
 * client adds zero entitlement/billing math). "Registrar pago" marks a store's
 * pending payment as collected then reloads the list.
 */
export function CollectionsPage() {
  const intl = useIntl();
  const [rows, setRows] = useState<StoreToCollect[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);

  const loadRows = useCallback(async () => {
    try {
      const res = await storeHttpService.getStoresToCollect();
      setRows(res.data);
      setError(undefined);
    } catch {
      setError(intl.formatMessage({ id: 'BILLING.COLLECTIONS.ERROR' }));
    }
  }, [intl]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  async function handleRegisterPayment(storeId: string) {
    try {
      await storeHttpService.registerStorePayment(storeId);
      await loadRows();
    } catch {
      setError(intl.formatMessage({ id: 'BILLING.COLLECTIONS.ERROR' }));
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
                    {formatCurrency(row.amount)}
                  </td>
                  <td className="px-4 py-3 text-text">{formatDateOnly(row.nextDueDate)}</td>
                  <td className="px-4 py-3 text-text">
                    {intl.formatMessage({ id: `BILLING.STATUS.${row.status}` })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="outline"
                      onClick={() => handleRegisterPayment(row.storeId)}
                    >
                      {intl.formatMessage({ id: 'BILLING.COLLECTIONS.REGISTER_PAYMENT' })}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default CollectionsPage;
