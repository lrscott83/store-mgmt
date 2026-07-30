import { useState, useEffect, useCallback } from 'react';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { resellerFeatureLoader } from '~/auth/routes/loaders';
import { storeHttpService } from '~/management/stores/lib/services/store-http-service';
import { formatCurrency } from '~/shared/lib/format-currency';
import type { ReSellerCommission } from '@store-mgmt/domain';

// Req: Route Gating is Reseller Feature Loader, Not Admin Feature Loader — mirrors
// backend [HasPermission(StoreRoleFeatures.StorePaymentAdmin)] (roles {SuperAdmin,
// ReSeller} + FeatureType.StorePayment = 91). Same gate as collections.tsx; a
// DIFFERENT feature id than admin/owners/routes/owner-list.tsx (EFeatures.Owners).
export const clientLoader = resellerFeatureLoader([EFeatures.StorePayment]);

function formatPeriod(month: number, year: number): string {
  return `${String(month).padStart(2, '0')}/${year}`;
}

/**
 * Read-only projection of backend-computed reseller commission totals
 * (design.md — the client adds zero billing math), grouped by period.
 */
export function ReSellerCommissionsPage() {
  const intl = useIntl();
  const [rows, setRows] = useState<ReSellerCommission[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);

  const loadRows = useCallback(async () => {
    try {
      const res = await storeHttpService.getReSellerCommissions();
      setRows(res.data);
      setError(undefined);
    } catch {
      setError(intl.formatMessage({ id: 'BILLING.COMMISSIONS.ERROR' }));
    }
  }, [intl]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {intl.formatMessage({ id: 'BILLING.COMMISSIONS.TITLE' })}
        </h1>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-text-muted">
          {intl.formatMessage({ id: 'BILLING.COMMISSIONS.EMPTY_STATE' })}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-background">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-text-muted">
                  {intl.formatMessage({ id: 'BILLING.COMMISSIONS.PERIOD' })}
                </th>
                <th className="px-4 py-2 text-right font-medium text-text-muted">
                  {intl.formatMessage({ id: 'BILLING.COMMISSIONS.PAYMENT_COUNT' })}
                </th>
                <th className="px-4 py-2 text-right font-medium text-text-muted">
                  {intl.formatMessage({ id: 'BILLING.COMMISSIONS.TOTAL' })}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={`${row.year}-${row.month}`} className="hover:bg-background">
                  <td className="px-4 py-3 font-medium text-text">
                    {formatPeriod(row.month, row.year)}
                  </td>
                  <td className="px-4 py-3 text-right text-text">{row.paymentCount}</td>
                  <td className="px-4 py-3 text-right text-text">
                    {formatCurrency(row.totalCommission)}
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

export default ReSellerCommissionsPage;
